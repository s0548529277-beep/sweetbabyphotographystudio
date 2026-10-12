// Server-only helper: uploads files to the studio owner's Google Drive
// through the linked Lovable connector gateway — same pattern as
// calendar.server.ts (the gateway holds the OAuth grant and refreshes it
// automatically, so there are no client id/secret/refresh-token secrets to
// manage here). GOOGLE_DRIVE_API_KEY is a SEPARATE connection from Gmail —
// connecting Gmail does not automatically grant Drive access, so this stays
// unusable (clear error, not a crash) until a "Google Drive" connector is
// linked in Connectors and that env var actually exists.
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_drive";

function gatewayHeaders(): Record<string, string> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lovableKey || !connKey) {
    throw new Error("Missing LOVABLE_API_KEY / GOOGLE_DRIVE_API_KEY — Google Drive connection is not linked.");
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connKey,
  };
}

export function isDriveConfigured(): boolean {
  return !!(process.env.LOVABLE_API_KEY && process.env.GOOGLE_DRIVE_API_KEY);
}

/** Finds (or creates) a top-level Drive folder by exact name — so backups land in one place instead of scattering into the Drive root. Reused on every call rather than cached, since this runs at most a few times a day. */
async function findOrCreateFolder(name: string): Promise<string> {
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchRes = await fetch(`${GATEWAY_URL}/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: gatewayHeaders(),
  });
  if (searchRes.ok) {
    const json = await searchRes.json().catch(() => null);
    const existing = json?.files?.[0]?.id;
    if (existing) return existing;
  }
  const createRes = await fetch(`${GATEWAY_URL}/drive/v3/files`, {
    method: "POST",
    headers: { ...gatewayHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" }),
  });
  const text = await createRes.text();
  if (!createRes.ok) throw new Error(`Drive folder create failed (${createRes.status}): ${text}`);
  const json = JSON.parse(text);
  return json.id;
}

/**
 * Uploads a text file (CSV, etc.) to Drive inside the given folder name —
 * creates the folder on first use. Uses the standard Drive v3 multipart
 * upload (metadata JSON part + content part in one request), the documented
 * way to set the filename and content together in a single call.
 */
export async function uploadTextFileToDrive(
  filename: string,
  content: string,
  folderName: string,
  mimeType = "text/csv",
): Promise<{ id: string } | null> {
  const folderId = await findOrCreateFolder(folderName);
  const metadata = { name: filename, parents: [folderId] };
  const boundary = `sweetbaby-${Date.now()}`;
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;

  const res = await fetch(`${GATEWAY_URL}/upload/drive/v3/files?uploadType=multipart`, {
    method: "POST",
    headers: { ...gatewayHeaders(), "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[SWEETBABY] Drive upload failed [${res.status}]: ${text}`);
    throw new Error(`Drive upload failed (${res.status}): ${text}`);
  }
  const json = JSON.parse(text);
  return { id: json.id };
}

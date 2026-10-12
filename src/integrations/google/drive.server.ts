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

/** Finds a file by exact name inside a specific folder id — used so a repeat backup updates the same file instead of piling up a new one every run. */
async function findFileInFolder(name: string, folderId: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`);
  const res = await fetch(`${GATEWAY_URL}/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: gatewayHeaders(),
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  return json?.files?.[0]?.id ?? null;
}

/**
 * Uploads a text file (CSV, etc.) to Drive inside the given folder name —
 * creates the folder on first use. If a file with the same name already
 * exists in that folder, its content is REPLACED in place (same file id,
 * same link) instead of creating a new one — so a daily backup updates one
 * standing file per category rather than piling up a dated file every day.
 *
 * When `convertToSheet` is true, a newly-created file's `mimeType` is set to
 * the Google Sheets type while the content part stays `text/csv` — Drive's
 * documented behavior is to import/convert the uploaded CSV into a native,
 * directly-editable Google Sheet instead of storing it as a flat text file
 * (same mechanism as dragging a .csv into Drive with "Convert uploads"
 * turned on). On an update to an existing file, the same conversion applies
 * automatically from its already-set Sheets mimeType — only the content is
 * re-sent.
 */
export async function uploadTextFileToDrive(
  filename: string,
  content: string,
  folderName: string,
  mimeType = "text/csv",
  convertToSheet = false,
): Promise<{ id: string } | null> {
  const folderId = await findOrCreateFolder(folderName);
  const existingId = await findFileInFolder(filename, folderId);

  if (existingId) {
    const res = await fetch(`${GATEWAY_URL}/upload/drive/v3/files/${existingId}?uploadType=media`, {
      method: "PATCH",
      headers: { ...gatewayHeaders(), "Content-Type": mimeType },
      body: content,
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[SWEETBABY] Drive update failed [${res.status}]: ${text}`);
      throw new Error(`Drive update failed (${res.status}): ${text}`);
    }
    return { id: existingId };
  }

  const metadata = {
    name: filename,
    parents: [folderId],
    ...(convertToSheet ? { mimeType: "application/vnd.google-apps.spreadsheet" } : {}),
  };
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

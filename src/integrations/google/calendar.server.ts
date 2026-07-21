// Server-only helper: creates events on the studio owner's real Google Calendar.
// Uses a one-time OAuth refresh token (obtained once by the owner) to mint
// short-lived access tokens on demand — no user-facing Google login flow needed
// for customers; this always writes to the OWNER's calendar.
//
// Required environment variables (set these in Lovable Cloud → Settings → Environment):
//   GOOGLE_CALENDAR_CLIENT_ID
//   GOOGLE_CALENDAR_CLIENT_SECRET
//   GOOGLE_CALENDAR_REFRESH_TOKEN
//   GOOGLE_CALENDAR_ID   (optional — defaults to "primary")

type TokenResponse = { access_token: string; expires_in: number; token_type: string };

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const client_id = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const client_secret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const refresh_token = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;

  if (!client_id || !client_secret || !refresh_token) {
    throw new Error(
      "Missing Google Calendar credentials (GOOGLE_CALENDAR_CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN). Set them in Lovable Cloud environment variables."
    );
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id,
      client_secret,
      refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google token refresh failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as TokenResponse;
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

export type CalendarEventInput = {
  summary: string;
  description?: string;
  startISO: string; // full ISO datetime, e.g. 2026-08-01T10:00:00
  endISO: string;
  timeZone?: string; // defaults to Asia/Jerusalem
  location?: string;
};

export async function createGoogleCalendarEvent(input: CalendarEventInput): Promise<{ id: string; htmlLink: string } | null> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  const timeZone = input.timeZone || "Asia/Jerusalem";
  const accessToken = await getAccessToken();

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: input.summary,
        description: input.description,
        location: input.location,
        start: { dateTime: input.startISO, timeZone },
        end: { dateTime: input.endISO, timeZone },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Calendar event creation failed: ${res.status} ${body}`);
  }

  const data = await res.json();
  return { id: data.id, htmlLink: data.htmlLink };
}

// Server-only helper: creates/deletes events on the studio owner's Google
// Calendar through the linked Lovable connector gateway. The gateway holds the
// OAuth grant and refreshes it automatically, so there are no client
// id/secret/refresh-token secrets to expire here.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

function gatewayHeaders(): Record<string, string> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_CALENDAR_API_KEY;
  if (!lovableKey || !connKey) {
    throw new Error("Missing LOVABLE_API_KEY / GOOGLE_CALENDAR_API_KEY — Google Calendar connection is not linked.");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connKey,
  };
}

export type CalendarEventInput = {
  summary: string;
  description?: string;
  startISO: string; // full ISO datetime, e.g. 2026-08-01T10:00:00
  endISO: string;
  timeZone?: string; // defaults to Asia/Jerusalem
  location?: string;
};

export async function createGoogleCalendarEvent(
  input: CalendarEventInput,
): Promise<{ id: string; htmlLink: string } | null> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  const timeZone = input.timeZone || "Asia/Jerusalem";

  const res = await fetch(`${GATEWAY_URL}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: gatewayHeaders(),
    body: JSON.stringify({
      summary: input.summary,
      description: input.description,
      location: input.location,
      start: { dateTime: input.startISO, timeZone },
      end: { dateTime: input.endISO, timeZone },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Calendar event creation failed: ${res.status} ${body}`);
  }

  const data = await res.json();
  return { id: data.id, htmlLink: data.htmlLink };
}

export async function deleteGoogleCalendarEvent(eventId: string): Promise<void> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  const res = await fetch(
    `${GATEWAY_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: gatewayHeaders() },
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    console.error("[SWEETBABY] gcal delete error", res.status, await res.text().catch(() => ""));
  }
}

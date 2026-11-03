/**
 * Browser side of the streaming chat (see chat-stream.server.ts for the wire
 * format). Returns the final result, or null when the stream could not even be
 * opened — the caller then uses the normal chatWithBot server function. If the
 * stream opened but broke before the final event it throws instead of
 * returning null, so the caller does NOT re-run a turn that may already have
 * had side effects (e.g. a booking).
 */
import { getVisitorId } from "@/lib/visitor-id";

export type StreamedChatResult = { reply: string; ui?: any; isAdmin?: boolean };

export async function streamChatReply(
  payload: unknown,
  onText: (text: string) => void,
): Promise<StreamedChatResult | null> {
  const res = await fetch("/api/chat-stream", {
    method: "POST",
    // The tools that create a booking / order run inside this request and read the caller from the
    // Authorization header, so send the same token the body carries.
    headers: {
      "Content-Type": "application/json",
      ...((payload as any)?.accessToken ? { Authorization: `Bearer ${(payload as any).accessToken}` } : {}),
      // Lets bookings / orders the bot places inside the chat be tied to this visitor's history (consent only).
      ...(getVisitorId() ? { "x-visitor-id": getVisitorId() as string } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok || !res.body) return null;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let started = false;
  let final: StreamedChatResult | null = null;
  let failed = false;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let event: any;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      started = true;
      if (event.t === "d" && typeof event.v === "string") {
        text += event.v;
        onText(text);
      } else if (event.t === "r") {
        text = "";
        onText("");
      } else if (event.t === "f") {
        final = { reply: String(event.reply ?? ""), ui: event.ui, isAdmin: event.isAdmin };
      } else if (event.t === "x") {
        failed = true;
      }
    }
  }

  if (final) return final;
  if (!started) return null;
  throw new Error(failed ? "chat stream failed" : "chat stream interrupted");
}

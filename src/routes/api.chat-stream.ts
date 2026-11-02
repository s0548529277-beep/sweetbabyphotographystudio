import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { handleChatStream } from "@/lib/chat-stream.server";

// Streaming endpoint for the site chat bubble (see chat-stream.server.ts for
// the wire format). Public like the chat itself: who the visitor really is
// gets decided from the verified token inside prepareChatTurn, never from
// anything in the body.
export const Route = createFileRoute("/api/chat-stream")({
  server: {
    handlers: {
      POST: async ({ request }) => handleChatStream(request),
    },
  },
});

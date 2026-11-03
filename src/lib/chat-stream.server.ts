import { stepCountIs, streamText } from "ai";
import { ChatInput, emptyReplyFallback, finishChatTurn, prepareChatTurn } from "./ai.functions";
import { generateTextLovable, getLovableChatModel, LOVABLE_CHAT_PROVIDER_OPTIONS, wordAnswerFromToolResults } from "./ai-gateway.server";

/**
 * Streaming version of the site chat (2026-11-02, owner request: "show the
 * answer as it is being written").
 *
 * Wire format: newline-delimited JSON, one event per line —
 *   {"t":"s"}                        stream opened (keeps the connection alive while tools run)
 *   {"t":"d","v":"text"}             more text of the current answer
 *   {"t":"r"}                        clear what was shown (a new model step began, or we fell back)
 *   {"t":"f","reply","ui","isAdmin"} final, authoritative result — same shape chatWithBot returns
 *   {"t":"x"}                        failed (client shows its normal "busy" message)
 *
 * Same prompt, tools, admin check, logging and UI cards as chatWithBot (both
 * use prepareChatTurn / finishChatTurn). Model: the Lovable AI Gateway only (no provider switching — owner request
 * 2026-11-02). If the stream fails before it produced an answer, this retries
 * once without streaming (generateTextLovable) and sends the answer in one piece.
 */
const STREAM_TIMEOUT_MS = 35_000;

export async function handleChatStream(request: Request): Promise<Response> {
  let data: ReturnType<typeof ChatInput.parse>;
  try {
    data = ChatInput.parse(await request.json());
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // client went away — keep going so the chat is still logged
        }
      };
      send({ t: "s" });
      try {
        const turn = await prepareChatTurn(data);
        let text = "";
        let steps: any[] = [];
        let streamed = false;

        let model: ReturnType<typeof getLovableChatModel> | null = null;
        try {
          model = getLovableChatModel();
        } catch (e) {
          console.error("[SWEETBABY] chat stream: Lovable AI model unavailable", e);
        }
        if (model) {
          try {
            const result = streamText({
              model,
              providerOptions: LOVABLE_CHAT_PROVIDER_OPTIONS,
              system: turn.system,
              messages: data.messages,
              tools: turn.tools,
              stopWhen: stepCountIs(turn.maxSteps),
              abortSignal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
              maxRetries: 0,
              onError: () => {
                // surfaced as an "error" part below
              },
            });
            let stepText = "";
            let failed = false;
            for await (const part of result.fullStream) {
              if (part.type === "start-step") {
                // A new model step (after a tool call) — drop the previous step's text so only the final answer remains.
                if (stepText) send({ t: "r" });
                stepText = "";
              } else if (part.type === "text-delta") {
                stepText += part.text;
                send({ t: "d", v: part.text });
              } else if (part.type === "error") {
                failed = true;
                console.error("[SWEETBABY] chat stream error part", part.error);
              }
            }
            if (!failed && stepText.trim()) {
              text = stepText;
              steps = (await result.steps) as any[];
              streamed = true;
            } else if (!failed) {
              // Tools ran but the last step had no text: word the answer from their results instead of re-running them.
              steps = (await result.steps) as any[];
              const respMessages = ((await result.response) as any)?.messages ?? [];
              const worded = await wordAnswerFromToolResults(turn.system, data.messages, respMessages, turn.tools as any);
              if (worded.trim()) {
                send({ t: "r" });
                send({ t: "d", v: worded });
                text = worded;
                streamed = true;
              }
            }
          } catch (e) {
            console.error("[SWEETBABY] chat stream failed, falling back to non-streaming", e);
          }
        }

        if (!streamed) {
          send({ t: "r" });
          const result = await generateTextLovable({
            system: turn.system,
            messages: data.messages,
            tools: turn.tools,
            stopWhen: stepCountIs(turn.maxSteps),
          });
          text = result.text;
          steps = (result.steps ?? []) as any[];
        }

        const ui = await finishChatTurn({
          data,
          text,
          steps,
          isAdmin: turn.isAdmin,
          realUserId: turn.realUserId,
        });
        send({ t: "f", reply: text.trim() ? text : emptyReplyFallback(ui), ui, isAdmin: turn.isAdmin });
      } catch (e) {
        console.error("[SWEETBABY] chat stream request failed", e);
        send({ t: "x" });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

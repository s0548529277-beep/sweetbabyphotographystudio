// Auto-reply bot for the WhatsApp channel — reuses the exact same AI prompt
// and tools as the site-chat bot (SYSTEM + buildToolRules + buildAssistantTools
// in ai.functions.ts / ai-tools.server.ts) so a change to either one keeps
// both channels in sync automatically. See AGENTS.md's "phone voice bot" note
// for the parallel pattern on the Twilio/Yemot phone lines — this is the
// third channel sharing the same conversation logic.
//
// Per-phone state lives in whatsapp_bot_sessions (messages history,
// handoff_requested_at) — a small rolling window, not the full
// whatsapp_messages log, so the AI prompt doesn't grow unbounded.
import { stepCountIs } from "ai";
import { generateTextResilient } from "./ai-gateway.server";
import { buildAssistantTools } from "./ai-tools.server";
import { SYSTEM, buildToolRules } from "./ai.functions";
import { sendWhatsAppText } from "./whatsapp.server";

const STUDIO_EMAIL = "s0548529277@gmail.com";
const MAX_HISTORY_MESSAGES = 20;

type HistoryMsg = { role: "user" | "assistant"; content: string };

// Narrow, explicit phrase list — same reasoning as wantsToBookNow in
// voice-menu.server.ts: a customer asking for a real person should reliably
// hand off, not depend on the AI's own judgement call on that specific turn.
const HANDOFF_PHRASES = [
  "מיכל",
  "נציג",
  "נציגה",
  "בן אדם",
  "בנאדם",
  "אדם אמיתי",
  "לדבר עם מישהי",
  "לדבר עם בן אדם",
  "לדבר איתך",
  "רוצה לדבר עם אדם",
  "רוצה אדם",
];

export function wantsHumanHandoff(text: string): boolean {
  const normalized = text.trim();
  return HANDOFF_PHRASES.some((p) => normalized.includes(p));
}

// Lets a customer explicitly restart the conversation — e.g. after a long
// gap, or if the bot got confused on a previous thread — without needing an
// admin to clear anything. Per owner's explicit request alongside this
// feature: "ואפשרות לפתוח שיחה חדשה" (also give an option to start a new
// conversation).
const NEW_CONVERSATION_PHRASES = [
  "שיחה חדשה",
  "התחל שיחה חדשה",
  "התחילי שיחה חדשה",
  "להתחיל מחדש",
  "תתחילי מחדש",
  "אפשר להתחיל מחדש",
  "איפוס שיחה",
  "לאפס את השיחה",
];

export function wantsNewConversation(text: string): boolean {
  const normalized = text.trim();
  return NEW_CONVERSATION_PHRASES.some((p) => normalized.includes(p));
}

async function loadSession(
  supabaseAdmin: any,
  phone: string,
): Promise<{ messages: HistoryMsg[]; handoffRequestedAt: string | null }> {
  const { data } = await supabaseAdmin
    .from("whatsapp_bot_sessions")
    .select("messages, handoff_requested_at")
    .eq("phone", phone)
    .maybeSingle();
  return {
    messages: Array.isArray(data?.messages) ? (data.messages as HistoryMsg[]) : [],
    handoffRequestedAt: data?.handoff_requested_at ?? null,
  };
}

async function saveSession(
  supabaseAdmin: any,
  phone: string,
  messages: HistoryMsg[],
  handoffRequestedAt: string | null,
) {
  await supabaseAdmin.from("whatsapp_bot_sessions").upsert(
    {
      phone,
      messages: messages.slice(-MAX_HISTORY_MESSAGES),
      handoff_requested_at: handoffRequestedAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "phone" },
  );
}

async function notifyStudioOfHandoff(phone: string, contactName: string | null, text: string) {
  try {
    const { sendGmail } = await import("@/integrations/google/gmail.server");
    const html = `<p>לקוחה ${contactName ? `<strong>${contactName}</strong> ` : ""}(${phone}) מבקשת לדבר איתך בוואטסאפ ולא עם הבוט.</p><p>ההודעה שלה: "${text}"</p><p>אפשר להשיב לה ישירות מ-/admin/whatsapp.</p>`;
    await sendGmail({ to: STUDIO_EMAIL, subject: `💬 לקוחה מחכה לך בוואטסאפ — ${contactName || phone}`, html });
  } catch (e) {
    console.error("[SWEETBABY] whatsapp handoff email failed", e);
  }
}

/**
 * Runs one auto-reply turn for an incoming WhatsApp text message and sends
 * the reply back over WhatsApp. Called from the webhook handler right after
 * the incoming message is logged. Never throws — a failure here shouldn't
 * fail the whole webhook delivery (the inbound message is already saved).
 */
export async function runWhatsAppBotReply(
  phone: string,
  contactName: string | null,
  incomingText: string,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const session = await loadSession(supabaseAdmin, phone);

    if (wantsNewConversation(incomingText)) {
      await saveSession(supabaseAdmin, phone, [], null);
      const reply = "התחלנו שיחה חדשה 💗 איך אפשר לעזור?";
      const { wamid } = await sendWhatsAppText(phone, reply);
      await logOutgoing(supabaseAdmin, phone, wamid, reply);
      return;
    }

    // Already handed off to Michal — stay silent so she isn't undercut by
    // the bot replying over her while she's handling this herself. An admin
    // clears this from /admin/whatsapp once the conversation is done.
    if (session.handoffRequestedAt) return;

    if (wantsHumanHandoff(incomingText)) {
      const nowIso = new Date().toISOString();
      await saveSession(supabaseAdmin, phone, [...session.messages, { role: "user", content: incomingText }], nowIso);
      await notifyStudioOfHandoff(phone, contactName, incomingText);
      const reply = "בטח 💗 שלחתי הודעה למיכל והיא תחזור אלייך בהקדם. אם זה דחוף אפשר גם להתקשר.";
      const { wamid } = await sendWhatsAppText(phone, reply);
      await logOutgoing(supabaseAdmin, phone, wamid, reply);
      return;
    }

    const { israelNow } = await import("./availability.server");
    const now = israelNow();
    const { getBotKnowledgeText } = await import("./bot-knowledge.functions");
    const extraKnowledge = await getBotKnowledgeText();
    const toolRules = buildToolRules(now);
    const channelNote =
      "\n\nאת עונה כאן בתוך שיחת וואטסאפ, לא באתר — אם צריך לינק לעמוד באתר, כתבי אותו כקישור מלא (https://...) כדי שיהיה אפשר ללחוץ עליו גם מוואטסאפ.";

    const history: HistoryMsg[] = [...session.messages, { role: "user", content: incomingText }];

    const { text } = await generateTextResilient({
      system: SYSTEM + channelNote + toolRules + extraKnowledge,
      // WhatsApp has no real account/login concept here — treated the same
      // as an unauthenticated site visitor (no create_studio_booking access).
      messages: history,
      tools: buildAssistantTools({ isAuthenticated: false }),
      stopWhen: stepCountIs(8),
    });

    const { wamid } = await sendWhatsAppText(phone, text);
    await saveSession(
      supabaseAdmin,
      phone,
      [...history, { role: "assistant", content: text }],
      null,
    );
    await logOutgoing(supabaseAdmin, phone, wamid, text);
  } catch (e) {
    console.error("[SWEETBABY] whatsapp bot reply failed", e);
  }
}

async function logOutgoing(supabaseAdmin: any, phone: string, wamid: string | null, body: string) {
  const { error } = await supabaseAdmin.from("whatsapp_messages").insert({
    wa_message_id: wamid,
    direction: "out",
    phone,
    body,
    status: "sent",
  });
  if (error) console.error("[SWEETBABY] whatsapp bot outgoing log failed", error);
}

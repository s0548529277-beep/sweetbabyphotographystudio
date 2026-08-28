// Server-only: triggers a real, personalized outbound voice call (and
// optionally an SMS in the same request) via ימות המשיח's campaign API —
// used to call a customer right after her booking/order is confirmed, and
// for her chosen reminder, with a short summary + door code.
//
// An earlier one-off test call (studio's own account) suggested the outbound
// call rings and disconnects without actually speaking, and doesn't cost
// units — that assumption turned out to be WRONG (or at least not reliable):
// real Yemot campaign-completion emails from the account (2026-08-28) show
// units being deducted for these calls regardless of whether they were
// answered — sometimes MORE for an unanswered attempt than an answered one.
// So: treat every call through this function as a real, billed unit, not a
// free nudge. The message is ALSO stashed as a "pending" notification (see
// voice-pending-notification.server.ts) and gets delivered for real, once,
// the moment she calls the studio's line back (see api.yemot.ivr.ts's
// first-hit-of-call handling) — that part of the design still holds
// regardless of billing, since it's what makes a failed/unanswered outbound
// leg not lose the message. But don't add new call sites assuming this is
// free; if a call site is admin-facing/low-priority, alsoSms (or dropping
// the call and relying on email + /admin/notifications alone) is likely
// cheaper — ask before adding another automatic voice-call trigger.
//
// NOT YET FULLY VERIFIED AGAINST A LIVE CALL — built from real documentation found
// via web search (the official developer forum, apiforum.yemot.tel, and the
// community forum f2.freeivr.co.il — Yemot doesn't publish a single official
// reference page), not tested against the actual account. Treat this the
// same as the TTLock integration: best-effort, the first real booking is the
// real test, and a failure is logged to admin_notifications instead of
// disappearing into a server log no one can read.
//
// Required secrets (Lovable env vars):
//   YEMOT_SYSTEM_NUMBER — the Yemot system/account number (e.g. "0772249299")
//   YEMOT_SYSTEM_PASSWORD — the password used to log into the ניהול
//     (call2all.co.il) management panel.
//
// Confirmed from documentation (a real example given in the developer forum):
//   GET https://www.call2all.co.il/ym/api/RunCampaign
//     ?token=<systemNumber>:<password>&phones={"<phone>":"<text>"}&withSMS=<0|1>
// `phones` is a JSON object mapping one phone number to the exact text to
// read out (Yemot's own TTS) and, if withSMS=1, also send as an SMS — this
// is the one-off single-recipient form, not the "קמפיין" bulk-broadcast
// tool in the Yemot management UI (which dials a fixed, pre-built
// distribution list — the wrong tool for a per-customer transactional call).
// The response is JSON with a `responseStatus` field: "OK" on success,
// "ERROR" / "FORBIDDEN" / "EXCEPTION" on failure.

const BASE_URL = "https://www.call2all.co.il/ym/api/RunCampaign";

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} — set it in Lovable's environment variables`);
  return v;
}

type YemotCampaignResponse = { responseStatus?: string; message?: string };

/**
 * Places a real outbound call to `phone` that reads `text` aloud, and — if
 * `alsoSms` is true — sends the same text as an SMS in the same request.
 * Never throws: on any failure (missing secrets, network, an API-level
 * error), logs to admin_notifications (visible on /admin/notifications) and
 * returns false — a failure here must never block a booking confirmation.
 */
export async function sendYemotVoiceMessage(opts: {
  phone: string;
  text: string;
  alsoSms?: boolean;
  /** Shown in the admin_notifications title if this fails, e.g. a booking id. */
  label: string;
}): Promise<boolean> {
  // Stored first, unconditionally — so the message is there to be delivered
  // on her next call in even if the outbound "flash" ring below fails
  // outright (no units, network hiccup, wrong credentials). See
  // voice-pending-notification.server.ts / the studio's own confirmed
  // observation: the outbound call rings and disconnects without actually
  // speaking (free, no units spent) — the real message is meant to reach
  // her when she calls the studio's line back, not on this outbound leg.
  try {
    const { setPendingVoiceNotification } = await import("@/lib/voice-pending-notification.server");
    await setPendingVoiceNotification(opts.phone, opts.text);
  } catch (e) {
    console.error("[SWEETBABY] setPendingVoiceNotification (from sendYemotVoiceMessage) failed", e);
  }

  try {
    const systemNumber = requiredEnv("YEMOT_SYSTEM_NUMBER");
    const password = requiredEnv("YEMOT_SYSTEM_PASSWORD");
    const token = `${systemNumber}:${password}`;
    const digits = opts.phone.replace(/\D/g, "");
    const phones = JSON.stringify({ [digits]: opts.text });

    const url = new URL(BASE_URL);
    url.searchParams.set("token", token);
    url.searchParams.set("phones", phones);
    if (opts.alsoSms) url.searchParams.set("withSMS", "1");

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
    const json = (await res.json().catch(() => null)) as YemotCampaignResponse | null;

    if (!res.ok || !json || json.responseStatus !== "OK") {
      throw new Error(`Yemot RunCampaign error: ${res.status} ${JSON.stringify(json)}`);
    }
    return true;
  } catch (e) {
    console.error("[SWEETBABY] Yemot voice message failed", e);
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("admin_notifications").insert({
        type: "yemot_voice_message_error",
        title: `⚠️ הודעה קולית לא נשלחה — ${opts.label}`,
        body: { error: e instanceof Error ? e.message : String(e), phone: opts.phone },
      });
    } catch (e2) {
      console.error("[SWEETBABY] Yemot failure admin_notifications save also failed", e2);
    }
    return false;
  }
}

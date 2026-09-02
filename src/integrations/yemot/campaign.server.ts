// Server-only: triggers a real outbound "צינתוק" (ring-then-hangup, no
// spoken message at all) via ימות המשיח's API — used to call a customer
// right after her booking/order is confirmed, and for her chosen reminder,
// as a pure "please call us back" signal. The actual content (date/time/
// door code/etc.) is never spoken on the outbound leg at all; it's always
// delivered on her callback, via the pending-notification mechanism below.
//
// Switched from RunCampaign (a real, short spoken message) to RunTzintuk
// per explicit request, after real Yemot billing documentation confirmed
// the cost difference: a spoken message (even a few seconds) bills a full
// unit per number, while a tzintuk (no message, just ring+disconnect)
// bills 1/10th of a unit — a 10x saving on every single outbound call on
// this line. The message is ALSO (still, unconditionally) stashed as a
// "pending" notification (see voice-pending-notification.server.ts) and
// delivered in full, once, the moment she calls the studio's line back
// (see api.yemot.ivr.ts's first-hit-of-call handling) — that part of the
// design is what makes an unanswered/never-answered tzintuk still not
// lose the message; it's not a "nice to have", it's the only way the
// content ever reaches her now that the call itself says nothing.
//
// NOT YET VERIFIED AGAINST A LIVE CALL/BILLING STATEMENT — RunTzintuk's
// existence and per-unit cost are confirmed from real Yemot documentation
// (a support answer quoted directly in the message the owner forwarded),
// but every real usage example found for RunTzintuk's `phones` parameter
// references a PRE-SAVED list (`tpl:<id>` / `tzl:<id>`), not a raw ad-hoc
// number — unlike RunCampaign, which has a confirmed raw-JSON single-
// number form. There is no confirmed example of RunTzintuk with a bare
// number for a one-off per-customer call like this app needs (a fresh
// number every time, never a saved list). Implemented here as the most
// API-symmetric guess (a raw digits string, same shape RunCampaign's
// `phones` key takes) — same "best-effort, first real send is the real
// test" treatment as the TTLock integration and RunCampaign originally
// got: if the very first live billing statement/campaign report doesn't
// show tzintuk-rate (0.1 unit) billing for these calls, this needs
// revisiting — likely meaning an ad-hoc list has to be created via a
// separate list-management API call first, rather than passing a bare
// number.
//
// Required secrets (Lovable env vars):
//   YEMOT_SYSTEM_NUMBER — the Yemot system/account number (e.g. "0772249299")
//   YEMOT_SYSTEM_PASSWORD — the password used to log into the ניהול
//     (call2all.co.il) management panel.

const TZINTUK_URL = "https://www.call2all.co.il/ym/api/RunTzintuk";
// Legacy path — a real spoken message via RunCampaign — kept only for the
// (currently unused by any call site) alsoSms combo, since a tzintuk has no
// message/SMS content to send. See sendYemotVoiceMessage's `alsoSms` doc.
const CAMPAIGN_URL = "https://www.call2all.co.il/ym/api/RunCampaign";

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} — set it in Lovable's environment variables`);
  return v;
}

type YemotCampaignResponse = { responseStatus?: string; message?: string };

// Only used on the legacy alsoSms path (see CAMPAIGN_URL above) — a normal
// tzintuk call never speaks anything.
const DEFAULT_SHORT_PING = "שלום, יש לך עדכון מסטודיו סוויט בייבי. תתקשרי בבקשה חזרה למספר הזה לשמיעת הפרטים.";

/**
 * Places a real outbound tzintuk (ring, no message, hangs up) to `phone`.
 * Never throws: on any failure (missing secrets, network, an API-level
 * error), logs to admin_notifications (visible on /admin/notifications) and
 * returns false — a failure here must never block a booking confirmation.
 *
 * `text` is the FULL detailed message (date/time/door code/etc.) — it's
 * never spoken on any outbound call, tzintuk or otherwise; it's stored as a
 * pending notification and delivered in full, verbatim, the moment she
 * calls the studio's line back (either line — Yemot and Twilio both check
 * for one on their first-hit-of-call handling). `outboundText` is now only
 * used on the legacy alsoSms path (see below) — a plain tzintuk call reads
 * nothing at all.
 */
export async function sendYemotVoiceMessage(opts: {
  phone: string;
  text: string;
  /** Only used on the alsoSms path below — ignored for a normal tzintuk call, which speaks nothing. */
  outboundText?: string;
  /** Not currently used by any call site. A tzintuk has no message to combine with an SMS, so this forces the legacy RunCampaign (real spoken message) path instead — see that branch below. */
  alsoSms?: boolean;
  /** Shown in the admin_notifications title if this fails, e.g. a booking id. */
  label: string;
}): Promise<boolean> {
  // Stored first, unconditionally — so the FULL message is there to be
  // delivered on her next call in even if the outbound leg below fails
  // outright (no units, network hiccup, wrong credentials). See
  // voice-pending-notification.server.ts.
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

    const url = new URL(opts.alsoSms ? CAMPAIGN_URL : TZINTUK_URL);
    url.searchParams.set("token", token);
    if (opts.alsoSms) {
      // Legacy path: a real spoken message + SMS, unchanged from before.
      url.searchParams.set("phones", JSON.stringify({ [digits]: opts.outboundText ?? DEFAULT_SHORT_PING }));
      url.searchParams.set("withSMS", "1");
    } else {
      // Tzintuk: ring + hangup, no message — see this file's doc comment
      // for why the raw-digits shape here is a best-effort guess, not a
      // confirmed API example.
      url.searchParams.set("phones", digits);
    }

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
    const json = (await res.json().catch(() => null)) as YemotCampaignResponse | null;

    if (!res.ok || !json || json.responseStatus !== "OK") {
      throw new Error(`Yemot ${opts.alsoSms ? "RunCampaign" : "RunTzintuk"} error: ${res.status} ${JSON.stringify(json)}`);
    }
    return true;
  } catch (e) {
    console.error("[SWEETBABY] Yemot voice message failed", e);
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("admin_notifications").insert({
        type: "yemot_voice_message_error",
        title: `⚠️ צינתוק לא נשלח — ${opts.label}`,
        body: { error: e instanceof Error ? e.message : String(e), phone: opts.phone },
      });
    } catch (e2) {
      console.error("[SWEETBABY] Yemot failure admin_notifications save also failed", e2);
    }
    return false;
  }
}

// Server-only: lets a customer sign in or sign up with her PHONE instead of
// (or alongside) her email, without needing Supabase's own phone-auth
// provider configured on this project (that needs an SMS provider like
// Twilio Verify hooked up in the Supabase dashboard — a separate paid setup
// this app doesn't assume is there). Both work entirely on top of the
// site's existing email+password auth: phone is just resolved to the real
// (or placeholder) email server-side, then a normal email+password
// sign-in/sign-up happens under the hood, and the resulting session is
// handed back to the client to install via supabase.auth.setSession(...).
//
// Same short-numeric-PIN password scheme as the rest of the site
// (see password.ts) — not a new, less secure pattern introduced here.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { MIN_PIN, authPasswordCandidates, toAuthPassword } from "@/lib/password";

function looksLikeEmail(s: string): boolean {
  return s.includes("@");
}

function lastDigits(phone: string, n = 8): string {
  return phone.replace(/\D/g, "").slice(-n);
}

// Fake domain for phone-only signups (no real mailbox — never sent to,
// only used as Supabase's internal identity string). email_confirm: true
// on creation means Supabase never actually tries to deliver anything
// here, so the fake domain doesn't need to exist or accept mail.
const PLACEHOLDER_EMAIL_DOMAIN = "phone.sweetbabyphoto.internal";

function placeholderEmailForPhone(phone: string): string {
  return `p${lastDigits(phone, 10)}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !!email && email.endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}

async function anonClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) throw new Error("Missing SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY");
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

type AuthSession = { access_token: string; refresh_token: string };

/** Matches a phone number against profiles.phone (supabaseAdmin — bypasses RLS, needed pre-login) and returns the account's real userId+email, or null. Shared by sign-in and the phone-call password reset below. */
async function findAccountByPhone(phone: string): Promise<{ userId: string; email: string } | null> {
  const digits = lastDigits(phone);
  if (digits.length < 6) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: candidates } = await supabaseAdmin.from("profiles").select("id, phone").ilike("phone", `%${digits.slice(-6)}%`);
    const match = (candidates ?? []).find((p: any) => lastDigits(String(p.phone ?? "")) === digits);
    if (!match) return null;
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(match.id as string);
    if (!authUser?.user?.email) return null;
    return { userId: match.id as string, email: authUser.user.email };
  } catch (e) {
    console.error("[SWEETBABY] phone→account resolve failed", e);
    return null;
  }
}

/**
 * Resolves an identifier (typed-as-is email, or a phone number) to a real
 * auth email server-side via supabaseAdmin (bypasses RLS — needed since the
 * caller isn't signed in yet), then signs in normally. Never reveals
 * whether the identifier matched an account vs. the password was wrong —
 * same generic error either way, so this can't be used to enumerate which
 * phone numbers/emails have accounts.
 */
export const signInWithPhoneOrEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ identifier: z.string().min(3), password: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; session: AuthSession } | { ok: false; error: string }> => {
    const GENERIC_ERROR = "פרטי ההתחברות שגויים";
    let email = data.identifier.trim();
    if (!looksLikeEmail(email)) {
      const account = await findAccountByPhone(email);
      if (!account) return { ok: false, error: GENERIC_ERROR };
      email = account.email;
    }

    const anon = await anonClient();
    for (const password of authPasswordCandidates(data.password)) {
      const { data: signInData, error } = await anon.auth.signInWithPassword({ email, password });
      if (!error && signInData.session) {
        return { ok: true, session: { access_token: signInData.session.access_token, refresh_token: signInData.session.refresh_token } };
      }
    }
    return { ok: false, error: GENERIC_ERROR };
  });

/**
 * Creates a new account from full name + phone + password, email OPTIONAL —
 * per explicit request. Uses supabaseAdmin.auth.admin.createUser with
 * email_confirm: true (not the client-side signUp flow) specifically so a
 * phone-only signup never depends on a confirmation email actually being
 * delivered/clicked at a placeholder address that receives nothing. Signs
 * the new account in immediately and hands back a session, same shape as
 * signInWithPhoneOrEmail above.
 */
export const signUpWithPhoneOrEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        fullName: z.string().min(1).max(120),
        phone: z.string().min(5).max(40),
        email: z.string().email().max(200).optional(),
        password: z.string().min(MIN_PIN).max(100),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true; session: AuthSession } | { ok: false; error: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Refuse a duplicate phone up front — createUser's own dup-email check
    // wouldn't catch "same phone, different/placeholder email" cases, and a
    // second account under the same phone would confuse everything that
    // recognizes callers/customers by phone (voice-caller.server.ts etc.).
    const digits = lastDigits(data.phone);
    if (digits.length >= 6) {
      const { data: candidates } = await supabaseAdmin.from("profiles").select("id, phone").ilike("phone", `%${digits.slice(-6)}%`);
      const dup = (candidates ?? []).find((p: any) => lastDigits(String(p.phone ?? "")) === digits);
      if (dup) return { ok: false, error: "כבר יש חשבון עם המספר הזה — נסי להתחבר במקום להירשם." };
    }

    const email = data.email?.trim() || placeholderEmailForPhone(data.phone);
    const password = toAuthPassword(data.password);
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName, phone: data.phone },
    });
    if (createErr || !created.user) {
      return { ok: false, error: createErr?.message?.includes("already") ? "כבר יש חשבון עם האימייל הזה." : "יצירת החשבון נכשלה, נסי שוב." };
    }

    try {
      await supabaseAdmin.from("profiles").upsert({ id: created.user.id, full_name: data.fullName, phone: data.phone });
    } catch (e) {
      console.error("[SWEETBABY] signup profile upsert failed (account still created)", e);
    }

    const anon = await anonClient();
    const { data: signInData, error: signInErr } = await anon.auth.signInWithPassword({ email, password });
    if (signInErr || !signInData.session) {
      console.error("[SWEETBABY] post-signup sign-in failed", signInErr);
      return { ok: false, error: "החשבון נוצר אבל הכניסה האוטומטית נכשלה — נסי להתחבר ידנית." };
    }
    return { ok: true, session: { access_token: signInData.session.access_token, refresh_token: signInData.session.refresh_token } };
  });

// ---------- password reset via a real phone call ----------
// For a phone-only account (placeholder email, see isPlaceholderEmail
// above) the site's existing email-link reset can never reach her — there's
// no real inbox. This is the phone equivalent: a short-lived code, read out
// over an actual outbound call via the same Yemot campaign API already used
// for door codes/reminders (integrations/yemot/campaign.server.ts), which
// she then types into the reset form alongside a new password. No new
// table — the code and its expiry live in the account's own
// user_metadata, cleared the moment it's used or replaced by a newer one.

const RESET_CODE_TTL_MINUTES = 10;

function randomResetCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000)); // 4 digits — short enough to catch correctly by ear over a phone line
}

/**
 * Always returns ok:true regardless of whether the phone matched a real
 * account — same anti-enumeration reasoning as signInWithPhoneOrEmail — so
 * the UI's "if this number has an account, you'll get a call now" message
 * is truthful either way without confirming which case happened.
 */
export const requestPhoneResetCode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ phone: z.string().min(5).max(40) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    try {
      const account = await findAccountByPhone(data.phone);
      if (!account) return { ok: true }; // no account — silently no-op, see doc comment

      const code = randomResetCode();
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: current } = await supabaseAdmin.auth.admin.getUserById(account.userId);
      await supabaseAdmin.auth.admin.updateUserById(account.userId, {
        user_metadata: {
          ...(current?.user?.user_metadata ?? {}),
          password_reset_code: code,
          password_reset_code_expires: Date.now() + RESET_CODE_TTL_MINUTES * 60_000,
        },
      });

      const { sendYemotVoiceMessage } = await import("@/integrations/yemot/campaign.server");
      const spoken = code.split("").join("-"); // read digit by digit, not as a four-digit number, for clarity over the phone
      await sendYemotVoiceMessage({
        phone: data.phone,
        text: `שלום, קוד האיפוס שלך לסטודיו סוויט בייבי הוא: ${spoken}. הקוד בתוקף ל-${RESET_CODE_TTL_MINUTES} דקות.`,
        label: "איפוס סיסמה",
      });
      return { ok: true };
    } catch (e) {
      console.error("[SWEETBABY] phone reset code request failed", e);
      return { ok: true }; // still generic — never confirm/deny a match to the caller
    }
  });

export const resetPasswordWithPhoneCode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ phone: z.string().min(5).max(40), code: z.string().min(4).max(10), newPassword: z.string().min(MIN_PIN).max(100) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const GENERIC_ERROR = "הקוד שגוי או שפג תוקפו — אפשר לבקש קוד חדש.";
    const account = await findAccountByPhone(data.phone);
    if (!account) return { ok: false, error: GENERIC_ERROR };
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: current } = await supabaseAdmin.auth.admin.getUserById(account.userId);
      const meta = (current?.user?.user_metadata ?? {}) as Record<string, unknown>;
      const storedCode = meta.password_reset_code as string | undefined;
      const expires = meta.password_reset_code_expires as number | undefined;
      if (!storedCode || storedCode !== data.code.trim() || !expires || Date.now() > expires) {
        return { ok: false, error: GENERIC_ERROR };
      }
      const { password_reset_code: _c, password_reset_code_expires: _e, ...restMeta } = meta;
      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(account.userId, {
        password: toAuthPassword(data.newPassword),
        user_metadata: restMeta,
      });
      if (updateErr) throw updateErr;
      return { ok: true };
    } catch (e) {
      console.error("[SWEETBABY] phone reset completion failed", e);
      return { ok: false, error: "שינוי הסיסמה נכשל, נסי שוב." };
    }
  });

/**
 * Every message the customer sees must be in Hebrew — Supabase/auth errors
 * arrive in English, so they are translated here before hitting a toast.
 */
const MAP: Array<[RegExp, string]> = [
  [/user already registered|already registered/i, "כתובת המייל כבר רשומה במערכת — אפשר להתחבר או לאפס סיסמה."],
  [/invalid login credentials/i, "המייל או הסיסמה שגויים."],
  [/email not confirmed/i, "המייל עדיין לא אומת. בדקי את תיבת הדואר."],
  [/password should be at least (\d+)/i, "הסיסמה קצרה מדי — נדרשים לפחות 6 תווים."],
  [/unable to validate email address|invalid email/i, "כתובת המייל אינה תקינה."],
  [/for security purposes.*(\d+) seconds/i, "נשלחה בקשה לאחרונה — נסי שוב בעוד כמה שניות."],
  [/email rate limit exceeded|over_email_send_rate_limit/i, "נשלחו יותר מדי מיילים — נסי שוב מאוחר יותר."],
  [/user not found/i, "המשתמש לא נמצא."],
  [/new password should be different/i, "הסיסמה החדשה חייבת להיות שונה מהקודמת."],
  [/token has expired|invalid token|otp_expired/i, "הקישור פג תוקף — יש לבקש קישור חדש."],
  [/anonymous sign-ins are disabled/i, "כניסת אורח אינה זמינה כרגע."],
  [/network|fetch failed|failed to fetch/i, "בעיית תקשורת — נסי שוב."],
  [/unsupported provider/i, "אמצעי ההתחברות אינו זמין כרגע."],
  [/permission denied|not authorized|unauthorized|jwt/i, "אין הרשאה לפעולה זו."],
  [/duplicate key|already exists/i, "הרשומה כבר קיימת."],
  [/timeout/i, "הפעולה ארכה זמן רב מדי — נסי שוב."],
];

/** Returns a Hebrew message for any error/string coming from the backend. */
export function heError(err: unknown, fallback = "משהו השתבש — נסי שוב."): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!raw) return fallback;
  for (const [re, he] of MAP) if (re.test(raw)) return he;
  // Any leftover English text is replaced — the site is Hebrew only.
  if (/^[\x00-\x7F\s]+$/.test(raw)) return fallback;
  return raw;
}

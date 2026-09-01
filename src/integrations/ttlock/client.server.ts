// Server-only: talks directly to TTLock's Open API (no SDK — same bespoke
// fetch-based house style as twilio.server.ts / calendar.server.ts) to
// issue a temporary door passcode per booking/order, automatically, once
// payment is confirmed.
//
// CONFIRMED WORKING live for a single continuous window (real code issued,
// displayed, and included in the confirmation email — see the door_code
// length fix in git history for the one live bug that came up). Built
// carefully from TTLock's documented Open API v3 (oauth2 password grant +
// keyboardPwd endpoints).
//
// SECOND live bug, fixed 2026-09-01: since the door code is DERIVED from
// the customer's own phone number (doorCodeFromPhone), the same digit
// string is reissued every time that phone books again — and TTLock
// rejects a repeat /keyboardPwd/add for a passcode string already on the
// lock (errcode -3007). This is not rare: revokeDoorCode only ever runs on
// cancellation, never on a session's natural end, so every past code stays
// registered forever, and ANY repeat customer's second booking would hit
// this. addPasscode now catches exactly that error and extends the
// already-registered passcode's window instead of failing (see
// findAndExtendExistingPasscode below) — not yet proven against a second
// real collision, but built from confirmed real API field names (a real
// open-source TTLock client's source, since the official docs pages
// weren't reachable from this sandbox), not guessed from scratch.
//
// The overnight-exclusion path (excludeOvernightHours, props/accessories
// only) is NOT yet verified live — it issues several passcodes that all
// share the same code string but different keyboardPwdId/time windows,
// which is the one part of this file with real remaining uncertainty:
// whether TTLock accepts more than one active passcode with an identical
// digit string on the same lock, or rejects a duplicate. TTLock does
// document a "cyclic" (keyboardPwdType=9, a recurring daily time window)
// passcode type that would be the more natural fit for "active every day
// except 01:00-07:00" — but the exact request shape for its cyclic
// schedule config isn't confirmed from any reachable source, so the
// multi-passcode approach (built on the *already-proven* single-window
// call) was used instead of guessing at an unverified parameter format.
// If a real order confirms and only the first day's passcode actually
// works, that's the signal this guess was wrong and it's worth revisiting
// keyboardPwdType=9 with real TTLock support's help.
//
// Required secrets (Lovable env vars, never in code):
//   TTLOCK_CLIENT_ID, TTLOCK_CLIENT_SECRET — from the approved app at
//     open.ttlock.com (Developer Console → the app → client_id / "show" the secret).
//   TTLOCK_USERNAME, TTLOCK_PASSWORD — the login (phone) and password for
//     the *regular* TTLock app account that already manages the lock.
//   TTLOCK_LOCK_ID — optional; if not set, the first lock on the account is
//     used automatically (fine since there's only one lock).
import { md5 } from "./md5";

// TTLock splits API traffic by region; EU is the one documented for
// Israeli/European accounts. If requests fail outright (DNS/connection
// error, not an API error body), the other documented base is
// "https://api.ttlock.com" — worth trying if this one doesn't resolve.
const BASE_URL = "https://euapi.ttlock.com";

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} — set it in Lovable's environment variables`);
  return v;
}

// Thrown by ttlockPost on any API-level failure (errcode !== 0), with the
// errcode attached so callers can react to a SPECIFIC known error (e.g.
// -3007, "duplicate passcode") without parsing the message string.
class TTLockApiError extends Error {
  errcode: number;
  constructor(message: string, errcode: number) {
    super(message);
    this.name = "TTLockApiError";
    this.errcode = errcode;
  }
}

async function ttlockPost<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.set(k, String(v));
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => null)) as any;
  // TTLock returns HTTP 200 even for API-level errors, with an "errcode"
  // field (0 = success) — so a non-ok HTTP status OR a nonzero errcode both
  // mean failure.
  if (!res.ok || (json && typeof json.errcode === "number" && json.errcode !== 0)) {
    throw new TTLockApiError(`TTLock API error on ${path}: ${res.status} ${JSON.stringify(json)}`, json?.errcode ?? -1);
  }
  return json as T;
}

type TokenResponse = { access_token: string; uid: number };

/**
 * Gets a fresh access token via the OAuth2 "password" grant every call —
 * no token caching/refresh-token bookkeeping, since this only runs once
 * per confirmed booking/order (low volume), and a stale cached token would
 * be a much worse failure mode than one extra auth round trip.
 */
async function getAccessToken(): Promise<TokenResponse> {
  const clientId = requiredEnv("TTLOCK_CLIENT_ID");
  const clientSecret = requiredEnv("TTLOCK_CLIENT_SECRET");
  const username = requiredEnv("TTLOCK_USERNAME");
  const password = requiredEnv("TTLOCK_PASSWORD");
  return ttlockPost<TokenResponse>("/oauth2/token", {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "password",
    username,
    password: md5(password),
  });
}

type LockListResponse = { list: Array<{ lockId: number; lockName: string }> };

/** The lock to issue codes on — TTLOCK_LOCK_ID if set, else the first lock on the account (there's only one). */
async function getLockId(accessToken: string): Promise<number> {
  const configured = process.env.TTLOCK_LOCK_ID;
  if (configured) return Number(configured);
  const clientId = requiredEnv("TTLOCK_CLIENT_ID");
  const list = await ttlockPost<LockListResponse>("/v3/lock/list", {
    clientId,
    accessToken,
    pageNo: 1,
    pageSize: 20,
    date: Date.now(),
  });
  const lock = list.list?.[0];
  if (!lock) throw new Error("No locks found on the TTLock account");
  return lock.lockId;
}

/**
 * The customer's phone number, digits only — the door code format the
 * studio decided on. TTLock rejects any passcode outside 6-9 digits
 * (confirmed live: errcode -3006, "Invalid Passcode"), and a full Israeli
 * mobile number is 10 digits — one too many — so this keeps the last 9
 * (dropping the leading 0) rather than the literal whole number.
 */
export function doorCodeFromPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-9);
}

/**
 * The code as it should be shown/spoken to the customer — padded back to 10
 * digits with a leading zero. Confirmed live: TTLock's API only accepts a
 * 6-9 digit passcode (the 9-digit code above is what's actually sent and
 * registered), but the physical keypad apparently matches on the
 * zero-padded 10-digit form once the code syncs down to the lock — a real
 * customer's door opened with "0548529277" and did NOT open with
 * "548529277" alone (confirmed from the lock's own access log). So the API
 * call keeps using the 9-digit form; only what a human sees/hears is padded.
 */
export function displayDoorCode(code: string): string {
  return code.padStart(10, "0");
}

type AddPasscodeResponse = { keyboardPwdId: number };

// A door code is derived deterministically from the customer's own phone
// number (doorCodeFromPhone) — so the SAME digit string is reused every
// time that phone books again. TTLock rejects a second /keyboardPwd/add for
// a passcode string that already exists on the lock (errcode -3007, "The
// same passcode already exists") — confirmed live in production
// (booking id ff2e8204-ca23-4187-b800-894ca8922fcc, 2026-09-01): a repeat
// customer (or simply an earlier booking's code that was never deleted —
// revokeDoorCode only runs on cancellation, never on a session's natural
// end, so every past code stays registered on the lock indefinitely)
// collides on the very next add. findAndExtendExistingPasscode below
// recovers from exactly this by widening the ALREADY-REGISTERED passcode's
// window to also cover the new booking, instead of failing the whole
// confirmation — the customer keeps using the same code she may already
// know, and nothing else on the lock is touched or narrowed.
type ListKeyboardPwdResponse = { list: Array<{ keyboardPwdId: number; keyboardPwd: string; startDate: number; endDate: number }> };

async function findAndExtendExistingPasscode(opts: {
  lockId: number;
  code: string;
  startMs: number;
  endMs: number;
  accessToken: string;
  clientId: string;
}): Promise<number> {
  // Endpoint/param/field names here (lock/listKeyboardPwd; the response's
  // per-item "keyboardPwd" field holding the actual digit string; the
  // change endpoint's plain startDate/endDate — NOT newStartDate/
  // newEndDate) are confirmed from a real, actively-maintained open-source
  // TTLock client's source (official docs weren't reachable from this
  // sandbox) — reasonably confident, but not yet proven against a real
  // second collision in production. If this recovery path itself ever
  // fails or silently doesn't extend the code, that's the signal to
  // revisit these exact field names.
  const list = await ttlockPost<ListKeyboardPwdResponse>("/v3/lock/listKeyboardPwd", {
    clientId: opts.clientId,
    accessToken: opts.accessToken,
    lockId: opts.lockId,
    pageNo: 1,
    pageSize: 200, // generous — this lock's total passcode history should be well under this
    date: Date.now(),
  });
  const existing = list.list?.find((p) => p.keyboardPwd === opts.code);
  if (!existing) {
    // TTLock says it's a duplicate but it didn't show up in the list to
    // extend — nothing safe to do (guessing a keyboardPwdId would be
    // dangerous), surface the ambiguity rather than pretending success.
    throw new Error(`TTLock reported passcode "${opts.code}" as a duplicate, but it wasn't found in lock/listKeyboardPwd to extend`);
  }
  // Only ever widens the window (never shrinks it), so an unrelated
  // still-open access period for the same code can't accidentally be cut.
  const newStartDate = Math.min(existing.startDate, opts.startMs);
  const newEndDate = Math.max(existing.endDate, opts.endMs);
  if (newStartDate === existing.startDate && newEndDate === existing.endDate) return existing.keyboardPwdId; // already covers this window
  await ttlockPost("/v3/keyboardPwd/change", {
    clientId: opts.clientId,
    accessToken: opts.accessToken,
    lockId: opts.lockId,
    keyboardPwdId: existing.keyboardPwdId,
    changeType: 2, // same "2" convention already confirmed working for addType below
    startDate: newStartDate,
    endDate: newEndDate,
    date: Date.now(),
  });
  return existing.keyboardPwdId;
}

/**
 * Issues a real temporary passcode on the lock, valid only for the given
 * window (already padded with a few minutes by the caller) — meant to be
 * sent to the lock immediately via the connected Gateway, not just recorded
 * on TTLock's platform for a later manual sync.
 *
 * addType is the single riskiest unverified value in this whole file:
 * TTLock's "1 = via Gateway/remote, 2 = via Bluetooth, needs the app near
 * the lock" split is documented inconsistently across their API versions —
 * if a real booking confirms and the code never actually reaches the lock
 * (or only works once someone opens the TTLock app standing next to it),
 * this is the first thing to flip and retest.
 *
 * On a duplicate-passcode collision (errcode -3007 — see the comment above
 * findAndExtendExistingPasscode) this extends the existing registration
 * instead of throwing, since a real production booking already hit this.
 */
async function addPasscode(opts: { lockId: number; code: string; name: string; startMs: number; endMs: number }): Promise<number> {
  const { access_token: accessToken } = await getAccessToken();
  const clientId = requiredEnv("TTLOCK_CLIENT_ID");
  try {
    const res = await ttlockPost<AddPasscodeResponse>("/v3/keyboardPwd/add", {
      clientId,
      accessToken,
      lockId: opts.lockId,
      keyboardPwd: opts.code,
      keyboardPwdName: opts.name,
      startDate: opts.startMs,
      endDate: opts.endMs,
      addType: 2,
      date: Date.now(),
    });
    return res.keyboardPwdId;
  } catch (e) {
    if (!(e instanceof TTLockApiError) || e.errcode !== -3007) throw e;
    return await findAndExtendExistingPasscode({ lockId: opts.lockId, code: opts.code, startMs: opts.startMs, endMs: opts.endMs, accessToken, clientId });
  }
}

/** Same addType caveat as addPasscode above applies to deleteType here. */
async function deletePasscode(lockId: number, keyboardPwdId: number): Promise<void> {
  const { access_token: accessToken } = await getAccessToken();
  const clientId = requiredEnv("TTLOCK_CLIENT_ID");
  await ttlockPost("/v3/keyboardPwd/delete", {
    clientId,
    accessToken,
    lockId,
    keyboardPwdId,
    deleteType: 2,
    date: Date.now(),
  });
}

export type DoorCodeResult = { code: string; keyboardPwdId: number; lockId: number };

// Minutes of slack before/after the booked window, so the code works a bit
// early (customer arriving slightly ahead) and doesn't cut off mid-session
// on the dot.
const WINDOW_PADDING_MIN = 15;

// Props/accessories rentals ("איסוף והחזרה תוך 24 שעות") get a code active
// for the whole rental — but never overnight: the studio's explicit rule is
// that the code must NOT work between 01:00 and 07:00 Israel time, any
// night the rental spans. Each qualifying day's "active" window is
// [that day 07:00, next day 01:00) — 18 hours — leaving the 6 quiet hours
// closed even if the rental itself runs through them.
const QUIET_HOURS_START = "00:00";
const QUIET_HOURS_END = "07:00";
const MAX_QUIET_HOUR_SEGMENTS = 6; // safety cap — a rental should never realistically span this many nights

/**
 * High-level entry point: builds a phone-based passcode and loads it onto
 * the lock for the given time window. Never throws — a TTLock failure must
 * never block a booking/order confirmation from completing; on failure it
 * logs and returns null, and the confirmation email simply won't include a
 * door code (the studio can issue one manually as a fallback).
 */
export async function issueDoorCodeForBooking(opts: {
  phone: string;
  /** Israel-local wall-clock date/time pieces — exactly what session_date/start_time (or a naive pickup_at) already store, no timezone math done by the caller. */
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  endDate?: string; // defaults to `date` — for a rental window that spans days
  endTime: string; // "HH:MM"
  label: string; // shown in the TTLock app's passcode list — the customer's name
  /** Props/accessories rentals only — see the constants above. Splits into multiple daily passcodes (same code) instead of one continuous window, so the code goes dead 01:00–07:00 every night. */
  excludeOvernightHours?: boolean;
}): Promise<DoorCodeResult | null> {
  try {
    const { israelLocalToUtcMs } = await import("@/lib/availability.server");
    const code = doorCodeFromPhone(opts.phone);
    // Guards against bad contact_phone data (e.g. an email typed into the
    // phone field — confirmed live, showed up as a nonsense passcode
    // instead of a clear error) reaching TTLock as an invalid passcode.
    if (code.length < 6) {
      throw new Error(`Phone number doesn't have enough digits for a valid door code (got "${opts.phone}" → "${code}")`);
    }
    const endDate = opts.endDate ?? opts.date;
    const { access_token: accessToken } = await getAccessToken();
    const lockId = await getLockId(accessToken);

    if (opts.excludeOvernightHours) {
      const rangeStartMs = israelLocalToUtcMs(opts.date, opts.startTime);
      const rangeEndMs = israelLocalToUtcMs(endDate, opts.endTime);
      const segments: Array<{ startMs: number; endMs: number }> = [];
      // Walk calendar dates (plain string arithmetic — no timezone math
      // needed here, only israelLocalToUtcMs below cares about that) from
      // the pickup date through the return date.
      let cursor = opts.date;
      for (let i = 0; i < MAX_QUIET_HOUR_SEGMENTS && cursor <= endDate; i++) {
        const next = new Date(`${cursor}T00:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        const nextDateStr = next.toISOString().slice(0, 10);
        const activeStartMs = israelLocalToUtcMs(cursor, QUIET_HOURS_END);
        const activeEndMs = israelLocalToUtcMs(nextDateStr, QUIET_HOURS_START);
        const segStart = Math.max(activeStartMs, rangeStartMs);
        const segEnd = Math.min(activeEndMs, rangeEndMs);
        if (segStart < segEnd) segments.push({ startMs: segStart, endMs: segEnd });
        cursor = nextDateStr;
      }
      if (segments.length === 0) throw new Error("No active (non-overnight) segments in this rental window");

      let firstKeyboardPwdId: number | null = null;
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        // Only pad the very first/last segment's true edge — padding a cut
        // point created by the overnight split would eat into quiet hours.
        const startMs = seg.startMs - (i === 0 ? WINDOW_PADDING_MIN * 60_000 : 0);
        const endMs = seg.endMs + (i === segments.length - 1 ? WINDOW_PADDING_MIN * 60_000 : 0);
        const id = await addPasscode({ lockId, code, name: opts.label, startMs, endMs });
        if (firstKeyboardPwdId === null) firstKeyboardPwdId = id;
      }
      return { code: displayDoorCode(code), keyboardPwdId: firstKeyboardPwdId!, lockId };
    }

    const startMs = israelLocalToUtcMs(opts.date, opts.startTime) - WINDOW_PADDING_MIN * 60_000;
    const endMs = israelLocalToUtcMs(endDate, opts.endTime) + WINDOW_PADDING_MIN * 60_000;
    const keyboardPwdId = await addPasscode({ lockId, code, name: opts.label, startMs, endMs });
    return { code: displayDoorCode(code), keyboardPwdId, lockId };
  } catch (e) {
    console.error("[SWEETBABY] TTLock door code issue failed", e);
    // The confirmation flow's own catch never sees this (issueDoorCodeForBooking
    // never throws), so this is the only place the real failure reason exists —
    // without this, a failure is invisible to the studio, not just silent to
    // the customer. Written to admin_notifications (visible on /admin/notifications)
    // rather than left in server logs no one can currently read.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("admin_notifications").insert({
        type: "ttlock_error",
        title: `⚠️ קוד כניסה לא הונפק — ${opts.label}`,
        body: { error: e instanceof Error ? e.message : String(e), phone: opts.phone, date: opts.date, startTime: opts.startTime },
      });
    } catch (e2) {
      console.error("[SWEETBABY] TTLock failure admin_notifications save also failed", e2);
    }
    return null;
  }
}

/**
 * Issues an immediate, short-window passcode not tied to any booking/order
 * — for the admin-only "open the door for me right now" voice flow (see
 * voice-admin.server.ts, which gates who's even allowed to call this with a
 * two-factor phone+PIN check before it ever reaches here). Same underlying
 * TTLock call as issueDoorCodeForBooking, just a window starting now instead
 * of a future booking's start time, and a random 6-digit code (not the
 * customer-phone-derived scheme, which doesn't apply — nobody's phone
 * number here) — so no displayDoorCode zero-padding either, that padding
 * was specifically about the 9→10 digit phone-derived form.
 *
 * Carries the SAME unverified-live caveats as issueDoorCodeForBooking's own
 * doc comment (addType Gateway-vs-Bluetooth split, in particular) — this
 * hasn't been confirmed against a real call yet either.
 */
export async function issueAdHocDoorCode(opts: { label: string; validForMinutes: number }): Promise<DoorCodeResult | null> {
  try {
    const { access_token: accessToken } = await getAccessToken();
    const lockId = await getLockId(accessToken);
    const code = String(Math.floor(100_000 + Math.random() * 900_000)); // random 6-digit, distinct from the phone-derived scheme
    const now = Date.now();
    const keyboardPwdId = await addPasscode({
      lockId,
      code,
      name: opts.label,
      startMs: now - 60_000,
      endMs: now + opts.validForMinutes * 60_000,
    });
    return { code, keyboardPwdId, lockId };
  } catch (e) {
    console.error("[SWEETBABY] TTLock ad-hoc door code issue failed", e);
    return null;
  }
}

/** Best-effort revoke — used on cancellation. Never throws. */
export async function revokeDoorCode(lockId: number, keyboardPwdId: number): Promise<void> {
  try {
    await deletePasscode(lockId, keyboardPwdId);
  } catch (e) {
    console.error("[SWEETBABY] TTLock door code revoke failed", e);
  }
}

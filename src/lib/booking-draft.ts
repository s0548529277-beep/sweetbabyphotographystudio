/**
 * Remembers how far a visitor got in booking the studio (the /studio-rental questionnaire, the hour she picked on
 * /booking, or the in-chat wizard) so the chat bot can say what is missing and offer to finish it with her.
 * Browser only (localStorage), expires after 3 days, never holds anything but booking details she typed herself.
 */
const KEY = "sb_booking_progress";
const MAX_AGE_MS = 3 * 24 * 3600 * 1000;
const CLIENT_KEY = "sb_booking_client_key";
let syncTimer: ReturnType<typeof setTimeout> | null = null;

function clientKey(): string | null {
  try {
    let k = window.localStorage.getItem(CLIENT_KEY);
    if (!k) {
      k = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9-]/g, "");
      window.localStorage.setItem(CLIENT_KEY, k);
    }
    return k;
  } catch {
    return null;
  }
}

/**
 * Server copy (table booking_drafts) so the admin sees who started a booking and left. Only once a phone or an
 * email is known, debounced, fire-and-forget; failures are ignored (the browser copy still works).
 */
function scheduleServerSync() {
  if (typeof window === "undefined") return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    syncTimer = null;
    try {
      const p = loadBookingProgress();
      if (!((p.phone ?? "").replace(/\D/g, "").length >= 7 || (p.email ?? "").includes("@"))) return;
      const key = clientKey();
      if (!key) return;
      const { supabase } = await import("@/integrations/supabase/client");
      const { savedAt: _s, ...rest } = p;
      await (supabase as any).rpc("save_booking_draft", {
        _key: key,
        _name: p.name ?? "",
        _phone: p.phone ?? "",
        _email: p.email ?? "",
        _progress: rest,
        _step: String(wizardStartStep(p)),
      });
    } catch {
      /* ignore */
    }
  }, 4000);
}

export type BookingProgress = {
  savedAt?: number;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:MM
  hours?: number; // 1 / 1.5 / 2 / 3 ...
  sessionType?: string;
  people?: string;
  babyAge?: string;
  camera?: string;
  flash?: string;
  props?: string;
  special?: string;
  name?: string;
  phone?: string;
  email?: string;
  terms?: boolean;
  plan?: string;
};

export function loadBookingProgress(): BookingProgress {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as BookingProgress;
    if (!p.savedAt || Date.now() - p.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(KEY);
      return {};
    }
    return p;
  } catch {
    return {};
  }
}

export function saveBookingProgress(patch: BookingProgress) {
  if (typeof window === "undefined") return;
  try {
    const next: BookingProgress = { ...loadBookingProgress(), ...patch, savedAt: Date.now() };
    // Drop empty strings so they never overwrite real values later.
    for (const k of Object.keys(next) as (keyof BookingProgress)[]) {
      if (next[k] === "" || next[k] === undefined) delete next[k];
    }
    window.localStorage.setItem(KEY, JSON.stringify(next));
    scheduleServerSync();
  } catch {
    /* storage unavailable */
  }
}

export function clearBookingProgress() {
  if (typeof window === "undefined") return;
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  try {
    window.localStorage.removeItem(KEY);
    const key = window.localStorage.getItem(CLIENT_KEY);
    if (key) {
      void import("@/integrations/supabase/client")
        .then(({ supabase }) => (supabase as any).rpc("complete_booking_draft", { _key: key }))
        .catch(() => {});
      window.localStorage.removeItem(CLIENT_KEY);
    }
  } catch {
    /* ignore */
  }
}

/** Has she got anything worth continuing (a chosen hour or an answered questionnaire)? */
export function hasBookingProgress(p: BookingProgress = loadBookingProgress()): boolean {
  return !!((p.date && p.time && p.hours) || p.sessionType || p.name || p.phone || p.email);
}

/** Which wizard step to start at, given what is already filled. */
export function wizardStartStep(p: BookingProgress): number {
  const slotDone = !!(p.date && p.time && p.hours);
  if (!slotDone) return 0;
  if (!p.sessionType) return 1;
  const contactDone = !!(p.name && p.phone && p.email && p.terms);
  if (!contactDone) return 2;
  return 3;
}

/** One compact Hebrew line for the bot (data, not instructions): what was filled and what is missing. */
export function describeBookingProgress(p: BookingProgress = loadBookingProgress()): string {
  if (!hasBookingProgress(p)) return "";
  const have: string[] = [];
  const missing: string[] = [];
  if (p.date && p.time && p.hours) have.push(`מועד: ${p.date} ${p.time}, ${p.hours} שעות`);
  else missing.push("תאריך/שעה/משך");
  if (p.sessionType) have.push(`סוג צילום: ${p.sessionType}`);
  else missing.push("סוג צילום (שאלון)");
  if (p.people) have.push(`אנשים: ${p.people}`);
  if (p.name) have.push(`שם: ${p.name}`);
  else missing.push("שם");
  if (p.phone) have.push("טלפון הוזן");
  else missing.push("טלפון");
  if (p.email) have.push("אימייל הוזן");
  else missing.push("אימייל");
  if (!p.terms) missing.push("אישור תנאים");
  missing.push("בחירת אופן טיפול במקדמה", "אישור ושריון סופי");
  return `מולא: ${have.join("; ") || "כלום"} | חסר: ${missing.join(", ")}`.slice(0, 600);
}

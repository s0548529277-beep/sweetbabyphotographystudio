import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Public lead-capture for a fully-booked date (no auth required) — backs the waitlist form on /booking. Writes go through the service-role client so waitlist_entries needs no anon insert policy (see its migration). */
export const joinWaitlist = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        session_date: z.string().min(10).max(10),
        full_name: z.string().min(2).max(100),
        phone: z.string().min(7).max(40),
        email: z.string().email().max(200).optional().or(z.literal("")),
        notes: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Best-effort — a logged-in visitor's waitlist entry is linked to her
    // account so an admin can see who she is, but a guest can still join.
    let userId: string | null = null;
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const authHeader = getRequest()?.headers.get("authorization");
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (token) {
        const { data: claims } = await supabaseAdmin.auth.getClaims(token);
        userId = (claims?.claims?.sub as string | undefined) ?? null;
      }
    } catch {
      /* guest — fine, user_id stays null */
    }

    const { error } = await supabaseAdmin.from("waitlist_entries").insert({
      session_date: data.session_date,
      full_name: data.full_name.trim(),
      phone: data.phone.trim(),
      email: data.email?.trim() || null,
      notes: data.notes?.trim() || null,
      user_id: userId,
    });
    if (error) throw new Error("ההצטרפות לרשימת ההמתנה נכשלה, נסי שוב");
    return { ok: true };
  });

/**
 * Notifies every un-notified waitlist entry for `sessionDate` that the day
 * may have opened up — called right after a booking on that date is
 * cancelled (see cancelBooking in bookings.functions.ts and the admin
 * cancellation path in admin-orders.functions.ts). Deliberately coarse (per
 * date, not per exact time range): the waitlist form itself only collects a
 * date, matching what the /booking page shows the "join waitlist" prompt
 * for (a fully-booked day), not a specific half-hour slot. Never throws —
 * a notification hiccup must never block the cancellation it's reacting to.
 */
export async function notifyWaitlistForFreedSlot(sessionDate: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: entries } = await supabaseAdmin
      .from("waitlist_entries")
      .select("id, full_name, email")
      .eq("session_date", sessionDate)
      .is("notified_at", null);
    if (!entries || entries.length === 0) return;

    const dateHe = new Date(`${sessionDate}T00:00:00`).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
    const { sendStudioAndCustomer } = await import("@/integrations/google/gmail.server");

    for (const entry of entries) {
      if (entry.email) {
        try {
          const html = `<div dir="rtl" style="font-family:sans-serif;color:#2d3d2b;max-width:520px;margin:0 auto">
            <h2>התאריך שרצית התפנה! 🎉</h2>
            <p>שלום ${entry.full_name || ""},</p>
            <p>ביקשת שנודיע לך אם יתפנה מקום בסטודיו Sweetbaby בתאריך <strong>${dateHe}</strong> — ויש חדשות טובות: משבצת התפנתה!</p>
            <p>הכניסה היא לפי כל הפונות — מומלץ למהר ולשריין לפני שמישהי אחרת תתפוס:</p>
            <p style="margin:18px 0"><a href="https://sweetbabyphoto.shop/booking" style="background:#2d3d2b;color:#f8ede4;padding:10px 22px;border-radius:999px;text-decoration:none;display:inline-block">לשריון התאריך</a></p>
          </div>`;
          await sendStudioAndCustomer({ customerEmail: entry.email, subject: `התאריך ${dateHe} התפנה בסטודיו! 🎉`, html });
        } catch (e) {
          console.error("[SWEETBABY] waitlist notify email failed", entry.id, e);
        }
      }
      await supabaseAdmin.from("waitlist_entries").update({ notified_at: new Date().toISOString() }).eq("id", entry.id);
    }
  } catch (e) {
    console.error("[SWEETBABY] waitlist notify failed", sessionDate, e);
  }
}

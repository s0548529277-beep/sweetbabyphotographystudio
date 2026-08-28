import { z } from "zod";
import { GUIDANCE_FEES, isMorningPackage, priceForBooking } from "@/lib/bookings.functions";
import { bookingBlocksSlot, PENDING_HOLD_MINUTES } from "@/lib/availability.server";
import { buildBookingSummaryHtml } from "@/lib/orderSummary";

export const PhoneBookingInput = z.object({
  session_date: z.string().min(10),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  slots: z.number().int().min(2).max(30),
  contact_name: z.string().min(1).max(120),
  contact_phone: z.string().min(5).max(40),
  contact_email: z.string().email().max(200).optional(),
  session_type: z.string().max(200).optional(),
  guidance: z.enum(["basic", "mini", "plus", "premium"]).optional(),
  // Free-text request for accessories/props alongside the studio session —
  // not checked against real availability like the site's own catalog
  // flow, just passed along to the studio for manual follow-up (matching
  // how create_studio_booking's needProps field works in the text chat).
  props_request: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

export type PhoneBookingInput = z.infer<typeof PhoneBookingInput>;

/**
 * Creates a real (pending) studio booking from a phone-call conversation —
 * the voice equivalent of placeBooking, used when there's no browser
 * session/JWT to authenticate through (this runs from a raw Twilio webhook
 * request, not a signed-in client). Mirrors placeBooking's core
 * pricing/overlap/notify logic but writes directly via supabaseAdmin under a
 * freshly-minted anonymous account (bookings.user_id is NOT NULL — exactly
 * how the "continue as guest" flow on /booking works client-side), and
 * deliberately skips coupon/pass/credit redemption, same scope the chat's
 * create_studio_booking tool already sticks to.
 */
export async function createPhoneBooking(input: PhoneBookingInput) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [h, m] = input.start_time.split(":").map(Number);
  const startMin = h * 60 + m;
  const endMin = startMin + input.slots * 30;
  const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;

  const isMorning = isMorningPackage(input.slots, input.start_time);
  const guidanceKey = input.guidance ?? "basic";
  const guidanceFee = GUIDANCE_FEES[guidanceKey] ?? 0;
  const price = priceForBooking(input.slots, input.start_time, null) + guidanceFee;

  // Overlap check — same shared rule the site and text chat already use, so
  // a phone booking can never disagree with what the calendar/chat show.
  const { data: existing, error: exErr } = await supabaseAdmin
    .from("bookings")
    .select("id, start_time, end_time, status, deposit_status, created_at, notes")
    .eq("session_date", input.session_date)
    .neq("status", "cancelled");
  if (exErr) throw new Error(exErr.message);
  for (const b of (existing ?? []).filter((b: any) => bookingBlocksSlot(b))) {
    const [bh, bm] = String(b.start_time).split(":").map(Number);
    const [eh, em] = String(b.end_time).split(":").map(Number);
    const bs = bh * 60 + bm;
    const be = eh * 60 + em;
    if (startMin < be && endMin > bs) {
      throw new Error("הזמן הזה כבר תפוס, צריך לבחור שעה אחרת");
    }
  }

  // Also honor the real Google Calendar, same as placeBooking.
  try {
    const { listGoogleCalendarBusy } = await import("@/integrations/google/calendar.server");
    const gbusy = await listGoogleCalendarBusy(input.session_date, input.session_date);
    for (const [bs, be] of gbusy[input.session_date] ?? []) {
      if (startMin < be && endMin > bs) {
        throw new Error("הזמן הזה כבר תפוס ביומן הסטודיו, צריך לבחור שעה אחרת");
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("תפוס")) throw e;
    console.error("[SWEETBABY] voice booking calendar conflict check failed", e);
  }

  // bookings.user_id is NOT NULL — mint a fresh anonymous account for this
  // caller, exactly like the "continue as guest" flow does client-side.
  const { createClient } = await import("@supabase/supabase-js");
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) throw new Error("Missing SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY");
  const anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: anonAuth, error: anonErr } = await anon.auth.signInAnonymously();
  if (anonErr || !anonAuth.user) throw new Error(anonErr?.message ?? "יצירת זהות זמנית ללקוחה נכשלה");
  const userId = anonAuth.user.id;

  const today = new Date().toISOString().slice(0, 10);
  const sameDay = input.session_date === today;
  const deposit = sameDay ? price : 90;

  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .insert({
      user_id: userId,
      session_date: input.session_date,
      start_time: input.start_time,
      end_time: endTime,
      slots: input.slots,
      package: isMorning ? "morning" : "regular",
      price,
      deposit_amount: deposit,
      balance_amount: Math.max(0, price - deposit),
      status: "pending",
      deposit_status: "pending",
      contact_name: input.contact_name,
      contact_phone: input.contact_phone,
      notes:
        ["התקבל בשיחה טלפונית עם הבינה הקולית", input.session_type, input.props_request ? `בקשת אביזרים: ${input.props_request}` : null, input.notes]
          .filter(Boolean)
          .join("\n") || null,
      reserved_items: [],
      terms_accepted_at: new Date().toISOString(),
    })
    .select("id, price")
    .single();
  if (error || !booking) throw new Error(error?.message ?? "יצירת שריון נכשלה");

  try {
    await supabaseAdmin.from("admin_notifications").insert({
      type: "booking",
      title: `שריון סטודיו חדש (טלפון) · ₪${price}`,
      body: {
        booking_id: booking.id,
        session_date: input.session_date,
        start_time: input.start_time,
        end_time: endTime,
        slots: input.slots,
        price,
        deposit,
        contact_name: input.contact_name,
        contact_phone: input.contact_phone,
        contact_email: input.contact_email ?? null,
        props_request: input.props_request ?? null,
        source: "voice_call",
      },
    });
  } catch (e) {
    console.error("[SWEETBABY] voice booking admin notify failed", e);
  }

  try {
    // No browser session to send her back to (this came from a phone call),
    // so — when she gave an email — the confirmation email itself carries a
    // real "pay now" button (same hosted Takbull page as the site's own
    // secure-payment button), instead of just bank/Bit details she'd have to
    // act on separately.
    const html = buildBookingSummaryHtml({
      heading: "בקשת שריון טלפונית התקבלה 📞",
      intro: input.contact_email
        ? `שוחחנו איתך בטלפון עכשיו וביקשת לשריין תאריך. <strong>התאריך שמור זמנית</strong> — כדי לאשר אותו סופית יש לשלם את המקדמה בלחיצה על הכפתור למטה תוך ${PENDING_HOLD_MINUTES / 60} שעות, אחרת התאריך ישתחרר.`
        : `לקוחה שוחחה עם הבינה הקולית של הסטודיו וביקשה לשריין תאריך. <strong>התאריך עדיין לא סופי</strong> — יש ליצור איתה קשר לתיאום תשלום מקדמה תוך ${PENDING_HOLD_MINUTES / 60} שעה, אחרת התאריך ישתחרר.`,
      booking: {
        id: booking.id,
        contact_name: input.contact_name,
        session_date: input.session_date,
        start_time: input.start_time,
        end_time: endTime,
        price,
        deposit_amount: deposit,
        balance_amount: Math.max(0, price - deposit),
        notes: input.props_request ? `בקשת אביזרים: ${input.props_request}` : (input.notes ?? null),
        reserved_items: [],
      },
      intakePayload: null,
      paymentAmount: input.contact_email ? deposit : undefined,
      // Read out in full only if she asks for it on the call (per VOICE_STYLE) —
      // otherwise the terms just ride along here, in writing, instead of eating
      // call time reciting them.
      footerNote: input.contact_email
        ? "<strong>תקנון בקצרה:</strong> מקדמה 90₪ אינה מוחזרת בביטול · ביטול ביום האירוע עצמו = חיוב מלא (100%) · נזק לציוד = עלות תיקון/רכישה + 20% דמי טיפול · ניקיון לא תקין = 150₪."
        : undefined,
    });
    const { sendStudioAndCustomer } = await import("@/integrations/google/gmail.server");
    await sendStudioAndCustomer({
      customerEmail: input.contact_email ?? null,
      subject: `בקשת שריון טלפונית #${booking.id.slice(0, 8)} · Sweetbaby`,
      html,
    });
  } catch (e) {
    console.error("[SWEETBABY] voice booking email failed", e);
  }

  return { id: booking.id, price, deposit, endTime, emailSent: !!input.contact_email };
}

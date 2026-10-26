import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ContractSection } from "@/lib/photoContract";

/**
 * Public, token-only signing surface for the photo-session (photo_client_workflows)
 * and outdoor-package (outdoor_package_orders) contracts — /contract/$kind/$token.
 * Owner request 2026-10-26: the client ticks "קראתי" on every section and only
 * then sends; the studio gets an email listing every section she confirmed.
 * Newborn contracts use the same page but their own functions in
 * newborn-orders.functions.ts (they already had access_token + contract_confirmed_at).
 */

const STUDIO_EMAIL = "s0548529277@gmail.com";

const kindSchema = z.enum(["photo", "outdoor"]);
const tokenSchema = z.string().min(20).max(100);

type Loaded = {
  table: "photo_client_workflows" | "outdoor_package_orders";
  id: string;
  contactName: string;
  confirmedAt: string | null;
  sections: ContractSection[];
};

async function loadByToken(kind: "photo" | "outdoor", token: string): Promise<Loaded | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  if (kind === "outdoor") {
    const { data: order } = await db
      .from("outdoor_package_orders")
      .select("*")
      .eq("contract_token", token)
      .maybeSingle();
    if (!order || !order.session_date) return null;
    const { buildOutdoorContractSections } = await import("@/lib/outdoorContract");
    return {
      table: "outdoor_package_orders",
      id: order.id,
      contactName: order.contact_name ?? "",
      confirmedAt: order.contract_confirmed_at ?? null,
      sections: buildOutdoorContractSections({
        contactName: order.contact_name ?? "",
        sessionDate: order.session_date,
        sessionTime: order.session_time ?? null,
        packageName: order.package_name ?? null,
        packageDescription: order.package_description ?? null,
        totalPrice: order.total_price != null ? Number(order.total_price) : null,
        confirmLink: "",
      }),
    };
  }

  const { data: wf } = await db.from("photo_client_workflows").select("*").eq("contract_token", token).maybeSingle();
  if (!wf || !wf.session_date) return null;
  let contactName = "";
  if (wf.booking_id) {
    const { data: booking } = await db.from("bookings").select("contact_name").eq("id", wf.booking_id).maybeSingle();
    contactName = booking?.contact_name || "";
  }
  if (!contactName) {
    const { data: profile } = await db.from("profiles").select("full_name").eq("id", wf.user_id).maybeSingle();
    contactName = profile?.full_name || "";
  }
  const { buildPhotoContractSections } = await import("@/lib/photoContract");
  return {
    table: "photo_client_workflows",
    id: wf.id,
    contactName,
    confirmedAt: wf.contract_confirmed_at ?? null,
    sections: buildPhotoContractSections({
      contactName,
      sessionDate: wf.session_date,
      sessionTime: (wf.session_time as string | null)?.slice(0, 5) ?? null,
      photosToEdit: wf.photos_to_edit ?? null,
      totalPrice: wf.total_price ?? null,
      albumUpgrades: wf.album_upgrades ?? null,
      confirmLink: "",
    }),
  };
}

export const getContractForSigning = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ kind: kindSchema, token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const row = await loadByToken(data.kind, data.token);
    if (!row) throw new Error("קישור לא תקין");
    return { contactName: row.contactName, confirmedAt: row.confirmedAt, sections: row.sections };
  });

export const submitContractSigning = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ kind: kindSchema, token: tokenSchema, readCount: z.number().int().min(0) }).parse(d),
  )
  .handler(async ({ data }) => {
    const row = await loadByToken(data.kind, data.token);
    if (!row) throw new Error("קישור לא תקין");
    if (data.readCount < row.sections.length) throw new Error("יש לסמן ״קראתי״ בכל הסעיפים לפני השליחה");
    if (row.confirmedAt) return { ok: true };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any)
      .from(row.table)
      .update({ contract_confirmed_at: new Date().toISOString() })
      .eq("id", row.id);

    try {
      const { sendGmail } = await import("@/integrations/google/gmail.server");
      const label = data.kind === "outdoor" ? "צילומי חוץ" : "צילומים בסטודיו";
      const adminPath = data.kind === "outdoor" ? "/admin/outdoor-packages" : "/admin/photo-clients";
      await sendGmail({
        to: STUDIO_EMAIL,
        subject: `${row.contactName || "לקוחה"} אישרה את החוזה (${label}) ✍️`,
        html: `<div dir="rtl" style="font-family:sans-serif;color:#2d3d2b;max-width:480px;margin:0 auto">
          <div style="background:linear-gradient(135deg,#f5d5cf,#a8c4a2);border-radius:20px;padding:24px 20px;text-align:center">
            <h2 style="margin:0 0 6px">${row.contactName || "הלקוחה"} קראה ואישרה את החוזה</h2>
            <p style="margin:0;font-size:13px">סימנה ״קראתי״ בכל ${row.sections.length} הסעיפים</p>
          </div>
          <ul style="margin:16px 0 0;padding-inline-start:20px;font-size:13px;line-height:1.8">${row.sections
            .map((x) => `<li>✓ ${x.title}</li>`)
            .join("")}</ul>
          <p style="margin-top:18px;text-align:center"><a href="https://sweetbabyphoto.shop${adminPath}" style="color:#2d3d2b;font-weight:600">לצפייה בניהול</a></p>
        </div>`,
      });
    } catch (e) {
      console.error("[SWEETBABY] contract-signed notify failed", e);
    }
    return { ok: true };
  });

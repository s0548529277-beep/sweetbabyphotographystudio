// Guest quick registration (link in order / booking mails). Public server functions, protected by the signed token.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { MIN_PIN } from "@/lib/password";

const baseSchema = z.object({
  kind: z.enum(["booking", "order"]),
  id: z.string().uuid(),
  t: z.string().min(10).max(80),
});

async function loadOwner(kind: "booking" | "order", id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const table = kind === "booking" ? "bookings" : "orders";
  const { data } = await (supabaseAdmin.from(table) as any)
    .select(kind === "booking" ? "user_id, contact_name, contact_phone, contact_email, price" : "user_id, contact_name, contact_phone, contact_email, total")
    .eq("id", id)
    .maybeSingle();
  return data as any;
}

export const getGuestClaimInfo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => baseSchema.parse(d))
  .handler(async ({ data }) => {
    const { verifyGuestClaimToken, isGuestUser } = await import("@/lib/guest-claim.server");
    if (!(await verifyGuestClaimToken(data.kind, data.id, data.t))) return { ok: false as const, error: "הקישור אינו תקף." };
    const row = await loadOwner(data.kind, data.id);
    if (!row?.user_id) return { ok: false as const, error: "ההזמנה לא נמצאה." };
    if (!(await isGuestUser(row.user_id))) return { ok: false as const, error: "already_registered" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: loy } = await supabaseAdmin.from("customer_loyalty").select("credit_balance").eq("user_id", row.user_id).maybeSingle();
    const total = Number(row.price ?? row.total ?? 0);
    return {
      ok: true as const,
      name: String(row.contact_name ?? ""),
      phone: String(row.contact_phone ?? ""),
      email: String(row.contact_email ?? ""),
      creditNow: Number((loy as any)?.credit_balance ?? 0),
      creditExpected: Math.round(total * 0.1),
    };
  });

export const claimGuestAccount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    baseSchema
      .extend({
        fullName: z.string().min(1).max(120),
        phone: z.string().min(5).max(40),
        email: z.string().email().max(200),
        password: z.string().min(MIN_PIN).max(100),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { verifyGuestClaimToken, isGuestUser } = await import("@/lib/guest-claim.server");
      if (!(await verifyGuestClaimToken(data.kind, data.id, data.t))) return { ok: false as const, error: "הקישור אינו תקף." };
      const row = await loadOwner(data.kind, data.id);
      const guestId: string | undefined = row?.user_id;
      if (!guestId) return { ok: false as const, error: "ההזמנה לא נמצאה." };
      if (!(await isGuestUser(guestId))) return { ok: false as const, error: "כבר יש חשבון להזמנה הזו — אפשר להתחבר." };

      // Create the real account (same rules as the normal sign-up: duplicate phone / e-mail refused).
      const { signUpCore } = await import("@/lib/auth.functions");
      const created = await signUpCore({ fullName: data.fullName, phone: data.phone, email: data.email, password: data.password });
      if (!created.ok) return { ok: false as const, error: created.error };
      const newId = created.userId;

      // Move everything the guest session owns to the new account. Each step is best-effort and logged; the
      // loyalty ROW moves whole (balances + her cashback rate) because the new account has none yet.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const steps: Array<[string, PromiseLike<{ error: any }>]> = [
        ["loyalty", supabaseAdmin.from("customer_loyalty").update({ user_id: newId }).eq("user_id", guestId) as any],
        ["orders", supabaseAdmin.from("orders").update({ user_id: newId }).eq("user_id", guestId) as any],
        ["bookings", supabaseAdmin.from("bookings").update({ user_id: newId }).eq("user_id", guestId) as any],
        ["intake", supabaseAdmin.from("studio_intake_forms").update({ user_id: newId }).eq("user_id", guestId) as any],
      ];
      for (const [name, p] of steps) {
        const { error } = await p;
        if (error) console.error(`[SWEETBABY] guest claim: moving ${name} failed`, error);
      }
      return { ok: true as const, session: created.session };
    } catch (e) {
      console.error("[SWEETBABY] claimGuestAccount failed", e);
      return { ok: false as const, error: "תקלה זמנית — נסי שוב בעוד רגע." };
    }
  });

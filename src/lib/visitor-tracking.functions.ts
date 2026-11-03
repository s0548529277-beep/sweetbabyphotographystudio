// Server functions for visitor tracking. The heavy lifting lives in visitor-tracking.server.ts (server only).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { VisitorJourney } from "@/lib/visitor-journey";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

/**
 * Public. Called by the browser when a visitor left details through a path that does not go through a server
 * function of its own (the abandoned-booking draft). The visitor id comes from the x-visitor-id header, which the
 * browser only sends after the cookie banner was accepted, so without consent this does nothing.
 */
export const linkVisitorIdentity = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["booking_draft", "contact", "chat_lead"]),
        refId: z.string().min(1).max(80),
        name: z.string().max(100).optional().nullable(),
        phone: z.string().max(40).optional().nullable(),
        email: z.string().max(160).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { linkVisitorFromRequest } = await import("@/lib/visitor-tracking.server");
      const ok = await linkVisitorFromRequest(data);
      return { ok };
    } catch (e) {
      console.error("[SWEETBABY] linkVisitorIdentity failed", e);
      return { ok: false };
    }
  });

/** Admin only: the browsing history of the people in a list (matched by the phone / email they left). */
export const getVisitorJourneys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        contacts: z
          .array(
            z.object({
              key: z.string().min(1).max(80),
              phone: z.string().max(40).optional().nullable(),
              email: z.string().max(160).optional().nullable(),
            }),
          )
          .max(400),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<Record<string, VisitorJourney>> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { journeysByContacts } = await import("@/lib/visitor-tracking.server");
    return journeysByContacts(supabaseAdmin as any, data.contacts);
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CONTRACT_LOCKED_TITLES,
  CONTRACT_OVERRIDE_KEYS,
  loadContractOverrides,
  sectionHtmlToText,
  type ContractKind,
} from "@/lib/contract-overrides";

/** Admin editor for the permanent wording of the צילומי חוץ / צילום כללי contracts. */

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

const kindSchema = z.enum(["outdoor", "photo"]);

async function defaultSections(kind: ContractKind) {
  if (kind === "outdoor") {
    const { buildOutdoorContractSections } = await import("@/lib/outdoorContract");
    return buildOutdoorContractSections({
      contactName: "",
      sessionDate: "2026-01-01",
      sessionTime: null,
      packageName: null,
      packageDescription: null,
      totalPrice: null,
      confirmLink: "",
    });
  }
  const { buildPhotoContractSections } = await import("@/lib/photoContract");
  return buildPhotoContractSections({
    contactName: "",
    sessionDate: "2026-01-01",
    sessionTime: null,
    photosToEdit: null,
    totalPrice: null,
    albumUpgrades: null,
    confirmLink: "",
  });
}

export const getContractTextForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ kind: kindSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const overrides = await loadContractOverrides(context.supabase, data.kind);
    const sections = (await defaultSections(data.kind)).map((s) => {
      const defaultText = sectionHtmlToText(s.html);
      return {
        title: s.title,
        defaultText,
        text: overrides[s.title] ?? defaultText,
        locked: CONTRACT_LOCKED_TITLES[data.kind].includes(s.title),
      };
    });
    return { sections };
  });

/** Saves ONLY the sections that differ from the shipped text; the others keep following the code. */
export const saveContractText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ kind: kindSchema, texts: z.record(z.string().max(4000)) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const defaults = await defaultSections(data.kind);
    const locked = CONTRACT_LOCKED_TITLES[data.kind];
    const out: Record<string, string> = {};
    for (const s of defaults) {
      const t = data.texts[s.title];
      if (typeof t !== "string" || locked.includes(s.title)) continue;
      if (t.trim() && t.trim() !== sectionHtmlToText(s.html)) out[s.title] = t.trim();
    }
    const key = CONTRACT_OVERRIDE_KEYS[data.kind];
    if (Object.keys(out).length === 0) {
      await (context.supabase as any).from("app_settings").delete().eq("key", key);
    } else {
      const { error } = await (context.supabase as any).from("app_settings").upsert(
        { key, value: JSON.stringify(out), updated_at: new Date().toISOString(), updated_by: context.userId },
        { onConflict: "key" },
      );
      if (error) throw new Error(error.message);
    }
    return { ok: true, changed: Object.keys(out).length };
  });

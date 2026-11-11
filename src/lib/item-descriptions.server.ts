// Owner switch: show / hide the item descriptions on the public site (catalog cards ONLY — order mails always keep the descriptions).
// Stored in app_settings key `show_item_descriptions` ("0" = hidden, anything else / missing = shown).
// The descriptions themselves are never touched by the switch.
export const SHOW_ITEM_DESCRIPTIONS_KEY = "show_item_descriptions";

export async function readShowItemDescriptions(): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("app_settings")
      .select("value")
      .eq("key", SHOW_ITEM_DESCRIPTIONS_KEY)
      .maybeSingle();
    return data?.value !== "0";
  } catch {
    return true;
  }
}

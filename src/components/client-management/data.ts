// Settings helpers for the client-management reminder settings (the "הגדרות" tab of
// /admin/newborn-packages). The old journal / clients / payments tabs were removed on 2026-11-20 and
// their data hooks with them; the cm_* tables stay in the DB for the scheduled reminder job.
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CM_SETTINGS_KEY, type CmSettings } from "@/lib/client-management";

const db = supabase as any;

export const CM_KEYS = {
  settings: ["cm-settings"],
} as const;

export function useCmInvalidate() {
  const qc = useQueryClient();
  return (...which: (keyof typeof CM_KEYS)[]) => {
    const keys = which.length ? which : (Object.keys(CM_KEYS) as (keyof typeof CM_KEYS)[]);
    for (const k of keys) qc.invalidateQueries({ queryKey: CM_KEYS[k] });
  };
}

export async function saveCmSettings(s: CmSettings) {
  const { error } = await db
    .from("app_settings")
    .upsert(
      { key: CM_SETTINGS_KEY, value: JSON.stringify(s), updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw error;
}

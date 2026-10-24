// Data hooks for /admin/client-management — everything is loaded whole
// (a studio's own client list is small), and every tab shares the same
// react-query cache, so a change in one tab shows up everywhere at once.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CM_SETTINGS_KEY,
  parseCmSettings,
  type CmClient,
  type CmPaymentAccount,
  type CmSession,
  type CmSettings,
} from "@/lib/client-management";

const db = supabase as any;

export const CM_KEYS = {
  clients: ["cm-clients"],
  sessions: ["cm-sessions"],
  accounts: ["cm-accounts"],
  settings: ["cm-settings"],
} as const;

/** The cm_* tables come from a migration that has to be applied once — detect "table missing" so the page can say so plainly. */
export function isMissingTableError(e: unknown) {
  const msg = String((e as any)?.message ?? e ?? "");
  return (
    /cm_(clients|sessions|payment_accounts)/.test(msg) &&
    /(does not exist|schema cache|not find)/i.test(msg)
  );
}

export function useCmData() {
  const clients = useQuery({
    queryKey: CM_KEYS.clients,
    queryFn: async () => {
      const { data, error } = await db
        .from("cm_clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CmClient[];
    },
    retry: false,
  });
  const sessions = useQuery({
    queryKey: CM_KEYS.sessions,
    queryFn: async () => {
      const { data, error } = await db
        .from("cm_sessions")
        .select("*")
        .order("session_date")
        .order("start_time");
      if (error) throw error;
      return (data ?? []) as CmSession[];
    },
    retry: false,
  });
  const accounts = useQuery({
    queryKey: CM_KEYS.accounts,
    queryFn: async () => {
      const { data, error } = await db
        .from("cm_payment_accounts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((a) => ({
        ...a,
        total_amount: Number(a.total_amount || 0),
        paid_amount: Number(a.paid_amount || 0),
      })) as CmPaymentAccount[];
    },
    retry: false,
  });
  const settings = useQuery({
    queryKey: CM_KEYS.settings,
    queryFn: async () => {
      const { data } = await db
        .from("app_settings")
        .select("value")
        .eq("key", CM_SETTINGS_KEY)
        .maybeSingle();
      return parseCmSettings(data?.value);
    },
  });

  const clientById = new Map((clients.data ?? []).map((c) => [c.id, c]));
  const error = clients.error ?? sessions.error ?? accounts.error;

  return {
    clients: clients.data ?? [],
    sessions: sessions.data ?? [],
    accounts: accounts.data ?? [],
    settings: settings.data ?? parseCmSettings(null),
    clientById,
    loading: clients.isLoading || sessions.isLoading || accounts.isLoading,
    error,
    missingTables: error ? isMissingTableError(error) : false,
  };
}

export type CmData = ReturnType<typeof useCmData>;

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

/** Find an existing client by phone/email, or create one. Keeps the list free of duplicates when booking from the journal. */
export async function findOrCreateClient(
  input: { full_name: string; phone?: string; email?: string },
  existing: CmClient[],
) {
  const phone = (input.phone ?? "").replace(/\D/g, "");
  const email = (input.email ?? "").trim().toLowerCase();
  const match = existing.find(
    (c) =>
      (phone && (c.phone ?? "").replace(/\D/g, "") === phone) ||
      (email && (c.email ?? "").toLowerCase() === email),
  );
  if (match) return match.id;
  const { data, error } = await db
    .from("cm_clients")
    .insert({
      full_name: input.full_name.trim(),
      phone: input.phone?.trim() || null,
      email: email || null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export { db as cmDb };

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

/** Whether GOOGLE_DRIVE_API_KEY is set — lets /admin/backup show a setup banner instead of failing silently on the first manual run. */
export const getBackupConfigStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { isDriveConfigured } = await import("@/integrations/google/drive.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "last_data_backup_at")
      .maybeSingle();
    return {
      configured: isDriveConfigured(),
      lastBackupAt: data?.value ?? null,
    };
  });

/** Manual "גיבוי עכשיו" button — runs the same backup the daily cron runs, right now, regardless of whether one already ran today. */
export const runManualBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { runDataBackup } = await import("@/lib/data-backup.server");
    return runDataBackup();
  });

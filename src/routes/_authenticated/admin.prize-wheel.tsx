import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Disc3, Loader2 } from "lucide-react";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
import { heError } from "@/lib/he-errors";

export const Route = createFileRoute("/_authenticated/admin/prize-wheel")({
  component: AdminPrizeWheelPage,
});

// app_settings is a new table — cast until the generated Database type
// (types.ts) picks it up on next generation.
const supabase = supabaseTyped as any;

const SETTING_KEY = "prize_wheel_enabled";

async function fetchEnabled(): Promise<boolean> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SETTING_KEY)
    .maybeSingle();
  // Fails closed (disabled) if the row is missing — same default the
  // customer-facing check (isWheelEnabled in wheel.functions.ts) uses.
  return data?.value === "true";
}

function AdminPrizeWheelPage() {
  const qc = useQueryClient();
  const current = useQuery({ queryKey: ["prize-wheel-setting"], queryFn: fetchEnabled });
  const [busy, setBusy] = useState(false);

  const setEnabled = async (enabled: boolean) => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("app_settings")
        .upsert(
          { key: SETTING_KEY, value: enabled ? "true" : "false", updated_at: new Date().toISOString() },
          { onConflict: "key" },
        );
      if (error) throw error;
      toast.success(enabled ? "גלגל המתנות הופעל" : "גלגל המתנות הוקפא");
      qc.invalidateQueries({ queryKey: ["prize-wheel-setting"] });
    } catch (e) {
      toast.error(heError(e));
    } finally {
      setBusy(false);
    }
  };

  const enabled = current.data ?? false;

  return (
    <div dir="rtl" className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-primary flex items-center gap-2">
          <Disc3 className="h-5 w-5" /> גלגל המתנות
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          הגלגל מוצג לכל הזמנת סטודיו של 3 שעות ומעלה (או כל שירות צילום עם מיכל, בכל אורך), בעמוד
          אישור התשלום של הלקוחה. מתג זה מפעיל/מקפיא את הגלגל לכולן בבת אחת — אין צורך לשנות את כלל
          הזכאות עצמו. לקוחה שכבר זכתה בפרס לפני ההקפאה עדיין תראה את הפרס שלה.
        </p>
      </div>

      <section className="rounded-3xl border border-primary/10 bg-card p-5 space-y-4">
        {current.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> טוען...
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                סטטוס: <span className={enabled ? "text-forest" : "text-destructive"}>{enabled ? "מופעל" : "מוקפא"}</span>
              </span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setEnabled(true)}
                disabled={busy || enabled}
                className={`flex-1 h-12 rounded-2xl border text-sm font-medium transition-colors disabled:opacity-60 ${
                  enabled ? "border-primary bg-primary/5 text-primary" : "border-primary/10 hover:bg-muted"
                }`}
              >
                הפעלה
              </button>
              <button
                onClick={() => setEnabled(false)}
                disabled={busy || !enabled}
                className={`flex-1 h-12 rounded-2xl border text-sm font-medium transition-colors disabled:opacity-60 ${
                  !enabled ? "border-destructive bg-destructive/5 text-destructive" : "border-primary/10 hover:bg-muted"
                }`}
              >
                הקפאה
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

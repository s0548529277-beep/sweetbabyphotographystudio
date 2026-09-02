import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Phone, Loader2, Check } from "lucide-react";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
import { heError } from "@/lib/he-errors";
import {
  VOICE_OPTIONS,
  VOICE_OPTION_LABELS,
  type VoiceBotVoiceOption,
} from "@/lib/voice-bot-options";

export const Route = createFileRoute("/_authenticated/admin/voice-bot")({
  component: AdminVoiceBotPage,
});

// app_settings is a new table — cast until the generated Database type
// (types.ts) picks it up on next generation.
const supabase = supabaseTyped as any;

const SETTING_KEY = "voice_bot_voice";

async function fetchVoice(): Promise<VoiceBotVoiceOption> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SETTING_KEY)
    .maybeSingle();
  return (VOICE_OPTIONS as readonly string[]).includes(data?.value) ? data.value : "female";
}

function AdminVoiceBotPage() {
  const qc = useQueryClient();
  const current = useQuery({ queryKey: ["voice-bot-setting"], queryFn: fetchVoice });
  const [busy, setBusy] = useState<VoiceBotVoiceOption | null>(null);

  const choose = async (option: VoiceBotVoiceOption) => {
    setBusy(option);
    try {
      const { error } = await supabase
        .from("app_settings")
        .upsert(
          { key: SETTING_KEY, value: option, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        );
      if (error) throw error;
      toast.success("קול הבוט הטלפוני עודכן");
      qc.invalidateQueries({ queryKey: ["voice-bot-setting"] });
    } catch (e) {
      toast.error(heError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div dir="rtl" className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-primary flex items-center gap-2">
          <Phone className="h-5 w-5" /> הבוט הקולי בטלפון — קול
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          קובע את הקול שבו הבוט הקולי (נועה) מדברת בשיחות דרך <b>Twilio</b> — נכנס לתוקף באופן
          מיידי, בלי דיפלוי. <b>זה לא משפיע על השיחות דרך ימות המשיח</b> — שם ההקראה היא הקול המובנה
          של ימות עצמה, ומשנים אותו רק בממשק הניהול של ימות המשיח (לא באתר בכלל). את הנוסח/מגדר
          הדקדוקי של מה שהבוט אומר על עצמו (בשני הערוצים) אפשר לשנות בעמוד "מלל בוט הטלפון".
        </p>
      </div>

      <section className="rounded-3xl border border-primary/10 bg-card p-5 space-y-3">
        {current.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> טוען...
          </div>
        ) : (
          VOICE_OPTIONS.map((option) => {
            const isSelected = current.data === option;
            const isBusy = busy === option;
            return (
              <button
                key={option}
                onClick={() => choose(option)}
                disabled={busy !== null}
                className={`w-full flex items-center justify-between gap-3 rounded-2xl border px-4 h-14 text-right transition-colors disabled:opacity-60 ${
                  isSelected ? "border-primary bg-primary/5" : "border-primary/10 hover:bg-muted"
                }`}
              >
                <span className="text-sm">{VOICE_OPTION_LABELS[option]}</span>
                {isBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                ) : isSelected ? (
                  <Check className="h-4 w-4 text-primary shrink-0" />
                ) : (
                  <span className="h-4 w-4 shrink-0" />
                )}
              </button>
            );
          })
        )}
      </section>
    </div>
  );
}

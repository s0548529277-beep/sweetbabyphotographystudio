import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listVoiceBotPhrases, resetVoiceBotPhrase, updateVoiceBotPhrase, type VoiceBotPhraseRow } from "@/lib/admin-voice-phrases.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/voice-bot-text")({
  component: VoiceBotTextAdmin,
});

function PhraseCard({ row }: { row: VoiceBotPhraseRow }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(row.value);
  const [saving, setSaving] = useState(false);
  const doUpdate = useServerFn(updateVoiceBotPhrase);
  const doReset = useServerFn(resetVoiceBotPhrase);
  const changed = draft !== row.value;

  const save = async () => {
    setSaving(true);
    try {
      await doUpdate({ data: { key: row.key, value: draft } });
      toast.success("נשמר — עכשיו יעבוד ישירות בשיחות הבאות");
      qc.invalidateQueries({ queryKey: ["admin-voice-bot-phrases"] });
    } catch (e: any) {
      toast.error(e?.message ?? "השמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!confirm("לאפס לניסוח המקורי?")) return;
    setSaving(true);
    try {
      await doReset({ data: { key: row.key } });
      toast.success("אופס לברירת המחדל");
      qc.invalidateQueries({ queryKey: ["admin-voice-bot-phrases"] });
    } catch (e: any) {
      toast.error(e?.message ?? "האיפוס נכשל");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-primary/5 p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium text-primary text-sm">{row.label}</div>
        {!row.isDefault && <span className="text-[11px] bg-blush/40 text-primary rounded-full px-2 py-0.5 shrink-0">מותאם אישית</span>}
      </div>
      <Textarea
        dir="rtl"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={row.value.length > 200 ? 8 : 2}
        className="text-sm leading-relaxed"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{draft.length} תווים</span>
        <div className="flex gap-2">
          {!row.isDefault && (
            <Button size="sm" variant="ghost" className="rounded-full gap-1.5" disabled={saving} onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" /> איפוס לברירת מחדל
            </Button>
          )}
          <Button size="sm" className="rounded-full gap-1.5" disabled={saving || !changed || !draft.trim()} onClick={save}>
            <Save className="h-3.5 w-3.5" /> שמירה
          </Button>
        </div>
      </div>
    </div>
  );
}

function VoiceBotTextAdmin() {
  const fetchPhrases = useServerFn(listVoiceBotPhrases);
  const q = useQuery({ queryKey: ["admin-voice-bot-phrases"], queryFn: () => fetchPhrases({}) });
  const rows = (q.data ?? []) as VoiceBotPhraseRow[];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="font-display text-xl text-primary mb-1 flex items-center gap-2">
          <Mic className="h-5 w-5" /> מלל בוט הטלפון
        </h2>
        <p className="text-sm text-muted-foreground">
          כל מה שהבוט הקולי (שני הקווים) אומר בקול, מילה במילה. עריכה כאן משנה מיד מה שנשמע בשיחה הבאה — בלי צורך בפריסה מחדש.
          הניקוד (הסימנים מעל ומתחת לאותיות) עוזר להקראה נכונה — עדיף לא למחוק אותו כשעורכים.
        </p>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          // Remount whenever the resolved value changes (after a save or
          // reset elsewhere/refetch) so local draft state can't go stale.
          <PhraseCard key={`${row.key}:${row.value}`} row={row} />
        ))}
        {q.isLoading && <p className="text-sm text-muted-foreground text-center py-10">טוען…</p>}
      </div>
    </div>
  );
}

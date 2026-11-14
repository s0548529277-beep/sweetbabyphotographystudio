import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, RotateCcw, Save } from "lucide-react";
import { getContractTextForAdmin, saveContractText } from "@/lib/contract-text.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/admin/contract-text")({
  component: ContractTextAdmin,
});

const KINDS = [
  { id: "outdoor", label: "צילומי חוץ" },
  { id: "photo", label: "צילום כללי" },
] as const;

function ContractTextAdmin() {
  const qc = useQueryClient();
  const getFn = useServerFn(getContractTextForAdmin);
  const saveFn = useServerFn(saveContractText);
  const [kind, setKind] = useState<"outdoor" | "photo">("outdoor");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ["admin-contract-text", kind],
    queryFn: () => getFn({ data: { kind } }),
  });

  useEffect(() => {
    if (query.data) setDrafts(Object.fromEntries(query.data.sections.map((s) => [s.title, s.text])));
  }, [query.data]);

  const changed = (query.data?.sections ?? []).some((s) => !s.locked && (drafts[s.title] ?? s.text).trim() !== s.text.trim());

  const save = async () => {
    setSaving(true);
    try {
      const res = await saveFn({ data: { kind, texts: drafts } });
      toast.success(res.changed ? "נשמר — יחול על חוזים שיישלחו מעכשיו" : "הכול חזר לנוסח המקורי");
      await qc.invalidateQueries({ queryKey: ["admin-contract-text", kind] });
    } catch (e: any) {
      toast.error(e?.message ?? "השמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div dir="rtl" className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-display text-2xl text-primary">נוסח חוזים — צילומי חוץ וצילום כללי</h2>
          <p className="text-sm text-muted-foreground">עריכה קבועה של הסעיפים. כל פסקה בשורה נפרדת.</p>
        </div>
      </div>

      <div className="flex gap-2">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setKind(k.id)}
            className={`rounded-full px-4 h-8 text-sm border ${kind === k.id ? "bg-primary text-primary-foreground" : "border-primary/15 hover:bg-cream"}`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground rounded-xl bg-cream/60 p-3">
        השינוי חל על חוזים שיישלחו מעכשיו ועל לקוחות שעוד לא קיבלו חוזה. חוזה שכבר נשלח נשאר כפי שנשלח. סעיפים שמתמלאים אוטומטית מפרטי הלקוחה (תאריך, חבילה, מקדמה) אינם ניתנים לעריכה כאן. לשינוי ללקוחה אחת בלבד, יש להשתמש בעריכה החד-פעמית בתצוגה המקדימה של החוזה בכרטיס שלה.
      </p>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">טוען…</p>
      ) : (
        <div className="space-y-4">
          {(query.data?.sections ?? []).map((s) => {
            const edited = (drafts[s.title] ?? s.text).trim() !== s.defaultText.trim();
            return (
              <div key={s.title} className="bg-card rounded-2xl border border-primary/10 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-sm">
                    {s.title}
                    {edited && <span className="ms-2 text-xs text-amber-700">נערך</span>}
                  </h3>
                  {!s.locked && edited && (
                    <button
                      type="button"
                      onClick={() => setDrafts((d) => ({ ...d, [s.title]: s.defaultText }))}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                    >
                      <RotateCcw className="h-3 w-3" /> החזרה לנוסח המקורי
                    </button>
                  )}
                </div>
                <Textarea
                  value={drafts[s.title] ?? s.text}
                  disabled={s.locked}
                  onChange={(e) => setDrafts((d) => ({ ...d, [s.title]: e.target.value }))}
                  rows={Math.min(10, Math.max(2, (drafts[s.title] ?? s.text).split("\n").length + 1))}
                  className="text-sm leading-relaxed"
                  dir="rtl"
                />
                {s.locked && <p className="text-xs text-muted-foreground">מתמלא אוטומטית מפרטי הלקוחה, לא ניתן לעריכה.</p>}
              </div>
            );
          })}
          <div className="sticky bottom-2 flex justify-end">
            <Button onClick={save} disabled={saving || !changed} className="gap-1.5 rounded-full shadow">
              <Save className="h-4 w-4" /> שמירת השינויים
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

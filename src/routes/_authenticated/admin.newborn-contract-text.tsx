import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RotateCcw, Save, FileText } from "lucide-react";
import {
  getNewbornContractTemplateForAdmin,
  updateNewbornContractTemplate,
  resetNewbornContractTemplate,
} from "@/lib/newborn-orders.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/admin/newborn-contract-text")({
  component: NewbornContractTextAdmin,
});

const TOKENS: { token: string; desc: string }[] = [
  { token: "{{contact_name}}", desc: "שם הלקוחה" },
  { token: "{{package_line}}", desc: "שורת פרטי החבילה" },
  { token: "{{price_line}}", desc: "שורת המחיר הכולל" },
  { token: "{{extra_photo_price}}", desc: "מחיר תמונה נוספת" },
  { token: "{{session_date_line}}", desc: "שורת תאריך הצילומים" },
  { token: "{{session_time_line}}", desc: "שורת שעת הצילומים" },
  { token: "{{confirm_link}}", desc: "הקישור לאישור קריאת ההסכם" },
];

function NewbornContractTextAdmin() {
  const qc = useQueryClient();
  const getTemplate = useServerFn(getNewbornContractTemplateForAdmin);
  const doUpdate = useServerFn(updateNewbornContractTemplate);
  const doReset = useServerFn(resetNewbornContractTemplate);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ["admin-newborn-contract-template"],
    queryFn: () => getTemplate(),
  });

  useEffect(() => {
    if (query.data) setDraft(query.data.value);
  }, [query.data]);

  const changed = query.data ? draft !== query.data.value : false;

  const save = async () => {
    setSaving(true);
    try {
      await doUpdate({ data: { value: draft } });
      toast.success("נשמר — ישלח אוטומטית בהזמנות הבאות");
      qc.invalidateQueries({ queryKey: ["admin-newborn-contract-template"] });
    } catch (e: any) {
      toast.error(e?.message ?? "השמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!confirm("לאפס לנוסח המקורי? השינויים שלך יימחקו.")) return;
    setSaving(true);
    try {
      await doReset();
      toast.success("אופס לנוסח המקורי");
      await qc.invalidateQueries({ queryKey: ["admin-newborn-contract-template"] });
    } catch (e: any) {
      toast.error(e?.message ?? "האיפוס נכשל");
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
          <h2 className="font-display text-2xl text-primary">מלל "הכנה ליום הצילומים"</h2>
          <p className="text-sm text-muted-foreground">
            המדריך + ההסכם שנשלחים אוטומטית ללקוחות ניו-בורן כשנפתחת הזמנה
          </p>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-primary/10 p-5 space-y-3 text-sm text-muted-foreground">
        <p>
          שורה שמתחילה ב-
          <code dir="ltr" className="bg-muted px-1 rounded">
            ##{" "}
          </code>{" "}
          פותחת כותרת/סעיף חדש. שורה ריקה מפרידה בין פסקאות. שורות שכולן מתחילות ב-
          <code dir="ltr" className="bg-muted px-1 rounded">
            -{" "}
          </code>{" "}
          הופכות לרשימת תבליטים.
        </p>
        <div className="flex flex-wrap gap-2">
          {TOKENS.map((t) => (
            <span
              key={t.token}
              className="inline-flex items-center gap-1 bg-cream rounded-full px-3 py-1 text-xs"
              title={t.desc}
            >
              <code dir="ltr" className="font-mono">
                {t.token}
              </code>
              <span className="text-muted-foreground">— {t.desc}</span>
            </span>
          ))}
        </div>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">טוען…</p>
      ) : (
        <div className="bg-card rounded-2xl border border-primary/10 p-5 space-y-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={28}
            className="font-mono text-sm leading-relaxed"
            dir="rtl"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {query.data?.isDefault
                ? "מוצג הנוסח המקורי (לא נערך עדיין)"
                : "נערך — שונה מהנוסח המקורי"}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={reset}
                disabled={saving}
                className="gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" /> איפוס לברירת מחדל
              </Button>
              <Button size="sm" onClick={save} disabled={saving || !changed} className="gap-1.5">
                <Save className="h-3.5 w-3.5" /> שמירה
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

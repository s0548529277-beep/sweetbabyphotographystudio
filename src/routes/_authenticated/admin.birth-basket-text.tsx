import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RotateCcw, Save, Gift, Images } from "lucide-react";
import {
  getBirthBasketTemplateForAdmin,
  updateBirthBasketTemplate,
  resetBirthBasketTemplate,
} from "@/lib/newborn-orders.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/admin/birth-basket-text")({
  component: BirthBasketTextAdmin,
});

const TOKENS: { token: string; desc: string }[] = [
  { token: "{{contact_name}}", desc: "שם הפונה" },
  { token: "{{album_line}}", desc: "שורה על אלבום מודפס (משתנה לפי מה שסימנה)" },
];

function BirthBasketTextAdmin() {
  const qc = useQueryClient();
  const getTemplate = useServerFn(getBirthBasketTemplateForAdmin);
  const doUpdate = useServerFn(updateBirthBasketTemplate);
  const doReset = useServerFn(resetBirthBasketTemplate);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ["admin-birth-basket-template"],
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
      toast.success('נשמר — ישלח אוטומטית למי שלוחצת "מעוניינת במימוש סל לידה"');
      qc.invalidateQueries({ queryKey: ["admin-birth-basket-template"] });
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
      await qc.invalidateQueries({ queryKey: ["admin-birth-basket-template"] });
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
          <Gift className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-display text-2xl text-primary">מלל מימוש סל לידה</h2>
          <p className="text-sm text-muted-foreground">
            המייל האוטומטי שנשלח למי שלוחצת "מעוניינת במימוש סל לידה" ב-/newborn — פרטי חבילות,
            מחירים ואלבום
          </p>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-primary/10 p-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Images className="h-4 w-4" /> תמונות שמופיעות בראש המייל מנוהלות בנפרד
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/gallery">לניהול תמונות "סל לידה" ←</Link>
        </Button>
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
            rows={22}
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

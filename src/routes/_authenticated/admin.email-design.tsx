import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { DEFAULT_EMAIL_DESIGN, applyEmailDesignToHtml, sanitizeEmailDesign, type BrandDesign, type EmailDesign } from "@/lib/email-design";
import { buildBrandedMailHtml, buildDraftHtml, buildStudioMailHtml } from "@/lib/email-draft-design";
import { createMichalBlankDraft, getEmailDesign, setEmailDesign } from "@/lib/email-design.functions";
import { GalleryImagePicker } from "@/components/GalleryImagePicker";

// עיצוב מיילים: colours + frame of the two mail looks (studio / photographer) and the photos of the price-list cards.
// Applied by sendGmail / createGmailHtmlDraft right before sending (see email-design.ts). The text of each mail is unchanged.

export const Route = createFileRoute("/_authenticated/admin/email-design")({
  component: EmailDesignAdmin,
});

const SAMPLE_STUDIO = `<p>שלום שירה,</p><p>קיבלנו את התשלום וההזמנה מאושרת. מחכות לפגוש אותך!</p>
<div style="background:#faf7f4;border-radius:8px;padding:10px 14px;margin:10px 0"><div style="font-size:12px;color:#6b8a63;font-weight:bold">תאריך</div><div>09.11.2026 · כ״ט בחשוון תשפ״ז</div></div>
<div style="text-align:center;margin:16px 0"><span style="display:inline-block;background:#2d3d2b;color:#fff;padding:10px 24px;border-radius:22px;font-weight:bold">להמשך בצ׳אט</span></div>`;
const SAMPLE_PHOTO = `<p>שלום שירה,</p><p>התמונות שלך מוכנות לבחירה בגלריה.</p>`;

function Colour({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col items-center gap-1 text-xs">
      {label}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="size-12 cursor-pointer rounded-lg border bg-white p-1" />
    </label>
  );
}

function BrandCard({ title, value, defaults, onChange }: { title: string; value: BrandDesign; defaults: BrandDesign; onChange: (b: BrandDesign) => void }) {
  const set = (k: keyof BrandDesign, v: string) => onChange({ ...value, [k]: v } as BrandDesign);
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg">{title}</h2>
        <button type="button" onClick={() => onChange(defaults)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm">
          <RotateCcw className="size-4" /> איפוס
        </button>
      </div>
      <div className="flex flex-wrap gap-4">
        <Colour label="רקע - התחלה" value={value.from} onChange={(v) => set("from", v)} />
        <Colour label="רקע - אמצע" value={value.mid} onChange={(v) => set("mid", v)} />
        <Colour label="רקע - סוף" value={value.to} onChange={(v) => set("to", v)} />
        <Colour label="כותרות וכפתורים" value={value.accent} onChange={(v) => set("accent", v)} />
      </div>
      <div className="flex gap-2 text-sm">
        {(["thick", "thin"] as const).map((f) => (
          <button key={f} type="button" onClick={() => set("frame", f)} className={`rounded-lg border px-4 py-1.5 ${value.frame === f ? "bg-primary text-primary-foreground" : ""}`}>
            {f === "thick" ? "מסגרת עבה" : "מסגרת דקה"}
          </button>
        ))}
      </div>
    </section>
  );
}

function Preview({ html, title }: { html: string; title: string }) {
  return (
    <div className="space-y-1">
      <div className="text-sm text-muted-foreground">{title}</div>
      <iframe title={title} srcDoc={`<meta charset="utf-8"><body style="margin:0">${html}`} className="h-[640px] w-full rounded-xl border bg-white" />
    </div>
  );
}

function EmailDesignAdmin() {
  const load = useServerFn(getEmailDesign);
  const save = useServerFn(setEmailDesign);
  const makeDraft = useServerFn(createMichalBlankDraft);
  const [drafting, setDrafting] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["email-design-admin"], queryFn: () => load() });
  const [d, setD] = useState<EmailDesign>(DEFAULT_EMAIL_DESIGN);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data && !dirty) setD(data);
  }, [data, dirty]);

  const upd = (fn: (x: EmailDesign) => void) => {
    setD((o) => {
      const c = structuredClone(o);
      fn(c);
      return c;
    });
    setDirty(true);
  };

  const previews = useMemo(() => {
    const ap = (h: string) => applyEmailDesignToHtml(h, d);
    return {
      studio: ap(buildStudioMailHtml({ title: "אישור הזמנה — השכרת סטודיו", innerHtml: SAMPLE_STUDIO })),
      photographer: ap(buildBrandedMailHtml({ title: "התמונות מחכות לך", innerHtml: SAMPLE_PHOTO })),
      prices: ap(
        buildDraftHtml({
          brand: "photographer",
          body: "היי, תודה על הפנייה! מצורפים המחירונים שלי.",
          priceList: "both",
          cardPhotos: { newborn: d.cardPhotos.newborn, outdoor: d.cardPhotos.outdoor },
        }),
      ),
    };
  }, [d]);

  const onSave = async () => {
    setSaving(true);
    try {
      const r = await save({ data: { design: d } });
      setD(r.design);
      setDirty(false);
      toast.success("העיצוב נשמר — המיילים הבאים ייצאו בו");
    } catch (e: any) {
      toast.error(e?.message ?? "השמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <Loader2 className="mx-auto mt-10 size-6 animate-spin" />;

  const photoRow = (kind: "newborn" | "outdoor", label: string) => (
    <section className="space-y-3 rounded-2xl border bg-card p-4">
      <h2 className="text-lg">{label}</h2>
      <p className="text-xs text-muted-foreground">שלוש תמונות לכרטיסי המחירון (קסם/מיני, פופולארית/מפנקת, חלום/חלומית). ריק = תמונות הדוגמה של עוזרת הטיוטות.</p>
      <p className="text-xs text-amber-700">רק תמונות של תינוקות וילדים.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <GalleryImagePicker
            key={i}
            value={d.cardPhotos[kind][i]}
            onChange={(v) =>
              upd((x) => {
                const arr = [...x.cardPhotos[kind]];
                if (v) arr[i] = v;
                else arr.splice(i, 1);
                x.cardPhotos[kind] = arr.filter(Boolean);
              })
            }
          />
        ))}
      </div>
    </section>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-1" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">עיצוב מיילים</h1>
        <button type="button" disabled={!dirty || saving} onClick={onSave} className="rounded-xl bg-primary px-6 py-2 text-primary-foreground disabled:opacity-50">
          {saving ? "שומרת…" : dirty ? "שמירה" : "נשמר"}
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        צבעי הרקע, כותרות, עובי המסגרת ותמונות המחירון של המיילים האוטומטיים והטיוטות. הטקסטים לא משתנים כאן. התצוגות למטה מתעדכנות מיד.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <BrandCard title="סטודיו (Sweetbaby)" value={d.studio} defaults={DEFAULT_EMAIL_DESIGN.studio} onChange={(b) => upd((x) => { x.studio = b; })} />
        <BrandCard title="צלמת (מיכל סיבוני)" value={d.photographer} defaults={DEFAULT_EMAIL_DESIGN.photographer} onChange={(b) => upd((x) => { x.photographer = b; })} />
      </div>
      {photoRow("newborn", "תמונות מחירון ניו בורן")}
      {photoRow("outdoor", "תמונות מחירון צילומי חוץ")}
      <div className="grid gap-4 lg:grid-cols-2">
        <Preview title="דוגמה: מייל סטודיו" html={previews.studio} />
        <Preview title="דוגמה: מייל צלמת" html={previews.photographer} />
      </div>
      <Preview title="דוגמה: טיוטת מחירונים של הצלמת" html={previews.prices} />
      <button
        type="button"
        disabled={drafting}
        onClick={async () => {
          setDrafting(true);
          try {
            await makeDraft();
            toast.success("נוצרה טיוטה ריקה ב-Gmail של מיכל (בטיוטות)");
          } catch (e: any) {
            toast.error(e?.message || "יצירת הטיוטה נכשלה");
          } finally {
            setDrafting(false);
          }
        }}
        className="me-2 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
      >
        {drafting ? "יוצרת…" : "יצירת טיוטה ריקה של מיכל ב-Gmail"}
      </button>
      <button type="button" onClick={() => { setD(sanitizeEmailDesign(null)); setDirty(true); }} className="rounded-lg border px-3 py-1.5 text-sm">
        איפוס הכל לברירת המחדל
      </button>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ImagePlus, Loader2, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { ENTRY_QUESTION, FUNNEL_LABELS, FUNNEL_QUESTIONS, type FunnelId } from "@/lib/funnels";
import { FUNNEL_THEMES } from "@/lib/funnel-theme";
import { ALL_FUNNELS, sanitizeFunnelOverrides, type FunnelOverrides } from "@/lib/funnel-overrides";
import { getFunnelOverrides, setFunnelOverrides } from "@/lib/funnels.functions";
import { LANDING_DEFAULTS } from "@/routes/go.$funnel";
import { Copy, ExternalLink } from "lucide-react";
import { GalleryImagePicker as ImagePicker } from "@/components/GalleryImagePicker";

// עורך משפכים: texts, answers, photos, own questions and colours of the four funnels. Scoring / recommendations stay in code.

export const Route = createFileRoute("/_authenticated/admin/funnel-editor")({
  component: FunnelEditor,
});

const GALLERY_BASE = "https://michalsiboni.co.il/images/gallery/";
const newId = (p: string) => `${p}${Math.random().toString(36).slice(2, 7)}`;
const inp = "w-full rounded-lg border bg-white px-3 py-2 text-base";

function FunnelEditor() {
  const qc = useQueryClient();
  const load = useServerFn(getFunnelOverrides);
  const save = useServerFn(setFunnelOverrides);
  const { data, isLoading } = useQuery({ queryKey: ["funnel-overrides-admin"], queryFn: () => load() });
  const [ov, setOv] = useState<FunnelOverrides>({});
  const [fid, setFid] = useState<FunnelId>("studio");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data && !dirty) setOv(data);
  }, [data, dirty]);

  const update = (fn: (o: FunnelOverrides) => void) => {
    setOv((o) => {
      const c = structuredClone(o);
      fn(c);
      return c;
    });
    setDirty(true);
  };
  const f = (o: FunnelOverrides) => (o[fid] ??= {});

  const doSave = async (value: FunnelOverrides) => {
    setSaving(true);
    try {
      const res = await save({ data: { overrides: value } });
      toast.success("נשמר — מופיע באתר תוך כמה דקות (רענון הדף)");
      setDirty(false);
      setOv(res.overrides);
      qc.invalidateQueries({ queryKey: ["funnel-overrides"] });
      qc.invalidateQueries({ queryKey: ["funnel-overrides-admin"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "השמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <Loader2 className="m-10 animate-spin" />;
  const base = fid === "entry" ? [ENTRY_QUESTION] : FUNNEL_QUESTIONS[fid];
  const cur = ov[fid] ?? {};
  const theme = FUNNEL_THEMES[fid];
  const to = cur.theme ?? {};

  return (
    <div dir="rtl" className="mx-auto max-w-4xl space-y-5 pb-28">
      <div>
        <h1 className="text-2xl">עורך משפכים</h1>
        <p className="text-sm text-muted-foreground">
          שינוי טקסטים, תשובות, תמונות, צבעים ושאלות משלך בכל משפך. החישוב והמלצות החבילה/המחירים נשארים כמו שהם. מה שלא שונה — לא משתנה.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {ALL_FUNNELS.map((id) => (
          <button key={id} type="button" onClick={() => setFid(id)} className={`rounded-full border px-4 py-1.5 text-sm ${fid === id ? "bg-primary text-primary-foreground" : "bg-white"}`}>
            {FUNNEL_LABELS[id]}
          </button>
        ))}
      </div>

      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <h2 className="text-lg">עיצוב וכיתובים</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm">צבע התחלה<input type="color" className="block h-10 w-full rounded-lg border" value={to.from ?? "#4a3221"} onChange={(e) => update((o) => { (f(o).theme ??= {}).from = e.target.value; })} /></label>
          <label className="space-y-1 text-sm">צבע סיום<input type="color" className="block h-10 w-full rounded-lg border" value={to.to ?? "#a47a45"} onChange={(e) => update((o) => { (f(o).theme ??= {}).to = e.target.value; })} /></label>
          <label className="space-y-1 text-sm">צבע כפתורים<input type="color" className="block h-10 w-full rounded-lg border" value={to.solid ?? theme.solid} onChange={(e) => update((o) => { (f(o).theme ??= {}).solid = e.target.value; })} /></label>
        </div>
        <div className="h-10 rounded-full" style={{ background: `linear-gradient(135deg, ${to.from ?? "#4a3221"}, ${to.to ?? "#a47a45"})` }} />
        <div className="grid gap-3 sm:grid-cols-2">
          {([["title", "כותרת החלון", theme.title], ["emoji", "אימוג׳י", theme.emoji], ["floatLabel", "כיתוב הכפתור הצף", theme.floatLabel], ["floatSub", "שורה קטנה בכפתור", theme.floatSub]] as const).map(([k, label, ph]) => (
            <label key={k} className="space-y-1 text-sm">
              {label}
              <input className={inp} placeholder={ph} defaultValue={to[k] ?? ""} onBlur={(e) => update((o) => { (f(o).theme ??= {})[k] = e.target.value; })} />
            </label>
          ))}
        </div>
        <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => update((o) => { delete f(o).theme; })}>איפוס עיצוב</button>
      </section>

      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <h2 className="text-lg">דף נחיתה וקישורים</h2>
        <input className={inp} placeholder={LANDING_DEFAULTS[fid].headline} defaultValue={cur.landing?.headline ?? ""} key={fid + "h"} onBlur={(e) => update((o) => { (f(o).landing ??= {}).headline = e.target.value; })} />
        <textarea className={inp} rows={2} placeholder={LANDING_DEFAULTS[fid].text} defaultValue={cur.landing?.text ?? ""} key={fid + "t"} onBlur={(e) => update((o) => { (f(o).landing ??= {}).text = e.target.value; })} />
        <label className="block space-y-1 text-sm">
          נקודות עם סימן V (שורה לכל נקודה, עד 5; ריק = ברירת המחדל)
          <textarea className={inp} rows={3} key={fid + "b"} defaultValue={(cur.landing?.bullets ?? []).join("\n")} onBlur={(e) => update((o) => { (f(o).landing ??= {}).bullets = e.target.value.split("\n").map((x) => x.trim()).filter(Boolean); })} />
        </label>
        <ImagePicker value={cur.landing?.image} onChange={(v) => update((o) => { (f(o).landing ??= {}).image = v ?? undefined; })} />
        <div className="space-y-1.5">
          {[{ id: "", label: "קישור רגיל" }, { id: "instagram", label: "אינסטגרם" }, { id: "facebook", label: "פייסבוק" }, { id: "whatsapp", label: "וואטסאפ / סטטוס" }, { id: "google", label: "גוגל" }, { id: "email", label: "ניוזלטר" }].map((s2) => {
            const base2 = `https://sweetbabyphoto.shop/go/${fid}`;
            const url = s2.id ? `${base2}?utm_source=${s2.id}&utm_medium=social&utm_campaign=${fid}` : base2;
            return (
              <div key={s2.id || "plain"} className="flex items-center gap-2 text-sm">
                <span className="w-28 shrink-0">{s2.label}</span>
                <input readOnly dir="ltr" className="min-w-0 flex-1 rounded-lg border bg-muted/40 px-2 py-1 text-xs" value={url} onFocus={(e) => e.currentTarget.select()} />
                <button type="button" className="rounded-lg border p-1.5" aria-label="העתקה" onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("הקישור הועתק"))}>
                  <Copy className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
        <a href={`/go/${fid}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline">
          <ExternalLink className="size-4" /> פתיחת הדף
        </a>
      </section>

      {base.map((q) => {
        const qo = cur.questions?.[q.id];
        return (
          <section key={q.id} className="space-y-3 rounded-2xl border bg-card p-4">
            <input className={inp} defaultValue={qo?.title ?? q.title} key={fid + q.id + (qo?.title ?? "")} onBlur={(e) => update((o) => { const qq = ((f(o).questions ??= {})[q.id] ??= {}); qq.title = e.target.value === q.title ? undefined : e.target.value; })} />
            {q.options.map((o) => {
              const oo = qo?.options?.[o.id];
              const image = oo?.image === null ? undefined : (oo?.image ?? o.image);
              const setO = (patch: Record<string, unknown>) => update((x) => { const qq = ((f(x).questions ??= {})[q.id] ??= {}); qq.options = { ...(qq.options ?? {}), [o.id]: { ...(qq.options?.[o.id] ?? {}), ...patch } }; });
              return (
                <div key={o.id} className={`grid gap-2 rounded-xl border bg-white p-3 md:grid-cols-[1fr_1fr_auto] ${oo?.hidden ? "opacity-50" : ""}`}>
                  <div className="space-y-1.5">
                    <input className={inp} defaultValue={oo?.label ?? o.label} onBlur={(e) => setO({ label: e.target.value === o.label ? undefined : e.target.value })} />
                    <input className={inp} placeholder="משפט קצר מתחת (לא חובה)" defaultValue={oo?.hint ?? o.hint ?? ""} onBlur={(e) => setO({ hint: e.target.value === (o.hint ?? "") ? undefined : e.target.value })} />
                  </div>
                  <ImagePicker value={image} onChange={(v) => setO({ image: v })} />
                  <button type="button" onClick={() => setO({ hidden: !oo?.hidden })} className="self-start rounded-lg border px-3 py-2" aria-label="הסתרה או החזרה">
                    {oo?.hidden ? <RotateCcw className="size-4" /> : <Trash2 className="size-4" />}
                  </button>
                </div>
              );
            })}
          </section>
        );
      })}

      {fid !== "entry" && (
        <section className="space-y-3 rounded-2xl border bg-card p-4">
          <h2 className="text-lg">שאלות משלך (לא משפיעות על ההמלצה והמחיר)</h2>
          <p className="text-xs text-muted-foreground">התשובות מופיעות בליד ובמייל אלייך.</p>
          {(cur.custom ?? []).map((c, ci) => (
            <div key={c.id} className="space-y-2 rounded-xl border bg-white p-3">
              <div className="flex gap-2">
                <input className={inp} defaultValue={c.title} onBlur={(e) => update((o) => { f(o).custom![ci].title = e.target.value; })} />
                <button type="button" className="shrink-0 rounded-lg border px-3" onClick={() => update((o) => { f(o).custom!.splice(ci, 1); })}><Trash2 className="size-4" /></button>
              </div>
              {c.options.map((op, oi) => (
                <div key={op.id} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                  <input className={inp} defaultValue={op.label} onBlur={(e) => update((o) => { f(o).custom![ci].options[oi].label = e.target.value; })} />
                  <ImagePicker value={op.image} onChange={(v) => update((o) => { f(o).custom![ci].options[oi].image = v ?? undefined; })} />
                  <button type="button" className="self-start rounded-lg border px-3 py-2" onClick={() => update((o) => { f(o).custom![ci].options.splice(oi, 1); })}><Trash2 className="size-4" /></button>
                </div>
              ))}
              {c.options.length < 8 && (
                <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-dashed px-3 py-1.5 text-sm" onClick={() => update((o) => { f(o).custom![ci].options.push({ id: newId("a"), label: "תשובה חדשה" }); })}>
                  <Plus className="size-4" /> הוספת תשובה
                </button>
              )}
            </div>
          ))}
          {(cur.custom?.length ?? 0) < 5 && (
            <button type="button" className="inline-flex items-center gap-1 rounded-lg border px-4 py-2" onClick={() => update((o) => { (f(o).custom ??= []).push({ id: newId("q"), title: "שאלה חדשה", options: [{ id: newId("a"), label: "תשובה א׳" }, { id: newId("a"), label: "תשובה ב׳" }] }); })}>
              <Plus className="size-4" /> שאלה חדשה
            </button>
          )}
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-2">
          <button type="button" disabled={saving || !dirty} onClick={() => doSave(sanitizeFunnelOverrides(ov))} className="rounded-full bg-primary px-6 py-2.5 text-primary-foreground disabled:opacity-50">
            {saving ? "שומר…" : dirty ? "שמירה ופרסום" : "הכול שמור"}
          </button>
          <button type="button" disabled={saving} onClick={() => confirm("להחזיר את כל המשפכים למקור? כל העריכות יימחקו.") && doSave({})} className="rounded-full border px-4 py-2.5 text-sm">
            איפוס הכול
          </button>
          {dirty && <span className="text-xs text-amber-700">יש שינויים שלא נשמרו</span>}
        </div>
      </div>
    </div>
  );
}

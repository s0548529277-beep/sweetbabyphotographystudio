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
import galleryFiles from "@/lib/photographer-gallery-files.json";

// עורך משפכים: texts, answers, photos, own questions and colours of the four funnels. Scoring / recommendations stay in code.

export const Route = createFileRoute("/_authenticated/admin/funnel-editor")({
  component: FunnelEditor,
});

const GALLERY_BASE = "https://michalsiboni.co.il/images/gallery/";
const newId = (p: string) => `${p}${Math.random().toString(36).slice(2, 7)}`;
const inp = "w-full rounded-lg border bg-white px-3 py-2 text-base";

function ImagePicker({ value, onChange }: { value?: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(48);
  const list = useMemo(() => (galleryFiles as string[]).filter((f) => f.toLowerCase().includes(q.toLowerCase())), [q]);
  return (
    <div className="flex items-center gap-2">
      {value ? <img src={value} alt="" className="size-14 rounded-lg border object-cover" /> : <div className="flex size-14 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">ללא</div>}
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
        <ImagePlus className="size-4" /> תמונה
      </button>
      {value && (
        <button type="button" onClick={() => onChange(null)} className="text-xs text-muted-foreground underline">
          הסרה
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 md:items-center" dir="rtl">
          <div className="flex max-h-[88dvh] w-full flex-col rounded-t-2xl bg-background p-4 md:max-w-3xl md:rounded-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg">בחירת תמונה מגלריית הצלמת</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="סגירה">
                <X className="size-5" />
              </button>
            </div>
            <p className="mb-2 text-xs text-amber-700">רק תמונות של תינוקות וילדים — לא נשים ולא בנות מעל גיל 6.</p>
            <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(48); }} placeholder="חיפוש לפי שם קובץ" className={`${inp} mb-2`} />
            <input
              placeholder="או הדביקי כתובת תמונה (https://…) ולחצי Enter"
              className={`${inp} mb-2`}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = (e.target as HTMLInputElement).value.trim();
                  if (/^https:\/\//.test(v)) { onChange(v); setOpen(false); }
                }
              }}
            />
            <div className="grid flex-1 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-5">
              {list.slice(0, limit).map((f) => (
                <button key={f} type="button" onClick={() => { onChange(GALLERY_BASE + f); setOpen(false); }} className="overflow-hidden rounded-lg border hover:ring-2 hover:ring-primary">
                  <img src={GALLERY_BASE + f} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                </button>
              ))}
              {list.length > limit && (
                <button type="button" onClick={() => setLimit((l) => l + 48)} className="col-span-full rounded-lg border py-2 text-sm">
                  עוד תמונות ({list.length - limit})
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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

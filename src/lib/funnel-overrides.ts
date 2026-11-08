// Admin-editable layer on top of funnels.ts / funnel-theme.ts (saved as JSON in app_settings.funnel_overrides by
// /admin/funnel-editor). Scoring and recommendation texts stay in code; this layer renames questions/answers, hides
// answers, adds photos, adds own (unscored) questions and recolours / retitles each funnel. Missing = as coded.
import type { FunnelId, FunnelOption, FunnelQuestion } from "./funnels";
import type { FunnelTheme } from "./funnel-theme";

export const FUNNEL_OVERRIDES_KEY = "funnel_overrides";
export const ALL_FUNNELS: FunnelId[] = ["entry", "studio", "photography", "newborn"];

export type FOptionOverride = { label?: string; hint?: string; image?: string | null; hidden?: boolean };
export type FQuestionOverride = { title?: string; options?: Record<string, FOptionOverride> };
export type FCustomQuestion = {
  id: string;
  title: string;
  options: Array<{ id: string; label: string; hint?: string; image?: string }>;
};
export type FThemeOverride = {
  from?: string;
  to?: string;
  solid?: string;
  emoji?: string;
  title?: string;
  floatLabel?: string;
  floatSub?: string;
};
export type FLanding = { headline?: string; text?: string; image?: string; bullets?: string[] };
export type FunnelOverrides = Partial<
  Record<
    FunnelId,
    { theme?: FThemeOverride; questions?: Record<string, FQuestionOverride>; custom?: FCustomQuestion[]; landing?: FLanding }
  >
>;

const COLOR = /^#[0-9a-fA-F]{6}$/;
const SAFE_ID = /^[a-z0-9_-]{1,40}$/i;
const IMAGE = /^(\/|https:\/\/)[^\s"'<>]{1,900}$/;
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");

export function sanitizeFunnelOverrides(raw: unknown): FunnelOverrides {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const out: FunnelOverrides = {};
  for (const fid of ALL_FUNNELS) {
    const f = r[fid];
    if (!f || typeof f !== "object") continue;
    const o: NonNullable<FunnelOverrides[FunnelId]> = {};
    if (f.theme && typeof f.theme === "object") {
      const t: FThemeOverride = {};
      for (const k of ["from", "to", "solid"] as const) if (COLOR.test(f.theme[k])) t[k] = f.theme[k];
      for (const [k, max] of [["emoji", 8], ["title", 50], ["floatLabel", 60], ["floatSub", 80]] as const)
        if (clean(f.theme[k], max)) t[k] = clean(f.theme[k], max);
      if (Object.keys(t).length) o.theme = t;
    }
    if (f.landing && typeof f.landing === "object") {
      const l: FLanding = {};
      if (clean(f.landing.headline, 90)) l.headline = clean(f.landing.headline, 90);
      if (clean(f.landing.text, 400)) l.text = clean(f.landing.text, 400);
      if (typeof f.landing.image === "string" && IMAGE.test(f.landing.image)) l.image = f.landing.image;
      if (Array.isArray(f.landing.bullets)) {
        const b = f.landing.bullets.map((x: unknown) => clean(x, 80)).filter(Boolean).slice(0, 5);
        if (b.length) l.bullets = b;
      }
      if (Object.keys(l).length) o.landing = l;
    }
    if (f.questions && typeof f.questions === "object") {
      const qs: Record<string, FQuestionOverride> = {};
      for (const [qid, qv] of Object.entries<any>(f.questions)) {
        if (!SAFE_ID.test(qid) || !qv || typeof qv !== "object") continue;
        const q: FQuestionOverride = {};
        if (clean(qv.title, 120)) q.title = clean(qv.title, 120);
        if (qv.options && typeof qv.options === "object") {
          const opts: Record<string, FOptionOverride> = {};
          for (const [oid, ov] of Object.entries<any>(qv.options)) {
            if (!SAFE_ID.test(oid) || !ov || typeof ov !== "object") continue;
            const x: FOptionOverride = {};
            if (clean(ov.label, 70)) x.label = clean(ov.label, 70);
            if (typeof ov.hint === "string") x.hint = clean(ov.hint, 90);
            if (ov.image === null) x.image = null;
            else if (typeof ov.image === "string" && IMAGE.test(ov.image)) x.image = ov.image;
            if (ov.hidden === true) x.hidden = true;
            if (Object.keys(x).length) opts[oid] = x;
          }
          if (Object.keys(opts).length) q.options = opts;
        }
        if (Object.keys(q).length) qs[qid] = q;
      }
      if (Object.keys(qs).length) o.questions = qs;
    }
    if (Array.isArray(f.custom) && fid !== "entry") {
      const custom = f.custom
        .filter((c: any) => c && SAFE_ID.test(c.id ?? "") && clean(c.title, 120) && Array.isArray(c.options))
        .slice(0, 5)
        .map((c: any): FCustomQuestion => ({
          id: c.id,
          title: clean(c.title, 120),
          options: c.options
            .filter((x: any) => x && SAFE_ID.test(x.id ?? "") && clean(x.label, 70))
            .slice(0, 8)
            .map((x: any) => ({
              id: x.id as string,
              label: clean(x.label, 70),
              ...(clean(x.hint, 90) && { hint: clean(x.hint, 90) }),
              ...(typeof x.image === "string" && IMAGE.test(x.image) && { image: x.image as string }),
            })),
        }))
        .filter((c: FCustomQuestion) => c.options.length >= 2);
      if (custom.length) o.custom = custom;
    }
    if (Object.keys(o).length) out[fid] = o;
  }
  return out;
}

/** Questions as the visitor sees them (hidden answers dropped but never below 2 per question; own questions at the end). */
export function applyFunnelQuestions(funnel: FunnelId, base: FunnelQuestion[], ov: FunnelOverrides | null | undefined): FunnelQuestion[] {
  const f = ov?.[funnel];
  if (!f) return base;
  const out: FunnelQuestion[] = base.map((q) => {
    const qo = f.questions?.[q.id];
    if (!qo) return q;
    let options: FunnelOption[] = q.options.map((o) => {
      const oo = qo.options?.[o.id];
      if (!oo) return o;
      return {
        ...o,
        ...(oo.label ? { label: oo.label } : {}),
        ...(oo.hint !== undefined ? { hint: oo.hint || undefined } : {}),
        ...(oo.image === null ? { image: undefined } : oo.image ? { image: oo.image } : {}),
      };
    });
    const visible = options.filter((o) => !qo.options?.[o.id]?.hidden);
    if (visible.length >= 2) options = visible;
    return { ...q, title: qo.title || q.title, options };
  });
  for (const c of f.custom ?? []) out.push({ id: `c_${c.id}`, title: c.title, options: c.options.map((o) => ({ ...o })) });
  return out;
}

export function applyFunnelTheme(base: FunnelTheme, funnel: FunnelId, ov: FunnelOverrides | null | undefined): FunnelTheme {
  const t = ov?.[funnel]?.theme;
  if (!t) return base;
  const from = t.from ?? undefined;
  const to = t.to ?? undefined;
  const hover = t.solid ? shade(t.solid, -0.12) : undefined;
  return {
    ...base,
    ...(from || to ? { gradient: `linear-gradient(135deg,${from ?? t.solid ?? "#4a3221"} 0%,${to ?? from ?? "#a47a45"} 100%)` } : {}),
    ...(t.solid ? { solid: t.solid, solidHover: hover! } : {}),
    ...(t.emoji ? { emoji: t.emoji } : {}),
    ...(t.title ? { title: t.title } : {}),
    ...(t.floatLabel ? { floatLabel: t.floatLabel } : {}),
    ...(t.floatSub ? { floatSub: t.floatSub } : {}),
  };
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + amt))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, "0")).join("")}`;
}

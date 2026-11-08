// משפכי שאלון: one dialog for all funnels (mounted once in __root.tsx) + FunnelCta, the button each page shows.
// A funnel can be switched off in /admin/funnel-leads: then its buttons disappear and its dialog never opens.
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check, X, Gift } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  ENTRY_QUESTION,
  FUNNEL_QUESTIONS,
  DEFAULT_FUNNEL_SETTINGS,
  evaluateFunnel,
  type FunnelId,
  type FunnelQuestion,
  type LeadFunnelId,
} from "@/lib/funnels";
import { getFunnelOverrides, getFunnelSettings, submitFunnelLead } from "@/lib/funnels.functions";
import { applyFunnelQuestions, applyFunnelTheme, type FunnelOverrides } from "@/lib/funnel-overrides";
import { FUNNEL_THEMES, type FunnelTheme } from "@/lib/funnel-theme";
import { openSignupWheel } from "@/components/NewsletterPopup";

const OPEN_EVENT = "sweetbaby-open-funnel";

export function openFunnel(id: FunnelId) {
  window.dispatchEvent(new CustomEvent<FunnelId>(OPEN_EVENT, { detail: id }));
}

export function useFunnelSettings() {
  const q = useQuery({ queryKey: ["funnel-settings"], queryFn: () => getFunnelSettings(), staleTime: 5 * 60_000 });
  return q.data ?? DEFAULT_FUNNEL_SETTINGS;
}

/** Edits made in /admin/funnel-editor (empty = the funnels as coded). */
export function useFunnelOverrides(): FunnelOverrides {
  const q = useQuery({ queryKey: ["funnel-overrides"], queryFn: () => getFunnelOverrides(), staleTime: 5 * 60_000 });
  return q.data ?? {};
}

/** The button a page shows to start its funnel. Renders nothing while that funnel is switched off. Coloured per funnel (funnel-theme.ts). */
export function FunnelCta({ funnel, label, sub, className = "" }: { funnel: FunnelId; label: string; sub?: string; className?: string }) {
  const settings = useFunnelSettings();
  const fov = useFunnelOverrides();
  if (!settings[funnel]) return null;
  const t = applyFunnelTheme(FUNNEL_THEMES[funnel], funnel, fov);
  return (
    <button
      type="button"
      onClick={() => openFunnel(funnel)}
      style={{ background: t.gradient }}
      className={`inline-flex items-center gap-3 rounded-full px-6 py-3 text-white shadow-lg ring-2 ring-white/60 transition hover:scale-[1.02] hover:shadow-xl ${className}`}
    >
      <span className="text-xl leading-none" aria-hidden>
        {t.emoji}
      </span>
      <span className="text-start leading-tight">
        <span className="block text-[15px] font-semibold">{label}</span>
        {sub && <span className="block text-xs text-white/85">{sub}</span>}
      </span>
    </button>
  );
}

/* ---------------------------------------------------------- floating button */

const FLOAT_ROUTES: Record<string, FunnelId> = {
  "/": "entry",
  "/studio-rental": "studio",
  "/studio-photography": "photography",
  "/newborn": "newborn",
};
const FLOAT_CLOSED_KEY = "sb-funnel-float-closed";
const FLOAT_CLOSED_DAYS = 3;
const FLOAT_DELAY_MS = 2500;

function floatClosedRecently(id: FunnelId): boolean {
  try {
    const all = JSON.parse(localStorage.getItem(FLOAT_CLOSED_KEY) || "{}") as Record<string, number>;
    return !!all[id] && Date.now() - all[id] < FLOAT_CLOSED_DAYS * 86_400_000;
  } catch {
    return false;
  }
}
function rememberFloatClosed(id: FunnelId) {
  try {
    const all = JSON.parse(localStorage.getItem(FLOAT_CLOSED_KEY) || "{}") as Record<string, number>;
    all[id] = Date.now();
    localStorage.setItem(FLOAT_CLOSED_KEY, JSON.stringify(all));
  } catch {
    // private browsing: it simply comes back on the next visit
  }
}

/** A floating button for the funnel of the page the visitor is on, with an X to dismiss it. Mounted once in __root.tsx. */
export function FunnelFloat() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const settings = useFunnelSettings();
  const fovFloat = useFunnelOverrides();
  const id = FLOAT_ROUTES[pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname];
  const [shown, setShown] = useState(false);
  const [hiddenByDialog, setHiddenByDialog] = useState(false);

  useEffect(() => {
    setShown(false);
    if (!id || floatClosedRecently(id)) return;
    const t = setTimeout(() => setShown(true), FLOAT_DELAY_MS);
    return () => clearTimeout(t);
  }, [id]);

  useEffect(() => {
    const sync = () => setHiddenByDialog(document.body.dataset.funnelOpen === "1");
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.body, { attributes: true, attributeFilter: ["data-funnel-open"] });
    return () => mo.disconnect();
  }, []);

  if (!id || !shown || hiddenByDialog || !settings[id]) return null;
  const t = applyFunnelTheme(FUNNEL_THEMES[id], id, fovFloat);
  return (
    <div
      dir="rtl"
      className="sb-funnel-float fixed bottom-20 right-4 z-[95] font-body animate-in fade-in slide-in-from-bottom-4 duration-500 sm:bottom-24 sm:right-6"
    >
      <div className="relative">
        <button
          type="button"
          onClick={() => openFunnel(id)}
          style={{ background: t.gradient }}
          className="flex items-center gap-2.5 rounded-full py-2.5 pe-5 ps-4 text-white shadow-xl ring-2 ring-white/70 transition hover:scale-[1.03]"
        >
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/25 text-lg" aria-hidden>
            {t.emoji}
            <span className="absolute inset-0 animate-ping rounded-full bg-white/30" style={{ animationDuration: "2.6s" }} />
          </span>
          <span className="text-start leading-tight">
            <span className="block text-sm font-semibold">{t.floatLabel}</span>
            <span className="hidden text-xs text-white/85 sm:block">{t.floatSub}</span>
          </span>
        </button>
        <button
          type="button"
          aria-label="סגירה"
          onClick={() => {
            rememberFloatClosed(id);
            setShown(false);
          }}
          className="absolute -left-2.5 -top-2.5 flex h-8 w-8 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-white text-[#2d3d2b] shadow-md ring-1 ring-black/10 hover:bg-[#f5d5cf]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

type Phase = "questions" | "result" | "done";

export function FunnelDialog() {
  const settings = useFunnelSettings();
  const submit = useServerFn(submitFunnelLead);
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState<FunnelId>("entry");
  const [funnel, setFunnel] = useState<LeadFunnelId | null>(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>("questions");
  const [form, setForm] = useState({ name: "", phone: "", email: "", website: "" });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    document.body.dataset.funnelOpen = open ? "1" : "";
    return () => {
      document.body.dataset.funnelOpen = "";
    };
  }, [open]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<FunnelId>).detail;
      if (!settings[id]) return;
      setStart(id);
      setFunnel(id === "entry" ? null : id);
      setStep(0);
      setAnswers({});
      setPhase("questions");
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [settings]);

  const fov = useFunnelOverrides();
  const questions: FunnelQuestion[] = funnel
    ? applyFunnelQuestions(funnel, FUNNEL_QUESTIONS[funnel], fov)
    : applyFunnelQuestions("entry", [ENTRY_QUESTION], fov);
  const q = questions[step];
  const result = funnel && phase !== "questions" ? evaluateFunnel(funnel, answers, { topup: settings.studioTopup }) : null;
  // The palette follows the funnel she is in (the entry question uses the home palette).
  const t: FunnelTheme = applyFunnelTheme(FUNNEL_THEMES[funnel ?? "entry"], funnel ?? "entry", fov);
  const themeVars = {
    "--f-solid": t.solid,
    "--f-solid-hover": t.solidHover,
    "--f-soft": t.soft,
    "--f-tint": t.tint,
    "--f-border": t.border,
    "--f-ink": t.ink,
    "--f-accent": t.accent,
  } as CSSProperties;

  const choose = (optionId: string) => {
    if (!funnel) {
      const opt = ENTRY_QUESTION.options.find((o) => o.id === optionId);
      // (hidden / renamed entry answers keep their original destination)
      if (opt?.goto) {
        setFunnel(opt.goto);
        setAnswers({});
        setStep(0);
      }
      return;
    }
    const next = { ...answers, [q.id]: optionId };
    setAnswers(next);
    if (step + 1 < questions.length) setStep(step + 1);
    else setPhase("result");
  };

  const back = () => {
    if (phase === "result") {
      setPhase("questions");
      setStep(questions.length - 1);
    } else if (step > 0) setStep(step - 1);
    else if (funnel && start === "entry") setFunnel(null);
  };
  const canBack = phase === "result" || step > 0 || (!!funnel && start === "entry");

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!funnel || sending) return;
    setSending(true);
    try {
      const utm: Record<string, string> = {};
      new URLSearchParams(window.location.search).forEach((v, k) => {
        if (k.startsWith("utm_")) utm[k] = v.slice(0, 150);
      });
      await submit({
        data: {
          funnel,
          answers,
          name: form.name,
          phone: form.phone,
          email: form.email,
          website: form.website,
          sourcePage: window.location.pathname,
          utm,
        },
      });
      setPhase("done");
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "לא הצלחנו לשמור, נסי שוב בעוד רגע");
    } finally {
      setSending(false);
    }
  };

  const total = questions.length;
  const progressPct = phase !== "questions" ? 100 : funnel ? Math.round(((step + 1) / total) * 100) : 10;
  const input =
    "w-full rounded-xl border border-[var(--f-border)] bg-white px-3 py-2.5 outline-none focus:ring-2 focus:ring-[var(--f-accent)]";

  const goSignup = () => {
    setOpen(false);
    // let the funnel dialog finish closing first, so the two never overlap
    window.setTimeout(openSignupWheel, 250);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        dir="rtl"
        style={themeVars}
        className="max-h-[92vh] gap-0 overflow-y-auto border-2 border-[var(--f-border)] bg-[var(--f-soft)] p-0 sm:p-0 text-[var(--f-ink)] sm:max-w-lg sm:rounded-3xl"
        closeClassName="text-white opacity-90 hover:bg-white/20 rounded-full p-1"
      >
        <DialogDescription className="sr-only">שאלון קצר להתאמת השירות</DialogDescription>

        {/* colourful header with the progress bar */}
        <div className="px-6 pb-4 pt-5 text-white" style={{ background: t.gradient }}>
          <div className="flex items-center gap-2 ps-8 text-sm font-medium text-white/90">
            <span className="text-lg" aria-hidden>
              {t.emoji}
            </span>
            {t.title}
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-white transition-all duration-300" style={{ width: `${Math.max(progressPct, 8)}%` }} />
          </div>
        </div>

        <div className="space-y-5 p-6">
          {phase === "questions" && q && (
            <div className="space-y-5">
              <div className="flex items-center justify-between text-xs text-[var(--f-ink)]/60">
                {canBack ? (
                  <button type="button" onClick={back} className="inline-flex items-center gap-1 hover:text-[var(--f-ink)]">
                    <ArrowRight className="h-3.5 w-3.5" /> חזרה
                  </button>
                ) : (
                  <span />
                )}
                {funnel && (
                  <span>
                    {Math.min(step + 1, total)}/{total}
                  </span>
                )}
              </div>
              <DialogTitle className="text-2xl leading-snug" style={{ fontFamily: "'DM Serif Display', serif" }}>
                {q.title}
              </DialogTitle>
              <div className="grid gap-2.5">
                {q.options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => choose(o.id)}
                    className={`rounded-2xl border-2 bg-white px-4 py-3 text-start shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--f-solid)] hover:bg-[var(--f-tint)] hover:shadow-md ${
                      answers[q.id] === o.id ? "border-[var(--f-solid)] bg-[var(--f-tint)]" : "border-[var(--f-border)]/60"
                    }`}
                  >
                    {o.image && <img src={o.image} alt="" loading="lazy" className="mb-2 h-28 w-full rounded-xl object-cover" />}
                    <span className="block font-medium">{o.label}</span>
                    {o.hint && <span className="block text-xs text-[var(--f-ink)]/60">{o.hint}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {phase === "result" && result && (
            <div className="space-y-4">
              <button type="button" onClick={back} className="inline-flex items-center gap-1 text-xs text-[var(--f-ink)]/60 hover:text-[var(--f-ink)]">
                <ArrowRight className="h-3.5 w-3.5" /> חזרה
              </button>
              <div className="rounded-2xl border-2 border-[var(--f-border)] bg-white p-4 shadow-sm">
                <div className="inline-block rounded-full px-3 py-0.5 text-xs font-semibold text-white" style={{ background: t.gradient }}>
                  ההמלצה בשבילך
                </div>
                <DialogTitle className="mt-2 text-2xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  {result.headline}
                </DialogTitle>
                <p className="mt-2 text-sm leading-relaxed text-[var(--f-ink)]/85">{result.recommendation}</p>
                {result.details.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm text-[var(--f-ink)]/80">
                    {result.details.map((d) => (
                      <li key={d} className="flex gap-2">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: t.solid }} /> {d}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {result.signup && (
                <div className="rounded-2xl border-2 border-dashed border-[var(--f-solid)] bg-[var(--f-tint)] p-4 text-center">
                  <div className="text-3xl" aria-hidden>
                    🎡
                  </div>
                  <div className="mt-1 text-lg font-semibold" style={{ fontFamily: "'DM Serif Display', serif" }}>
                    הרשמה ראשונה = סיבוב בגלגל מתנות
                  </div>
                  <p className="mt-1 text-sm text-[var(--f-ink)]/75">פותחות חשבון בשנייה ומסובבות: הנחה או קרדיט מתנה להזמנה.</p>
                  <button
                    type="button"
                    onClick={goSignup}
                    style={{ background: t.gradient }}
                    className="mt-3 inline-flex items-center gap-2 rounded-full px-6 py-2.5 font-semibold text-white shadow-md transition hover:scale-[1.03]"
                  >
                    <Gift className="h-4 w-4" /> להרשמה ולסיבוב בגלגל
                  </button>
                </div>
              )}

              <form onSubmit={send} className="space-y-3">
                <p className="text-sm text-[var(--f-ink)]/80">
                  {funnel === "photography"
                    ? "רוצה הצעה אישית ממיכל? השאירי פרטים ונחזור אלייך במייל:"
                    : result.signup
                      ? "או שאפשר להשאיר פרטים ונחזור אלייך:"
                      : "רוצה שנחזור אלייך עם פרטים והצעה? השאירי פרטים:"}
                </p>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="שם"
                  aria-label="שם"
                  className={input}
                />
                <input
                  required
                  type="tel"
                  dir="ltr"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="טלפון"
                  aria-label="טלפון"
                  className={`${input} text-end`}
                />
                <input
                  type="email"
                  dir="ltr"
                  required={funnel === "photography"}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder={funnel === "photography" ? "מייל" : "מייל (לא חובה)"}
                  aria-label="מייל"
                  className={`${input} text-end`}
                />
                <input tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
                <button
                  type="submit"
                  disabled={sending}
                  style={{ background: result.signup ? t.solid : t.gradient }}
                  className="w-full rounded-full py-3 font-semibold text-white shadow-md transition hover:brightness-110 disabled:opacity-60"
                >
                  {sending ? "שולחת…" : "שלחי לי פרטים"}
                </button>
                <p className="text-center text-xs text-[var(--f-ink)]/50">הפרטים משמשים רק ליצירת קשר איתך בנושא הזה.</p>
              </form>
            </div>
          )}

          {phase === "done" && (
            <div className="space-y-4 py-4 text-center">
              <div className="text-4xl" aria-hidden>
                {t.emoji}
              </div>
              <DialogTitle className="text-2xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
                תודה, קיבלנו! 🤍
              </DialogTitle>
              <p className="text-sm text-[var(--f-ink)]/80">
                {funnel === "photography" ? "מיכל תחזור אלייך במייל בהקדם." : "נחזור אלייך בהקדם."}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

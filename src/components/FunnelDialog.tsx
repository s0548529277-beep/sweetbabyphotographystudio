// משפכי שאלון: one dialog for all funnels (mounted once in __root.tsx) + FunnelCta, the button each page shows.
// A funnel can be switched off in /admin/funnel-leads: then its buttons disappear and its dialog never opens.
import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle, ArrowRight, Sparkles, Check } from "lucide-react";
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
import { getFunnelSettings, submitFunnelLead } from "@/lib/funnels.functions";

const OPEN_EVENT = "sweetbaby-open-funnel";
const PHONE_WA = "972548529277";

export function openFunnel(id: FunnelId) {
  window.dispatchEvent(new CustomEvent<FunnelId>(OPEN_EVENT, { detail: id }));
}

export function useFunnelSettings() {
  const q = useQuery({ queryKey: ["funnel-settings"], queryFn: () => getFunnelSettings(), staleTime: 5 * 60_000 });
  return q.data ?? DEFAULT_FUNNEL_SETTINGS;
}

/** The button a page shows to start its funnel. Renders nothing while that funnel is switched off. */
export function FunnelCta({ funnel, label, sub, className = "" }: { funnel: FunnelId; label: string; sub?: string; className?: string }) {
  const settings = useFunnelSettings();
  if (!settings[funnel]) return null;
  return (
    <button
      type="button"
      onClick={() => openFunnel(funnel)}
      className={`inline-flex items-center gap-3 rounded-full bg-[#2d3d2b] px-6 py-3 text-white shadow-md transition hover:bg-[#3d5239] ${className}`}
    >
      <Sparkles className="h-4 w-4 shrink-0" />
      <span className="text-start leading-tight">
        <span className="block text-[15px] font-semibold">{label}</span>
        {sub && <span className="block text-xs text-white/75">{sub}</span>}
      </span>
    </button>
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

  const questions: FunnelQuestion[] = funnel ? FUNNEL_QUESTIONS[funnel] : [ENTRY_QUESTION];
  const q = questions[step];
  const result = funnel && phase !== "questions" ? evaluateFunnel(funnel, answers) : null;

  const choose = (optionId: string) => {
    if (!funnel) {
      const opt = ENTRY_QUESTION.options.find((o) => o.id === optionId);
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

  const progress = funnel ? `${Math.min(step + 1, questions.length)}/${questions.length}` : "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-lg bg-[#f6efe6] text-[#2d3d2b] border-[#2d3d2b]/15">
        <DialogDescription className="sr-only">שאלון קצר להתאמת השירות</DialogDescription>
        {phase === "questions" && q && (
          <div className="space-y-5">
            <div className="flex items-center justify-between text-xs text-[#2d3d2b]/60">
              {canBack ? (
                <button type="button" onClick={back} className="inline-flex items-center gap-1 hover:text-[#2d3d2b]">
                  <ArrowRight className="h-3.5 w-3.5" /> חזרה
                </button>
              ) : (
                <span />
              )}
              <span>{progress}</span>
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
                  className={`rounded-2xl border bg-white px-4 py-3 text-start transition hover:border-[#2d3d2b] hover:shadow-sm ${
                    answers[q.id] === o.id ? "border-[#2d3d2b]" : "border-[#2d3d2b]/15"
                  }`}
                >
                  <span className="block font-medium">{o.label}</span>
                  {o.hint && <span className="block text-xs text-[#2d3d2b]/60">{o.hint}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {phase === "result" && result && (
          <form onSubmit={send} className="space-y-4">
            <button type="button" onClick={back} className="inline-flex items-center gap-1 text-xs text-[#2d3d2b]/60 hover:text-[#2d3d2b]">
              <ArrowRight className="h-3.5 w-3.5" /> חזרה
            </button>
            <div className="rounded-2xl bg-white p-4 border border-[#2d3d2b]/10">
              <div className="text-xs tracking-wide text-[#2d3d2b]/55">ההמלצה בשבילך</div>
              <DialogTitle className="mt-1 text-2xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
                {result.headline}
              </DialogTitle>
              <p className="mt-2 text-sm leading-relaxed text-[#2d3d2b]/80">{result.recommendation}</p>
              {result.details.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm text-[#2d3d2b]/75">
                  {result.details.map((d) => (
                    <li key={d} className="flex gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#6b8a63]" /> {d}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-sm text-[#2d3d2b]/75">רוצה שנחזור אלייך עם פרטים והצעה? השאירי פרטים:</p>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="שם"
              aria-label="שם"
              className="w-full rounded-xl border border-[#2d3d2b]/20 bg-white px-3 py-2.5"
            />
            <input
              required
              type="tel"
              dir="ltr"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="טלפון"
              aria-label="טלפון"
              className="w-full rounded-xl border border-[#2d3d2b]/20 bg-white px-3 py-2.5 text-end"
            />
            <input
              type="email"
              dir="ltr"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="מייל (לא חובה)"
              aria-label="מייל"
              className="w-full rounded-xl border border-[#2d3d2b]/20 bg-white px-3 py-2.5 text-end"
            />
            <input tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            <button
              type="submit"
              disabled={sending}
              className="w-full rounded-full bg-[#2d3d2b] py-3 font-semibold text-white hover:bg-[#3d5239] disabled:opacity-60"
            >
              {sending ? "שולחת…" : "שלחי לי פרטים"}
            </button>
            <p className="text-center text-xs text-[#2d3d2b]/50">הפרטים משמשים רק ליצירת קשר איתך בנושא הזה.</p>
          </form>
        )}

        {phase === "done" && (
          <div className="space-y-4 py-4 text-center">
            <DialogTitle className="text-2xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
              תודה, קיבלנו! 🤍
            </DialogTitle>
            <p className="text-sm text-[#2d3d2b]/75">נחזור אלייך בהקדם. אפשר גם לכתוב לנו עכשיו בוואטסאפ.</p>
            <a
              href={`https://wa.me/${PHONE_WA}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[#25d366] px-6 py-3 font-semibold text-white"
            >
              <MessageCircle className="h-4 w-4" /> וואטסאפ
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

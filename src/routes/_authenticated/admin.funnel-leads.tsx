import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Flame, MessageCircle, RotateCcw, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { FUNNEL_LABELS, answerLines, type FunnelId, type FunnelSettings, type LeadFunnelId } from "@/lib/funnels";
import { getFunnelSettings, setFunnelSettings } from "@/lib/funnels.functions";
import { getVisitorJourneys } from "@/lib/visitor-tracking.functions";
import { VisitorJourneyPanel } from "@/components/VisitorJourneyPanel";

// משפכי שאלון: on/off switch per funnel + the leads that came out of them (table funnel_leads, see funnels.ts).

export const Route = createFileRoute("/_authenticated/admin/funnel-leads")({
  component: FunnelLeadsAdmin,
});

type Lead = {
  id: string;
  created_at: string;
  funnel: LeadFunnelId;
  name: string;
  phone: string;
  email: string | null;
  answers: Record<string, string>;
  recommendation: string | null;
  score: number;
  is_hot: boolean;
  source_page: string | null;
  status: "new" | "handled";
};

const FUNNEL_ORDER: FunnelId[] = ["entry", "studio", "photography", "newborn"];
const FUNNEL_PAGE: Record<FunnelId, string> = {
  entry: "עמוד הבית",
  studio: "עמוד השכרת הסטודיו",
  photography: "עמוד הצילומים עם מיכל",
  newborn: "עמוד הניו-בורן",
};

function waLink(phone: string, name: string) {
  const d = phone.replace(/\D/g, "");
  const n = d.startsWith("0") ? "972" + d.slice(1) : d.startsWith("972") ? d : "972" + d;
  return `https://wa.me/${n}?text=${encodeURIComponent(`היי ${name}, כאן הסטודיו של מיכל סיבוני 🤍 ראיתי שמילאת שאלון באתר, אשמח לעזור!`)}`;
}

function FunnelLeadsAdmin() {
  const qc = useQueryClient();
  const loadSettings = useServerFn(getFunnelSettings);
  const saveSettings = useServerFn(setFunnelSettings);
  const loadJourneys = useServerFn(getVisitorJourneys);
  const [funnel, setFunnel] = useState<"all" | LeadFunnelId>("all");
  const [status, setStatus] = useState<"all" | "new" | "handled">("all");

  const settings = useQuery({ queryKey: ["funnel-settings"], queryFn: () => loadSettings() });
  const toggle = useMutation({
    mutationFn: async (next: FunnelSettings) => saveSettings({ data: next }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["funnel-settings"] });
      toast.success("נשמר");
    },
    onError: () => toast.error("השמירה נכשלה"),
  });

  const leads = useQuery({
    queryKey: ["funnel-leads"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- funnel_leads is newer than the generated types
      const { data, error } = await (supabase as any).from("funnel_leads").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });
  const journeys = useQuery({
    queryKey: ["funnel-lead-journeys", (leads.data ?? []).map((l) => l.id).join(",")],
    enabled: (leads.data ?? []).length > 0,
    queryFn: () => loadJourneys({ data: { contacts: (leads.data ?? []).slice(0, 400).map((l) => ({ key: l.id, phone: l.phone, email: l.email })) } }),
    staleTime: 60_000,
  });
  const handle = useMutation({
    mutationFn: async (l: Lead) => {
      const handled = l.status !== "handled";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("funnel_leads")
        .update({ status: handled ? "handled" : "new", handled_at: handled ? new Date().toISOString() : null })
        .eq("id", l.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["funnel-leads"] }),
    onError: () => toast.error("העדכון נכשל"),
  });

  const all = leads.data ?? [];
  const rows = all.filter((l) => (funnel === "all" || l.funnel === funnel) && (status === "all" || l.status === status));
  const chip = (active: boolean) => `px-4 h-9 rounded-full text-sm border ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card border-primary/10 hover:bg-cream"}`;

  return (
    <div className="space-y-6" dir="rtl">
      <h2 className="font-display text-2xl text-primary flex items-center gap-2">
        <Sparkles className="h-5 w-5" /> משפכי שאלון
      </h2>

      <section className="bg-card border border-primary/5 p-5 space-y-3">
        <h3 className="font-display text-lg text-primary">הפעלה וכיבוי</h3>
        <p className="text-xs text-muted-foreground">כיבוי מסתיר את כפתור המשפך מהעמוד ומונע את פתיחתו. לידים שכבר נאספו נשארים.</p>
        {settings.isLoading || !settings.data ? (
          <div className="text-sm text-muted-foreground">טוענת…</div>
        ) : (
          <ul className="divide-y divide-primary/10">
            {FUNNEL_ORDER.map((id) => (
              <li key={id} className="flex items-center justify-between gap-4 py-2.5">
                <div>
                  <div className="text-sm font-medium">{FUNNEL_LABELS[id]}</div>
                  <div className="text-xs text-muted-foreground">מופיע ב{FUNNEL_PAGE[id]}</div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {settings.data![id] ? "פעיל" : "כבוי"}
                  <Switch
                    checked={settings.data![id]}
                    disabled={toggle.isPending}
                    onCheckedChange={(v) => toggle.mutate({ ...settings.data!, [id]: v })}
                    aria-label={`הפעלת ${FUNNEL_LABELS[id]}`}
                  />
                </div>
              </li>
            ))}
            <li className="flex items-center justify-between gap-4 py-2.5">
              <div>
                <div className="text-sm font-medium">💗 טעינה: משלמת 750 ₪ ומקבלת 1,000 ₪ קרדיט</div>
                <div className="text-xs text-muted-foreground">
                  כשפעיל, משפך הסטודיו מוסיף את הטעינה להשוואת המחירים וממליץ עליה כשהיא משתלמת. זו המלצה בלבד: אין עדיין רכישה אוטומטית של הטעינה באתר, ולכן מי שמעוניינת משאירה פרטים ואת מטעינה לה קרדיט.
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {settings.data!.studioTopup ? "פעיל" : "כבוי"}
                <Switch
                  checked={settings.data!.studioTopup}
                  disabled={toggle.isPending}
                  onCheckedChange={(v) => toggle.mutate({ ...settings.data!, studioTopup: v })}
                  aria-label="הפעלת הטעינה 750 ל-1000"
                />
              </div>
            </li>
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setFunnel("all")} className={chip(funnel === "all")}>
            הכל ({all.length})
          </button>
          {(["studio", "photography", "newborn"] as LeadFunnelId[]).map((id) => (
            <button key={id} onClick={() => setFunnel(id)} className={chip(funnel === id)}>
              {FUNNEL_LABELS[id]} ({all.filter((l) => l.funnel === id).length})
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-primary/15" />
          {(
            [
              ["all", "כל הסטטוסים"],
              ["new", `חדשים (${all.filter((l) => l.status === "new").length})`],
              ["handled", "טופלו"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} onClick={() => setStatus(k)} className={chip(status === k)}>
              {label}
            </button>
          ))}
        </div>

        {leads.isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">טוענת…</div>
        ) : leads.isError ? (
          <div className="py-10 text-center text-sm text-destructive">לא הצלחתי לטעון את הלידים.</div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">אין לידים להצגה.</div>
        ) : (
          <div className="space-y-3">
            {rows.map((l) => (
              <div key={l.id} className={`border bg-card p-4 ${l.status === "handled" ? "opacity-60" : ""} ${l.is_hot ? "border-orange-300" : "border-primary/5"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-lg text-primary">
                      {l.is_hot && <Flame className="h-4 w-4 text-orange-500" aria-label="ליד חם" />}
                      {l.name}
                      <span className="text-xs text-muted-foreground">
                        {FUNNEL_LABELS[l.funnel]} · ניקוד {l.score}
                      </span>
                    </div>
                    <div className="text-sm" dir="ltr" style={{ textAlign: "right" }}>
                      {l.phone}
                      {l.email ? ` · ${l.email}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(l.created_at).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}
                      {l.source_page ? ` · מדף ${l.source_page}` : ""}
                    </div>
                    <VisitorJourneyPanel journey={journeys.data?.[l.id]} />
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={waLink(l.phone, l.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#25d366] px-4 text-sm text-white"
                    >
                      <MessageCircle className="h-4 w-4" /> וואטסאפ
                    </a>
                    <button
                      onClick={() => handle.mutate(l)}
                      disabled={handle.isPending}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-primary/20 px-4 text-sm hover:bg-cream"
                    >
                      {l.status === "handled" ? (
                        <>
                          <RotateCcw className="h-4 w-4" /> החזרה לחדש
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4" /> סימון כטופל
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <ul className="mt-3 grid gap-x-6 gap-y-0.5 text-sm text-muted-foreground sm:grid-cols-2">
                  {answerLines(l.funnel, l.answers ?? {}).map((r) => (
                    <li key={r.q}>
                      {r.q} <strong className="text-foreground">{r.a}</strong>
                    </li>
                  ))}
                </ul>
                {l.recommendation && <p className="mt-2 text-sm">המלצה שנשלחה: {l.recommendation}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

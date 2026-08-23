import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { proposeSiteChange, reviseSiteChange, listSiteChanges, mergeSiteChange, rejectSiteChange } from "@/lib/admin-site-bot.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Sparkles, ExternalLink, Check, X, Bot, Send, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/site-bot")({
  component: SiteBotAdmin,
});

// A short menu of common targets so the admin doesn't need to know exact
// repo paths by heart. "אחר" lets them type any path directly.
const COMMON_TARGETS = [
  { label: "עמוד הבית", path: "src/routes/index.tsx" },
  { label: "כרטיס אביזר (עמוד מוצר)", path: "src/routes/items.$id.tsx" },
  { label: "עגלת קניות", path: "src/routes/cart.tsx" },
  { label: "תשלום (הזמנת אביזרים)", path: "src/routes/checkout.tsx" },
  { label: "הזמנת סטודיו", path: "src/routes/booking.tsx" },
  { label: "עמוד אודות", path: "src/routes/about.tsx" },
  { label: "כותרת/תפריט (ניווט)", path: "src/components/SiteHeader.tsx" },
  { label: "אחר (הקלד נתיב)", path: "" },
];

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  proposing: { label: "בעבודה…", variant: "outline" },
  proposed: { label: "ממתין לאישור", variant: "secondary" },
  merged: { label: "פורסם", variant: "default" },
  rejected: { label: "נדחה", variant: "outline" },
  failed: { label: "נכשל", variant: "destructive" },
};

type Msg = { role: "user" | "bot"; text: string };

function SiteBotAdmin() {
  const qc = useQueryClient();
  const propose = useServerFn(proposeSiteChange);
  const revise = useServerFn(reviseSiteChange);
  const list = useServerFn(listSiteChanges);
  const merge = useServerFn(mergeSiteChange);
  const reject = useServerFn(rejectSiteChange);

  const [targetChoice, setTargetChoice] = useState(COMMON_TARGETS[0].path);
  const [customPath, setCustomPath] = useState("");
  const [draft, setDraft] = useState(""); // textarea content, reused for both "start" and "follow-up" input
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const targetPath = targetChoice || customPath;

  const requests = useQuery({ queryKey: ["site-bot-requests"], queryFn: () => list({}), refetchInterval: 8000 });
  const active = (requests.data ?? []).find((r: any) => r.id === activeId) as any;
  const activeOpen = active && active.status === "proposed";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [active?.messages?.length, busy]);

  const startNew = async () => {
    if (!draft.trim()) return toast.error("צריך לתאר מה לשנות");
    if (!targetPath.trim()) return toast.error("צריך לבחור או להקליד קובץ יעד");
    setBusy(true);
    try {
      const res = await propose({ data: { instruction: draft.trim(), target_path: targetPath.trim() } });
      toast.success("הטיוטה מוכנה — אפשר להמשיך לשכלל אותה כאן, או לאשר ולפרסם");
      setDraft("");
      setActiveId((res as any).id ?? null);
      qc.invalidateQueries({ queryKey: ["site-bot-requests"] });
    } catch (e: any) {
      toast.error(e?.message ?? "השינוי נכשל");
    } finally {
      setBusy(false);
    }
  };

  const sendFollowUp = async () => {
    if (!draft.trim() || !activeId) return;
    setBusy(true);
    const instruction = draft.trim();
    setDraft("");
    try {
      await revise({ data: { id: activeId, instruction } });
      qc.invalidateQueries({ queryKey: ["site-bot-requests"] });
    } catch (e: any) {
      toast.error(e?.message ?? "השינוי נכשל");
      qc.invalidateQueries({ queryKey: ["site-bot-requests"] }); // still refetch — the error turn was logged
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      activeOpen ? sendFollowUp() : startNew();
    }
  };

  const doMerge = async (id: string) => {
    try {
      await merge({ data: { id } });
      toast.success("פורסם לאתר!");
      setActiveId(null);
      qc.invalidateQueries({ queryKey: ["site-bot-requests"] });
    } catch (e: any) {
      toast.error(e?.message ?? "האישור נכשל");
    }
  };

  const doReject = async (id: string) => {
    try {
      await reject({ data: { id } });
      toast.success("נדחה");
      setActiveId(null);
      qc.invalidateQueries({ queryKey: ["site-bot-requests"] });
    } catch (e: any) {
      toast.error(e?.message ?? "הפעולה נכשלה");
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-card rounded-2xl border border-primary/5 p-5">
        <h2 className="font-display text-xl text-primary mb-1 flex items-center gap-2">
          <Bot className="h-5 w-5" /> בוט עריכת אתר
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          שיחה עם הבוט על קובץ אחד. כל טיוטה היא Pull Request בגיטהאב — אפשר להמשיך לתת הנחיות המשך ("עוד קצת יותר גדול") שמשכללות
          את אותה טיוטה, ושום דבר לא עולה לאתר החי לפני שתאשרי במפורש.
        </p>

        {!activeOpen && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">איפה לשנות</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {COMMON_TARGETS.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => setTargetChoice(t.path)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition ${
                      targetChoice === t.path ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {targetChoice === "" && (
                <Input
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  placeholder="למשל: src/routes/items.$id.tsx"
                  dir="ltr"
                  className="mt-2"
                />
              )}
            </div>
          </div>
        )}

        {activeOpen && (
          <div className="flex items-center justify-between mb-3 text-xs">
            <span className="text-muted-foreground" dir="ltr">
              {active.target_path}
            </span>
            <button type="button" className="flex items-center gap-1 text-primary hover:underline" onClick={() => setActiveId(null)}>
              <Plus className="h-3.5 w-3.5" /> שיחה על קובץ אחר
            </button>
          </div>
        )}

        {activeOpen && (
          <div className="bg-cream/40 rounded-xl border border-primary/5 mb-3">
            <div ref={scrollRef} className="max-h-80 overflow-y-auto p-3 space-y-2">
              {((active.messages ?? []) as Msg[]).map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm whitespace-pre-line ${
                      m.role === "user" ? "rounded-tl-sm bg-primary text-primary-foreground" : "rounded-tr-sm bg-card border border-primary/5 text-foreground"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-card border border-primary/5 text-muted-foreground px-3 py-1.5 text-sm flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 animate-pulse" /> עובדת על זה…
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 mt-3 px-3 pb-3">
              {active.pr_url && (
                <a href={active.pr_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline flex items-center gap-1">
                  צפייה ב-PR <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <div className="flex gap-2 mr-auto">
                <Button size="sm" variant="secondary" className="gap-1" onClick={() => doMerge(active.id)}>
                  <Check className="h-3.5 w-3.5" /> אשר ופרסם
                </Button>
                <Button size="sm" variant="ghost" className="gap-1 text-destructive" onClick={() => doReject(active.id)}>
                  <X className="h-3.5 w-3.5" /> דחייה
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 items-end">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              activeOpen
                ? 'הנחיית המשך… למשל: "תקטיני קצת את הכותרת" (Enter לשליחה, Shift+Enter לשורה חדשה)'
                : 'למשל: "תשני את הכותרת הראשית לצבע ורוד עמוק יותר" או "תוסיפי באנר קטן בראש העמוד שמכריז על מבצע קיץ"'
            }
            rows={activeOpen ? 1 : 3}
            className={activeOpen ? "flex-1 resize-none min-h-10 max-h-32" : "flex-1"}
          />
          {activeOpen ? (
            <Button onClick={sendFollowUp} disabled={busy} size="icon" className="rounded-full shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={startNew} disabled={busy} className="rounded-full gap-2 shrink-0">
              <Sparkles className="h-4 w-4" /> {busy ? "מכינה טיוטה…" : "הכן טיוטה"}
            </Button>
          )}
        </div>
      </div>

      <div>
        <h3 className="font-display text-lg text-primary mb-3">היסטוריית שינויים</h3>
        <div className="space-y-2">
          {(requests.data ?? [])
            .filter((r: any) => r.id !== activeId)
            .map((r: any) => {
              const s = STATUS_LABEL[r.status] ?? STATUS_LABEL.proposing;
              const resumable = r.status === "proposed";
              return (
                <div
                  key={r.id}
                  onClick={resumable ? () => setActiveId(r.id) : undefined}
                  className={`bg-card rounded-xl border border-primary/5 p-4 ${resumable ? "cursor-pointer hover:border-primary/20" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.summary || r.instruction}</p>
                      <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">
                        {r.target_path}
                      </p>
                      {r.error && <p className="text-xs text-destructive mt-1">{r.error}</p>}
                    </div>
                    <Badge variant={s.variant} className="shrink-0">
                      {s.label}
                    </Badge>
                  </div>
                  {r.pr_url && (
                    <a
                      href={r.pr_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-primary underline flex items-center gap-1 mt-2 w-fit"
                    >
                      צפייה ב-PR <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              );
            })}
          {(requests.data ?? []).filter((r: any) => r.id !== activeId).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10">אין עדיין בקשות שינוי.</p>
          )}
        </div>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { proposeSiteChange, listSiteChanges, mergeSiteChange, rejectSiteChange, askSiteData, listSiteQuestions } from "@/lib/admin-site-bot.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Sparkles, ExternalLink, Check, X, Bot, MessageCircleQuestion, Code2 } from "lucide-react";

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

function SiteBotAdmin() {
  const qc = useQueryClient();
  const propose = useServerFn(proposeSiteChange);
  const list = useServerFn(listSiteChanges);
  const merge = useServerFn(mergeSiteChange);
  const reject = useServerFn(rejectSiteChange);
  const ask = useServerFn(askSiteData);
  const listQuestions = useServerFn(listSiteQuestions);

  const [tab, setTab] = useState<"edit" | "ask">("edit");
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const questions = useQuery({ queryKey: ["site-bot-questions"], queryFn: () => listQuestions({}), enabled: tab === "ask" });

  const submitQuestion = async () => {
    if (!question.trim()) return toast.error("צריך לשאול משהו");
    setAsking(true);
    try {
      await ask({ data: { question: question.trim() } });
      setQuestion("");
      qc.invalidateQueries({ queryKey: ["site-bot-questions"] });
    } catch (e: any) {
      toast.error(e?.message ?? "השאלה נכשלה");
    } finally {
      setAsking(false);
    }
  };

  const [targetChoice, setTargetChoice] = useState(COMMON_TARGETS[0].path);
  const [customPath, setCustomPath] = useState("");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);

  const targetPath = targetChoice || customPath;

  const requests = useQuery({ queryKey: ["site-bot-requests"], queryFn: () => list({}), refetchInterval: 8000 });

  const submit = async () => {
    if (!instruction.trim()) return toast.error("צריך לתאר מה לשנות");
    if (!targetPath.trim()) return toast.error("צריך לבחור או להקליד קובץ יעד");
    setBusy(true);
    try {
      const res = await propose({ data: { instruction: instruction.trim(), target_path: targetPath.trim() } });
      toast.success("נוצרה טיוטה — סקור ואשר למטה");
      setInstruction("");
      qc.invalidateQueries({ queryKey: ["site-bot-requests"] });
    } catch (e: any) {
      toast.error(e?.message ?? "השינוי נכשל");
    } finally {
      setBusy(false);
    }
  };

  const doMerge = async (id: string) => {
    try {
      await merge({ data: { id } });
      toast.success("פורסם לאתר!");
      qc.invalidateQueries({ queryKey: ["site-bot-requests"] });
    } catch (e: any) {
      toast.error(e?.message ?? "האישור נכשל");
    }
  };

  const doReject = async (id: string) => {
    try {
      await reject({ data: { id } });
      toast.success("נדחה");
      qc.invalidateQueries({ queryKey: ["site-bot-requests"] });
    } catch (e: any) {
      toast.error(e?.message ?? "הפעולה נכשלה");
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("edit")}
          className={`text-sm px-4 py-2 rounded-full border flex items-center gap-1.5 transition ${
            tab === "edit" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40"
          }`}
        >
          <Code2 className="h-3.5 w-3.5" /> עריכת קוד/עיצוב
        </button>
        <button
          type="button"
          onClick={() => setTab("ask")}
          className={`text-sm px-4 py-2 rounded-full border flex items-center gap-1.5 transition ${
            tab === "ask" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40"
          }`}
        >
          <MessageCircleQuestion className="h-3.5 w-3.5" /> שאלות על הנתונים
        </button>
      </div>

      {tab === "ask" && (
        <div className="space-y-6">
          <div className="bg-card rounded-2xl border border-primary/5 p-5">
            <h2 className="font-display text-xl text-primary mb-1 flex items-center gap-2">
              <MessageCircleQuestion className="h-5 w-5" /> שאלות על הנתונים
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              שואלים בעברית, מקבלים תשובה מספרים אמיתיים מה-DB. <b>קריאה בלבד</b> — לא ניתן לשנות/למחוק כלום דרך כאן, גם לא ברמת מסד הנתונים.
            </p>
            <div className="flex gap-2">
              <Textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder='למשל: "כמה הרווחתי באשראי בחודש שעבר?" או "כמה לקוחות חדשים נרשמו השבוע?"'
                rows={2}
                className="flex-1"
              />
            </div>
            <Button onClick={submitQuestion} disabled={asking} className="rounded-full gap-2 mt-3">
              <Sparkles className="h-4 w-4" /> {asking ? "בודקת…" : "שאל"}
            </Button>
          </div>

          <div className="space-y-2">
            {(questions.data ?? []).map((q: any) => (
              <div key={q.id} className="bg-card rounded-xl border border-primary/5 p-4">
                <p className="text-sm font-medium mb-1">{q.question}</p>
                {q.error ? (
                  <p className="text-xs text-destructive">{q.error}</p>
                ) : (
                  <p className="text-sm text-muted-foreground whitespace-pre-line">{q.answer}</p>
                )}
              </div>
            ))}
            {(questions.data ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-10">עדיין לא נשאלו שאלות.</p>}
          </div>
        </div>
      )}

      {tab === "edit" && (
      <div className="bg-card rounded-2xl border border-primary/5 p-5">
        <h2 className="font-display text-xl text-primary mb-1 flex items-center gap-2">
          <Bot className="h-5 w-5" /> בוט עריכת אתר
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          תאר בעברית מה לשנות. הבוט יכין <b>טיוטה</b> (Pull Request בגיטהאב) — שום דבר לא עולה לאתר החי לפני שתאשר כאן למטה.
        </p>

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

          <div>
            <Label className="text-xs text-muted-foreground">מה לשנות</Label>
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder='למשל: "תשני את הכותרת הראשית לצבע ורוד עמוק יותר" או "תוסיפי באנר קטן בראש העמוד שמכריז על מבצע קיץ"'
              rows={3}
              className="mt-1"
            />
          </div>

          <Button onClick={submit} disabled={busy} className="rounded-full gap-2">
            <Sparkles className="h-4 w-4" /> {busy ? "מכין טיוטה…" : "הכן טיוטה"}
          </Button>
        </div>
      </div>

      <div>
        <h3 className="font-display text-lg text-primary mb-3">היסטוריית שינויים</h3>
        <div className="space-y-2">
          {(requests.data ?? []).map((r: any) => {
            const s = STATUS_LABEL[r.status] ?? STATUS_LABEL.proposing;
            return (
              <div key={r.id} className="bg-card rounded-xl border border-primary/5 p-4">
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
                <div className="flex items-center gap-2 mt-3">
                  {r.pr_url && (
                    <a href={r.pr_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline flex items-center gap-1">
                      צפייה ב-PR <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {r.status === "proposed" && (
                    <div className="flex gap-2 mr-auto">
                      <Button size="sm" variant="secondary" className="gap-1" onClick={() => doMerge(r.id)}>
                        <Check className="h-3.5 w-3.5" /> אשר ופרסם
                      </Button>
                      <Button size="sm" variant="ghost" className="gap-1 text-destructive" onClick={() => doReject(r.id)}>
                        <X className="h-3.5 w-3.5" /> דחייה
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {(requests.data ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-10">אין עדיין בקשות שינוי.</p>}
        </div>
      </div>
      )}
    </div>
  );
}

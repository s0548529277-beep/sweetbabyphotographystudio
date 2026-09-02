import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { askEmailAssistant, sendAdminEmail } from "@/lib/email-assistant.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Inbox, Loader2, Send, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/email-assistant")({
  component: EmailAssistantAdmin,
});

type ChatTurn = { question: string; answer: string };

function EmailAssistantAdmin() {
  const runAsk = useServerFn(askEmailAssistant);
  const runSend = useServerFn(sendAdminEmail);

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [chat, setChat] = useState<ChatTurn[]>([]);

  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const ask = async () => {
    const q = question.trim();
    if (!q) return;
    setAsking(true);
    setQuestion("");
    try {
      const res = await runAsk({ data: { question: q } });
      setChat((prev) => [...prev, { question: q, answer: res.answer }]);
    } catch (e: any) {
      toast.error(e?.message ?? "השאלה נכשלה");
      setQuestion(q);
    } finally {
      setAsking(false);
    }
  };

  const send = async () => {
    if (!to.trim() || !subject.trim() || !body.trim()) return;
    setSending(true);
    try {
      await runSend({ data: { to: to.trim(), subject: subject.trim(), body: body.trim() } });
      toast.success("המייל נשלח בהצלחה");
      setTo("");
      setSubject("");
      setBody("");
    } catch (e: any) {
      toast.error(e?.message ?? "השליחה נכשלה");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h2 className="font-display text-xl text-primary mb-1 flex items-center gap-2">
          <Inbox className="h-5 w-5" /> בוט ניהול מייל
        </h2>
        <p className="text-sm text-muted-foreground">
          שולחת מייל מכתובת הסטודיו, ושואלת שאלות על מה שיש בתיבת המייל המחוברת — אותה יכולת זמינה גם בטלפון (המספרים המוכרים
          + קוד PIN).
        </p>
      </div>

      {/* Send email */}
      <div className="bg-card rounded-2xl border border-primary/10 p-5 space-y-4">
        <h3 className="font-medium text-sm flex items-center gap-2">
          <Send className="h-4 w-4" /> שליחת מייל
        </h3>
        <Input type="email" dir="ltr" placeholder="נמען (אימייל)" value={to} onChange={(e) => setTo(e.target.value)} />
        <Input placeholder="נושא" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="תוכן המייל..."
          className="w-full min-h-[110px] rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <Button onClick={send} disabled={sending || !to.trim() || !subject.trim() || !body.trim()} className="rounded-full">
          {sending ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Send className="h-4 w-4 ml-2" />}
          שליחה
        </Button>
      </div>

      {/* Ask about inbox */}
      <div className="bg-card rounded-2xl border border-primary/10 p-5 space-y-4">
        <h3 className="font-medium text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> שאלות על תיבת המייל
        </h3>

        <div className="space-y-3">
          {chat.map((turn, i) => (
            <div key={i} className="space-y-1">
              <p className="text-sm font-medium">{turn.question}</p>
              <p className="text-sm text-muted-foreground whitespace-pre-line">{turn.answer}</p>
            </div>
          ))}
          {chat.length === 0 && (
            <p className="text-sm text-muted-foreground">
              לדוגמה: "יש לי מיילים שלא נקראו?", "מה כתוב במייל האחרון מ...?", "תחפשי מיילים על תשלום".
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !asking && ask()}
            placeholder="שאלי משהו על התיבה..."
            disabled={asking}
          />
          <Button onClick={ask} disabled={asking || !question.trim()} className="rounded-full">
            {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : "שאל/י"}
          </Button>
        </div>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { askSiteData, listSiteQuestions } from "@/lib/admin-site-bot.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Sparkles, MessageCircleQuestion, Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/site-bot-ask")({
  component: SiteBotAskAdmin,
});

// How many previous turns to send back as context on each new question —
// enough for real follow-ups ("ומה לגבי החודש הקודם") without the prompt
// growing unbounded.
const HISTORY_TURNS = 6;

function SiteBotAskAdmin() {
  const qc = useQueryClient();
  const ask = useServerFn(askSiteData);
  const listQuestions = useServerFn(listSiteQuestions);

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const questions = useQuery({ queryKey: ["site-bot-questions"], queryFn: () => listQuestions({}) });
  const scrollRef = useRef<HTMLDivElement>(null);

  // Server returns newest-first (for the old list view) — a chat reads
  // oldest-first, top to bottom.
  const chat = [...(questions.data ?? [])].reverse();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.length, asking]);

  const submitQuestion = async () => {
    const q = question.trim();
    if (!q) return toast.error("צריך לשאול משהו");
    const history = chat
      .filter((c: any) => !c.error && c.answer)
      .slice(-HISTORY_TURNS)
      .map((c: any) => ({ question: c.question as string, answer: c.answer as string }));

    setAsking(true);
    setQuestion("");
    try {
      await ask({ data: { question: q, history } });
      qc.invalidateQueries({ queryKey: ["site-bot-questions"] });
    } catch (e: any) {
      toast.error(e?.message ?? "השאלה נכשלה");
    } finally {
      setAsking(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitQuestion();
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="font-display text-xl text-primary mb-1 flex items-center gap-2">
          <MessageCircleQuestion className="h-5 w-5" /> בוט מידע כללי מהאתר
        </h2>
        <p className="text-sm text-muted-foreground">
          צ'אט חכם — שואלים בעברית, אפשר לשאול שאלות המשך ("ומה לגבי החודש הקודם?") והבוט זוכר את השיחה. מקבלים תשובה ממספרים אמיתיים מה-DB.{" "}
          <b>קריאה בלבד</b> — לא ניתן לשנות/למחוק כלום דרך כאן, גם לא ברמת מסד הנתונים.
        </p>
      </div>

      <div className="bg-card rounded-2xl border border-primary/5 flex flex-col h-[65vh]">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {chat.length === 0 && !asking && <p className="text-sm text-muted-foreground text-center py-10">עדיין לא נשאלו שאלות. תתחילי שיחה!</p>}
          {chat.map((q: any) => (
            <div key={q.id} className="space-y-2">
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-primary text-primary-foreground px-4 py-2 text-sm">{q.question}</div>
              </div>
              <div className="flex justify-start">
                <div
                  className={`max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-2 text-sm whitespace-pre-line ${
                    q.error ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground"
                  }`}
                >
                  {q.error ?? q.answer}
                </div>
              </div>
            </div>
          ))}
          {asking && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-muted text-muted-foreground px-4 py-2 text-sm flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 animate-pulse" /> חושבת…
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-primary/5 p-3 flex gap-2 items-end">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder='למשל: "כמה הרווחתי באשראי בחודש שעבר?" (Enter לשליחה, Shift+Enter לשורה חדשה)'
            rows={1}
            className="flex-1 resize-none min-h-10 max-h-32"
          />
          <Button onClick={submitQuestion} disabled={asking} size="icon" className="rounded-full shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

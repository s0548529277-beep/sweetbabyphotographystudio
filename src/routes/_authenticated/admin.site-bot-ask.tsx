import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { askSiteData, listSiteQuestions } from "@/lib/admin-site-bot.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Sparkles, MessageCircleQuestion } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/site-bot-ask")({
  component: SiteBotAskAdmin,
});

function SiteBotAskAdmin() {
  const qc = useQueryClient();
  const ask = useServerFn(askSiteData);
  const listQuestions = useServerFn(listSiteQuestions);

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const questions = useQuery({ queryKey: ["site-bot-questions"], queryFn: () => listQuestions({}) });

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

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-card rounded-2xl border border-primary/5 p-5">
        <h2 className="font-display text-xl text-primary mb-1 flex items-center gap-2">
          <MessageCircleQuestion className="h-5 w-5" /> בוט מידע כללי מהאתר
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          שואלים בעברית, מקבלים תשובה ממספרים אמיתיים מה-DB. <b>קריאה בלבד</b> — לא ניתן לשנות/למחוק כלום דרך כאן, גם לא ברמת מסד הנתונים.
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
  );
}

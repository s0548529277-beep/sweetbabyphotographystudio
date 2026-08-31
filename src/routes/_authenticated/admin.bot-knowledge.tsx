import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { addBotKnowledgeNote, deleteBotKnowledgeNote, listBotKnowledgeNotes } from "@/lib/bot-knowledge.functions";
import { Button } from "@/components/ui/button";
import { BrainCircuit, Loader2, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/bot-knowledge")({
  component: BotKnowledgeAdmin,
});

// Purely informational — a summary of what's already hard-wired into the
// bots' code (SYSTEM prompt + on-demand tools) so the admin can see the
// full picture in one place. Not editable here; a real change to any of
// these still needs a code change, same as before this page existed. The
// notes list below is the part that's actually live-editable.
const BUILTIN_TOPICS = [
  "כתובת הסטודיו, שעות פעילות ודרכי הגעה (רכב/אוטובוס)",
  "מחירון סטודיו, מבצע ניו-בורן בוקר, מדיניות איחור/ביטול/מקדמה",
  "חבילות הדרכה (בסיסי/MINI/PLUS/PREMIUM) וכרטיסיית SWEET 10+1",
  "מדריך שימוש מלא בציוד הסטודיו (משדר, פלאש, רקעים)",
  "קטלוג אביזרים להשכרה ומדיניות תמחור/נזק/ניקיון",
  "קודי קופון פעילים (נבדק בזמן אמת, אף פעם לא מהזיכרון)",
  "שירות הצילום האישי של מיכל (ניו-בורן/משפחה, סל לידה, צילומי חוץ)",
];

function BotKnowledgeAdmin() {
  const qc = useQueryClient();
  const fetchNotes = useServerFn(listBotKnowledgeNotes);
  const runAdd = useServerFn(addBotKnowledgeNote);
  const runDelete = useServerFn(deleteBotKnowledgeNote);
  const notes = useQuery({ queryKey: ["bot-knowledge-notes"], queryFn: () => fetchNotes({}) });

  const [content, setContent] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const add = async () => {
    const text = content.trim();
    if (!text) return;
    setAdding(true);
    try {
      await runAdd({ data: { content: text } });
      setContent("");
      qc.invalidateQueries({ queryKey: ["bot-knowledge-notes"] });
      toast.success("נוסף — הבוט ישתמש בזה כבר מהשיחה הבאה");
    } catch (e: any) {
      toast.error(e?.message ?? "ההוספה נכשלה");
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("למחוק את המידע הזה מהבוט?")) return;
    setDeletingId(id);
    try {
      await runDelete({ data: { id } });
      qc.invalidateQueries({ queryKey: ["bot-knowledge-notes"] });
    } catch (e: any) {
      toast.error(e?.message ?? "המחיקה נכשלה");
    } finally {
      setDeletingId(null);
    }
  };

  const rows = (notes.data ?? []) as Array<{ id: string; content: string; created_at: string }>;

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h2 className="font-display text-xl text-primary mb-1 flex items-center gap-2">
          <BrainCircuit className="h-5 w-5" /> מידע לבוט
        </h2>
        <p className="text-sm text-muted-foreground">
          כל מה שהבוט (בצ'אט באתר ובטלפון) יודע כרגע — ומקום להוסיף עובדות חדשות שהוא ישתמש בהן מיד, בלי לחכות לעדכון קוד.
        </p>
      </div>

      <div className="bg-card rounded-2xl border border-primary/10 p-5 space-y-3">
        <h3 className="font-medium text-sm">מידע קבוע (כבר מובנה בבוט)</h3>
        <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pr-5">
          {BUILTIN_TOPICS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground/80 pt-1">
          לשינוי במידע הקבוע (למשל מחיר) יש לפנות לעדכון קוד — הרשימה כאן להתמצאות בלבד.
        </p>
      </div>

      <div className="bg-card rounded-2xl border border-primary/10 p-5 space-y-4">
        <h3 className="font-medium text-sm">מידע נוסף שהוספת</h3>

        <div className="space-y-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder='למשל: "צילומי ניו-בורן במימוש סל לידה הם בחינם ללקוחה"'
            className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            maxLength={2000}
          />
          <Button onClick={add} disabled={adding || !content.trim()} className="rounded-full">
            {adding ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Plus className="h-4 w-4 ml-2" />}
            הוספה
          </Button>
        </div>

        <div className="space-y-2 pt-2">
          {rows.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-3 rounded-xl border border-primary/10 p-3">
              <p className="text-sm whitespace-pre-line flex-1">{r.content}</p>
              <button
                type="button"
                onClick={() => remove(r.id)}
                disabled={deletingId === r.id}
                aria-label="מחיקת מידע"
                className="h-8 w-8 shrink-0 rounded-full hover:bg-destructive/10 text-destructive flex items-center justify-center"
              >
                {deletingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))}
          {rows.length === 0 && !notes.isLoading && (
            <p className="text-sm text-muted-foreground text-center py-6">עדיין לא נוסף מידע ידני.</p>
          )}
        </div>
      </div>
    </div>
  );
}

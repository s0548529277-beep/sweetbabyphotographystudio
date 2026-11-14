import { useState } from "react";
import { Eye, Loader2, Pencil, Send } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type ContractEdits = { sectionEdits?: Record<string, string>; customText?: string };
export type ContractPreview = {
  html: string;
  missing: string[];
  /** צילומי חוץ / צילום כללי: the sections (locked = filled from the client's details, not editable). */
  sections?: { title: string; text: string; locked: boolean }[];
  /** ניו-בורן: the whole filled contract text. */
  filledText?: string;
};

/**
 * "תצוגה מקדימה" of a contract e-mail before it is sent: shows exactly what the client would get
 * (details filled in) and lists what is missing, without sending anything.
 * "עריכה חד-פעמית" lets the owner change the wording for THIS client only: the edited text is sent
 * to her and saved as the text her signing page shows (the permanent wording is not touched).
 */
export function ContractPreviewButton({
  load,
  send,
  className,
}: {
  load: (edits?: ContractEdits) => Promise<ContractPreview>;
  send?: (edits: ContractEdits) => Promise<unknown>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ContractPreview | null>(null);
  const [editing, setEditing] = useState(false);
  const [original, setOriginal] = useState<ContractPreview | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [fullText, setFullText] = useState("");

  const buildEdits = (): ContractEdits => {
    if (original?.sections) {
      const sectionEdits: Record<string, string> = {};
      for (const s of original.sections) {
        if (!s.locked && drafts[s.title] !== undefined && drafts[s.title].trim() !== s.text.trim()) {
          sectionEdits[s.title] = drafts[s.title];
        }
      }
      return { sectionEdits };
    }
    return fullText.trim() && fullText !== original?.filledText ? { customText: fullText } : {};
  };

  const show = async () => {
    setBusy(true);
    try {
      const r = await load();
      setResult(r);
      setOriginal(r);
      setDrafts(Object.fromEntries((r.sections ?? []).map((s) => [s.title, s.text])));
      setFullText(r.filledText ?? "");
      setEditing(false);
      setOpen(true);
    } catch (e: any) {
      toast.error(e?.message ?? "לא ניתן להציג תצוגה מקדימה");
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setBusy(true);
    try {
      const r = await load(buildEdits());
      setResult(r);
    } catch (e: any) {
      toast.error(e?.message ?? "הרענון נכשל");
    } finally {
      setBusy(false);
    }
  };

  const sendEdited = async () => {
    if (!send) return;
    const edits = buildEdits();
    const changed = Object.keys(edits.sectionEdits ?? {}).length > 0 || !!edits.customText;
    if (!changed) {
      toast.error("לא נעשה שום שינוי בנוסח");
      return;
    }
    if (!window.confirm("לשלוח ללקוחה את החוזה עם השינויים? הנוסח הערוך יוצג גם בדף האישור שלה.")) return;
    setBusy(true);
    try {
      await send(edits);
      toast.success("החוזה עם השינויים נשלח");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "השליחה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  const canEdit = !!result && (!!original?.sections?.length || !!original?.filledText);

  return (
    <>
      <button
        type="button"
        onClick={show}
        disabled={busy}
        className={
          className ??
          "inline-flex items-center gap-1.5 rounded-full border border-primary/15 px-3 h-7 text-xs hover:bg-cream disabled:opacity-60"
        }
      >
        {busy && !open ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />} תצוגה מקדימה של החוזה
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto flex flex-col gap-3" dir="rtl">
          <DialogHeader>
            <DialogTitle>תצוגה מקדימה של החוזה (לא נשלח)</DialogTitle>
          </DialogHeader>
          {result && result.missing.length > 0 && (
            <p className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm px-3 py-2">
              לא ניתן לשלוח עדיין — חסר: {result.missing.join(", ")}
            </p>
          )}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 px-3 h-7 hover:bg-cream"
              >
                <Pencil className="h-3 w-3" /> {editing ? "סגירת העריכה" : "עריכה חד-פעמית ללקוחה זו"}
              </button>
              <span className="text-muted-foreground">שינוי רק עבור הלקוחה הזו. הנוסח הקבוע לא משתנה.</span>
            </div>
          )}
          {editing && original && (
            <div className="rounded-xl border bg-cream/40 p-3 space-y-3">
              {original.sections ? (
                original.sections.map((s) => (
                  <label key={s.title} className="block">
                    <span className="text-xs font-semibold">
                      {s.title}
                      {s.locked && <span className="font-normal text-muted-foreground"> · מתמלא אוטומטית מפרטי הלקוחה, לא ניתן לעריכה</span>}
                    </span>
                    <textarea
                      value={drafts[s.title] ?? ""}
                      disabled={s.locked}
                      onChange={(e) => setDrafts((d) => ({ ...d, [s.title]: e.target.value }))}
                      rows={Math.min(8, Math.max(2, (drafts[s.title] ?? "").split("\n").length + 1))}
                      className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-60"
                    />
                  </label>
                ))
              ) : (
                <label className="block">
                  <span className="text-xs font-semibold">נוסח החוזה המלא (שורה שמתחילה ב-## היא כותרת סעיף; יש להשאיר את קישור האישור)</span>
                  <textarea
                    value={fullText}
                    onChange={(e) => setFullText(e.target.value)}
                    rows={16}
                    className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm font-mono"
                  />
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={refresh}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 px-3 h-8 text-xs hover:bg-cream disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />} רענון התצוגה עם השינויים
                </button>
                {send && (
                  <button
                    type="button"
                    onClick={sendEdited}
                    disabled={busy || (result?.missing.length ?? 0) > 0}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-4 h-8 text-xs disabled:opacity-50"
                  >
                    <Send className="h-3 w-3" /> שליחה ללקוחה עם השינויים
                  </button>
                )}
              </div>
            </div>
          )}
          {result && result.html ? (
            <iframe title="תצוגה מקדימה של החוזה" srcDoc={result.html} className="w-full min-h-[60vh] rounded-xl border bg-white" />
          ) : (
            <p className="text-sm text-muted-foreground">אי אפשר להציג תצוגה מקדימה לפני שנקבע תאריך צילום.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Shared "upload everything, then trash the bad ones before sending"
// triage step — per explicit request, used identically from both
// admin.photo-clients.$bookingId.tsx and admin.newborn-packages.$orderId.tsx
// right after a raw-proof upload batch. Three modes the admin picks
// herself: manual (just a trash-toggle grid), a free client-side "smart"
// pre-filter (blur + near-duplicate, image-quality.ts — no cost), and a
// paid real AI quality call (photo-ai-quality.functions.ts — costs real
// money per photo, clearly labeled as such). Never deletes anything on its
// own in any mode — analysis only SUGGESTS marks; the admin always
// confirms via "מחיקת המסומנות" before anything is actually removed.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, Check, Copy, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { runSmartTriage, type TriageFlag } from "@/lib/image-quality";
import { scorePhotoQualityBatch, type AiQualityScore } from "@/lib/photo-ai-quality.functions";

export type TriageImage = { id: string; url: string };
type Mode = "manual" | "smart" | "ai";

const AI_SCORE_FLAG_PERCENTILE = 0.2;

export function PhotoTriagePanel({ images, onDeleteMany }: { images: TriageImage[]; onDeleteMany: (ids: string[]) => Promise<void> }) {
  const [mode, setMode] = useState<Mode>("manual");
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [smartFlags, setSmartFlags] = useState<Map<string, TriageFlag>>(new Map());
  const [aiScores, setAiScores] = useState<Map<string, AiQualityScore>>(new Map());
  const [deleting, setDeleting] = useState(false);
  const scoreQuality = useServerFn(scorePhotoQualityBatch);

  const toggleMark = (id: string) => {
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runSmart = async () => {
    setRunning(true);
    try {
      const withBlobs = await Promise.all(
        images.map(async (img) => {
          const res = await fetch(img.url);
          if (!res.ok) throw new Error(`הורדת תמונה נכשלה (${res.status})`);
          return { id: img.id, blob: await res.blob() };
        }),
      );
      const flags = await runSmartTriage(withBlobs);
      const map = new Map(flags.map((f) => [f.imageId, f]));
      setSmartFlags(map);
      const suggested = flags.filter((f) => f.blurry || f.nearDuplicateOf).map((f) => f.imageId);
      setMarked(new Set(suggested));
      toast.success(`הניתוח הסתיים — ${suggested.length} תמונות מסומנות להצעה`);
    } catch (e: any) {
      toast.error(e?.message ?? "הניתוח נכשל");
    } finally {
      setRunning(false);
    }
  };

  const runAi = async () => {
    setRunning(true);
    try {
      const results = await scoreQuality({ data: { imageUrls: images.map((i) => i.url) } });
      const byUrl = new Map(results.map((r) => [r.imageUrl, r]));
      const map = new Map<string, AiQualityScore>();
      for (const img of images) {
        const r = byUrl.get(img.url);
        if (r) map.set(img.id, r);
      }
      setAiScores(map);

      const scored = images.map((img) => ({ id: img.id, score: map.get(img.id) })).filter((x) => x.score?.overallScore != null);
      const sorted = [...scored].sort((a, b) => (a.score!.overallScore as number) - (b.score!.overallScore as number));
      const cutoffIndex = Math.floor(sorted.length * AI_SCORE_FLAG_PERCENTILE);
      const lowScoreIds = new Set(sorted.slice(0, cutoffIndex).map((x) => x.id));
      const suggested = images.filter((img) => lowScoreIds.has(img.id) || map.get(img.id)?.eyesClosed === true).map((img) => img.id);
      setMarked(new Set(suggested));
      toast.success(`הניתוח הסתיים — ${suggested.length} תמונות מסומנות להצעה`);
    } catch (e: any) {
      toast.error(e?.message ?? "ניתוח ה-AI נכשל");
    } finally {
      setRunning(false);
    }
  };

  const onDeleteMarked = async () => {
    if (marked.size === 0) return;
    if (!confirm(`למחוק ${marked.size} תמונות שסומנו?`)) return;
    setDeleting(true);
    try {
      await onDeleteMany(Array.from(marked));
      setMarked(new Set());
      setSmartFlags(new Map());
      setAiScores(new Map());
      toast.success("התמונות המסומנות נמחקו");
    } catch (e: any) {
      toast.error(e?.message ?? "המחיקה נכשלה");
    } finally {
      setDeleting(false);
    }
  };

  if (images.length === 0) return null;

  return (
    <div className="bg-card rounded-2xl border border-primary/10 p-5 space-y-4">
      <div>
        <h3 className="font-display text-lg text-primary">אשפה — סינון לפני שליחה</h3>
        <p className="text-xs text-muted-foreground">מעלים הכל, מסמנים את הדפוקות, מוחקים, ואז שולחים ללקוחה רק את מה שנשאר.</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`rounded-xl border p-3 text-right transition-colors ${mode === "manual" ? "border-primary bg-primary/5" : "border-border"}`}
        >
          <div className="text-sm font-medium flex items-center gap-1.5">
            <Trash2 className="h-3.5 w-3.5" /> לבד
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">מסתכלים אחת אחת ומסמנים ידנית — בלי עזרה אוטומטית.</p>
        </button>
        <button
          type="button"
          onClick={() => setMode("smart")}
          className={`rounded-xl border p-3 text-right transition-colors ${mode === "smart" ? "border-primary bg-primary/5" : "border-border"}`}
        >
          <div className="text-sm font-medium flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> סינון חכם ראשוני
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">בדיקה אוטומטית וחינמית בדפדפן — מטושטשות וכפולות/דומות מדי.</p>
        </button>
        <button
          type="button"
          onClick={() => setMode("ai")}
          className={`rounded-xl border p-3 text-right transition-colors ${mode === "ai" ? "border-destructive bg-destructive/5" : "border-border"}`}
        >
          <div className="text-sm font-medium flex items-center gap-1.5">
            <Bot className="h-3.5 w-3.5" /> סינון AI
          </div>
          <p className="text-[11px] font-semibold text-destructive mt-0.5">⚠ עלות כסף אמיתית לכל תמונה — בדיקת איכות (טשטוש/חשיפה/עיניים עצומות)</p>
        </button>
      </div>

      {(mode === "smart" || mode === "ai") && (
        <button
          type="button"
          onClick={mode === "smart" ? runSmart : runAi}
          disabled={running}
          className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-sm font-semibold disabled:opacity-50 ${
            mode === "ai" ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"
          }`}
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {running ? "מריץ ניתוח..." : mode === "ai" ? `הרצת ניתוח AI (בתשלום · ${images.length} תמונות)` : "הרצת ניתוח חכם"}
        </button>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {images.map((img) => {
          const isMarked = marked.has(img.id);
          const smart = smartFlags.get(img.id);
          const ai = aiScores.get(img.id);
          const reason = smart?.blurry ? "מטושטש" : smart?.nearDuplicateOf ? "דומה לתמונה אחרת" : ai?.eyesClosed ? "עיניים עצומות" : ai?.note || null;
          return (
            <button
              key={img.id}
              type="button"
              onClick={() => toggleMark(img.id)}
              className="relative aspect-square rounded-lg overflow-hidden border-2"
              style={{ borderColor: isMarked ? "var(--color-destructive, #b4443a)" : "transparent" }}
            >
              <img src={img.url} alt="" className={`w-full h-full object-cover ${isMarked ? "opacity-50" : ""}`} />
              <span
                className={`absolute top-1 right-1 h-6 w-6 rounded-full flex items-center justify-center ${
                  isMarked ? "bg-destructive text-destructive-foreground" : "bg-white/75 text-muted-foreground"
                }`}
              >
                {isMarked ? <Trash2 className="h-3 w-3" /> : <Check className="h-3 w-3 opacity-0" />}
              </span>
              {reason && (
                <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate">{reason}</span>
              )}
              {ai?.overallScore != null && <span className="absolute top-1 left-1 bg-black/60 text-white text-[9px] px-1 rounded">{ai.overallScore}</span>}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Copy className="h-3.5 w-3.5" /> {marked.size} מסומנות למחיקה
        </span>
        <div className="flex items-center gap-2">
          {marked.size > 0 && (
            <button type="button" onClick={() => setMarked(new Set())} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
              <X className="h-3 w-3" /> ניקוי סימונים
            </button>
          )}
          <button
            type="button"
            onClick={onDeleteMarked}
            disabled={marked.size === 0 || deleting}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-destructive text-destructive-foreground text-sm font-semibold disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            מחיקת המסומנות
          </button>
        </div>
      </div>
    </div>
  );
}

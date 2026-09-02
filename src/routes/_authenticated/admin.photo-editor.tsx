import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { deletePhotoEditHistory, editPhoto, listPhotoEditHistory, PHOTO_EDIT_STYLES } from "@/lib/photo-editor.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Wand2, Download, ImageIcon, Loader2, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/photo-editor")({
  component: PhotoEditorAdmin,
});

type HistoryRow = {
  id: string;
  style: string;
  include_face: boolean;
  intensity: "light" | "strong";
  original_url: string;
  edited_url: string | null;
  status: "processing" | "done" | "failed";
  error_message: string | null;
  created_at: string;
};

async function uploadOriginal(file: File): Promise<string> {
  const ext = file.name.split(".").pop();
  const path = `photo-editor/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("items").upload(path, file, { upsert: false });
  if (error) throw error;
  const { data, error: signErr } = await supabase.storage.from("items").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (signErr || !data?.signedUrl) throw signErr ?? new Error("שגיאה בהעלאת התמונה");
  return data.signedUrl;
}

function PhotoEditorAdmin() {
  const qc = useQueryClient();
  const runEdit = useServerFn(editPhoto);
  const fetchHistory = useServerFn(listPhotoEditHistory);
  const runDeleteHistory = useServerFn(deletePhotoEditHistory);
  const history = useQuery({ queryKey: ["photo-edit-history"], queryFn: () => fetchHistory({}) });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteHistoryRow = async (id: string) => {
    if (!confirm("למחוק את העריכה הזו מההיסטוריה?")) return;
    setDeletingId(id);
    try {
      await runDeleteHistory({ data: { id } });
      qc.invalidateQueries({ queryKey: ["photo-edit-history"] });
    } catch (e: any) {
      toast.error(e?.message ?? "המחיקה נכשלה");
    } finally {
      setDeletingId(null);
    }
  };

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [style, setStyle] = useState<string>(Object.keys(PHOTO_EDIT_STYLES)[0]);
  const [includeFace, setIncludeFace] = useState(false);
  const [intensity, setIntensity] = useState<"light" | "strong">("light");
  const [customInstructions, setCustomInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ originalUrl: string; editedUrl: string } | null>(null);

  const onPickFile = (f: File | null) => {
    setFile(f);
    setResult(null);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const originalUrl = await uploadOriginal(file);
      const res = await runEdit({
        data: { imageUrl: originalUrl, style, includeFace, intensity, customInstructions: customInstructions.trim() || undefined },
      });
      setResult({ originalUrl, editedUrl: res.editedUrl });
      toast.success("העיבוד הושלם");
      qc.invalidateQueries({ queryKey: ["photo-edit-history"] });
    } catch (e: any) {
      toast.error(e?.message ?? "העיבוד נכשל");
    } finally {
      setBusy(false);
    }
  };

  const rows = (history.data ?? []) as unknown as HistoryRow[];

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="font-display text-xl text-primary mb-1 flex items-center gap-2">
          <Wand2 className="h-5 w-5" /> עריכת תמונות בבינה מלאכותית
        </h2>
        <p className="text-sm text-muted-foreground">
          מעלים תמונה, בוחרים סגנון, ומקבלים גרסה מעובדת — עיבוד צבע/תאורה/גוון בלבד, בלי להמציא תוכן חדש. תמיד כדאי להשוות מקור מול תוצאה לפני שמשתמשים בתמונה בפועל.
        </p>
      </div>

      {/* Upload + controls */}
      <div className="bg-card rounded-2xl border border-primary/10 p-5 space-y-4">
        <div>
          <label className="text-sm font-medium">תמונה מקורית</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm file:ml-3 file:h-9 file:rounded-full file:border-0 file:bg-primary file:text-primary-foreground file:px-4 file:text-sm"
          />
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium">סגנון</label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {Object.entries(PHOTO_EDIT_STYLES).map(([key, s]) => (
                <option key={key} value={key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">עוצמה</label>
            <select
              value={intensity}
              onChange={(e) => setIntensity(e.target.value as "light" | "strong")}
              className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="light">קלה</option>
              <option value="strong">חזקה</option>
            </select>
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={includeFace} onChange={(e) => setIncludeFace(e.target.checked)} className="h-4 w-4" />
              כולל רטוש פנים עדין
            </label>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">הוראה נוספת בטקסט חופשי (אופציונלי)</label>
          <textarea
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            placeholder='למשל: "עוד קצת יותר בהיר", "רקע לבן נקי", "בלי לגעת בבגדים"...'
            className="mt-1 w-full min-h-[70px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            maxLength={500}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            נוסף על הסגנון שנבחר למעלה — אפשר להשתמש בזה גם כדי לדייק/לשפר סגנון קיים, וגם לבד עם הסגנון "עיבוד חופשי".
          </p>
        </div>

        {previewUrl && (
          <img src={previewUrl} alt="תצוגה מקדימה" className="max-h-64 rounded-xl border border-primary/10 object-contain" />
        )}

        <Button onClick={submit} disabled={!file || busy} className="rounded-full">
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 ml-2 animate-spin" /> מעבד...
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4 ml-2" /> עיבוד תמונה
            </>
          )}
        </Button>
      </div>

      {/* Before / after tile */}
      {result && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">לפני</p>
            <img src={result.originalUrl} alt="לפני" className="w-full rounded-xl border border-primary/10 object-cover" />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">אחרי</p>
            <img src={result.editedUrl} alt="אחרי" className="w-full rounded-xl border border-primary/10 object-cover" />
            <a
              href={result.editedUrl}
              download
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Download className="h-3.5 w-3.5" /> הורדה באיכות מלאה
            </a>
          </div>
        </div>
      )}

      {/* History */}
      <div>
        <h3 className="font-display text-lg text-primary mb-3">היסטוריית עריכות</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((r) => (
            <div key={r.id} className="bg-card rounded-xl border border-primary/10 p-3 space-y-2 relative group">
              <button
                type="button"
                onClick={() => deleteHistoryRow(r.id)}
                disabled={deletingId === r.id}
                className="absolute top-2 left-2 z-10 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition disabled:opacity-100"
                aria-label="מחיקת עריכה מההיסטוריה"
              >
                {deletingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
              <div className="grid grid-cols-2 gap-1.5">
                <img src={r.original_url} alt="לפני" className="aspect-square w-full rounded-lg object-cover" />
                {r.status === "done" && r.edited_url ? (
                  <img src={r.edited_url} alt="אחרי" className="aspect-square w-full rounded-lg object-cover" />
                ) : (
                  <div className="aspect-square w-full rounded-lg bg-cream/60 flex items-center justify-center">
                    {r.status === "processing" ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {PHOTO_EDIT_STYLES[r.style]?.label ?? r.style} · {r.intensity === "strong" ? "עוצמה חזקה" : "עוצמה קלה"}
                {r.include_face ? " · כולל פנים" : ""}
              </p>
              {r.status === "failed" && <p className="text-xs text-destructive">{r.error_message}</p>}
              {r.status === "done" && r.edited_url && (
                <a href={r.edited_url} download target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <Download className="h-3 w-3" /> הורדה
                </a>
              )}
              <p className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString("he-IL")}</p>
            </div>
          ))}
          {rows.length === 0 && <p className="text-sm text-muted-foreground col-span-full text-center py-8">עדיין אין עריכות.</p>}
        </div>
      </div>
    </div>
  );
}

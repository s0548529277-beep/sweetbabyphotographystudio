// Admin management for the "בניית אלבום מותאם אישית" customer wizard
// (/album-builder): sizes/pricing per shape, and templates. A template's
// page layout is built by picking a photo count + one of collage-data.ts's
// own layout-variant ids — reusing that already-built slot math instead of
// a freeform visual designer, same "simple first" decision as the customer
// editor (see album-builder migration's doc comment).
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Images, Loader2, Upload, Trash2, Eye, EyeOff, Plus, X, Layers } from "lucide-react";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
import { heError } from "@/lib/he-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLayoutVariants, type LayoutVariant } from "@/lib/collage-data";
import {
  ALBUM_TEMPLATE_CATEGORIES,
  type AlbumShapeRow,
  type AlbumSizeRow,
  type AlbumTemplateRow,
  type AlbumTemplatePage,
} from "@/lib/album-data";

export const Route = createFileRoute("/_authenticated/admin/album-templates")({
  component: AdminAlbumTemplatesPage,
});

// New tables — cast until the generated Database type picks them up.
const supabase = supabaseTyped as any;

async function uploadThumbnail(file: File): Promise<{ url: string; path: string }> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `album-templates/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("items").upload(path, file, { upsert: false });
  if (error) throw error;
  const { data, error: signErr } = await supabase.storage
    .from("items")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (signErr || !data?.signedUrl) throw signErr ?? new Error("שגיאה ביצירת קישור לתמונה");
  return { url: data.signedUrl, path };
}

function SizesEditor({ shapes }: { shapes: AlbumShapeRow[] }) {
  const qc = useQueryClient();
  const sizesQ = useQuery({
    queryKey: ["admin-album-sizes"],
    queryFn: async (): Promise<AlbumSizeRow[]> => {
      const { data, error } = await supabase
        .from("album_sizes")
        .select("*")
        .order("shape_id")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  const [drafts, setDrafts] = useState<Record<string, Partial<AlbumSizeRow>>>({});

  const save = async (id: string) => {
    const patch = drafts[id];
    if (!patch) return;
    const { error } = await supabase.from("album_sizes").update(patch).eq("id", id);
    if (error) return toast.error(heError(error));
    toast.success("נשמר");
    setDrafts((d) => {
      const { [id]: _drop, ...rest } = d;
      return rest;
    });
    qc.invalidateQueries({ queryKey: ["admin-album-sizes"] });
  };

  const field = (row: AlbumSizeRow, key: keyof AlbumSizeRow) =>
    (drafts[row.id]?.[key] as any) ?? row[key];
  const setField = (id: string, key: keyof AlbumSizeRow, value: any) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [key]: value } }));

  return (
    <div className="space-y-4">
      {shapes.map((shape) => {
        const rows = (sizesQ.data ?? []).filter((s) => s.shape_id === shape.id);
        return (
          <div
            key={shape.id}
            className="rounded-2xl border border-primary/10 bg-card p-4 space-y-2"
          >
            <div className="font-medium text-primary text-sm">{shape.name_he}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground text-right">
                    <th className="p-1.5 font-normal">מידה</th>
                    <th className="p-1.5 font-normal">ס"מ</th>
                    <th className="p-1.5 font-normal">מחיר בסיס</th>
                    <th className="p-1.5 font-normal">מחיר לעמוד נוסף</th>
                    <th className="p-1.5 font-normal">עמודים מינ׳</th>
                    <th className="p-1.5 font-normal">עמודים מקס׳</th>
                    <th className="p-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const dirty = !!drafts[row.id];
                    return (
                      <tr key={row.id} className="border-t border-primary/5">
                        <td className="p-1.5">{row.label_he}</td>
                        <td className="p-1.5 text-muted-foreground">
                          {row.width_cm}×{row.height_cm}
                        </td>
                        <td className="p-1.5">
                          <Input
                            className="h-7 w-20 text-xs"
                            type="number"
                            value={field(row, "base_price")}
                            onChange={(e) => setField(row.id, "base_price", Number(e.target.value))}
                          />
                        </td>
                        <td className="p-1.5">
                          <Input
                            className="h-7 w-20 text-xs"
                            type="number"
                            value={field(row, "price_per_extra_page")}
                            onChange={(e) =>
                              setField(row.id, "price_per_extra_page", Number(e.target.value))
                            }
                          />
                        </td>
                        <td className="p-1.5">
                          <Input
                            className="h-7 w-16 text-xs"
                            type="number"
                            value={field(row, "min_pages")}
                            onChange={(e) => setField(row.id, "min_pages", Number(e.target.value))}
                          />
                        </td>
                        <td className="p-1.5">
                          <Input
                            className="h-7 w-16 text-xs"
                            type="number"
                            value={field(row, "max_pages")}
                            onChange={(e) => setField(row.id, "max_pages", Number(e.target.value))}
                          />
                        </td>
                        <td className="p-1.5">
                          {dirty && (
                            <Button
                              size="sm"
                              className="h-7 rounded-full text-xs px-2.5"
                              onClick={() => save(row.id)}
                            >
                              שמירה
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {sizesQ.isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
    </div>
  );
}

const PHOTO_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

function TemplateForm({ shapes, onCreated }: { shapes: AlbumShapeRow[]; onCreated: () => void }) {
  const [shapeId, setShapeId] = useState(shapes[0]?.id ?? "");
  const [name, setName] = useState("");
  const [category, setCategory] = useState(ALBUM_TEMPLATE_CATEGORIES[0]);
  const [minPages, setMinPages] = useState(20);
  const [maxPages, setMaxPages] = useState(60);
  const [pages, setPages] = useState<AlbumTemplatePage[]>([]);
  const [draftCount, setDraftCount] = useState(3);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const thumbRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const variantsForCount: LayoutVariant[] = getLayoutVariants(draftCount);

  const addPage = (layoutId: string) =>
    setPages((p) => [...p, { layoutId, photoCount: draftCount, hasCaption: false }]);
  const removePage = (idx: number) => setPages((p) => p.filter((_, i) => i !== idx));
  const toggleCaption = (idx: number) =>
    setPages((p) => p.map((pg, i) => (i === idx ? { ...pg, hasCaption: !pg.hasCaption } : pg)));

  const reset = () => {
    setName("");
    setPages([]);
    setThumbFile(null);
    if (thumbRef.current) thumbRef.current.value = "";
  };

  const create = async () => {
    if (!shapeId || !name.trim() || pages.length === 0)
      return toast.error("צריך צורה, שם, ולפחות עמוד אחד בעיצוב");
    setBusy(true);
    try {
      let thumbnail_url: string | null = null;
      if (thumbFile) {
        const up = await uploadThumbnail(thumbFile);
        thumbnail_url = up.url;
      }
      const { error } = await supabase.from("album_templates").insert({
        shape_id: shapeId,
        name: name.trim(),
        category,
        thumbnail_url,
        template_data: { pages },
        min_pages: minPages,
        max_pages: maxPages,
      });
      if (error) throw error;
      toast.success("העיצוב נוסף");
      reset();
      onCreated();
    } catch (e) {
      toast.error(heError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-primary/10 bg-card p-4 space-y-4">
      <div className="font-medium text-primary text-sm flex items-center gap-1.5">
        <Plus className="h-4 w-4" /> עיצוב חדש
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <select
          value={shapeId}
          onChange={(e) => setShapeId(e.target.value)}
          className="h-10 rounded-lg border border-primary/10 bg-background px-3 text-sm"
        >
          {shapes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name_he}
            </option>
          ))}
        </select>
        <Input placeholder="שם העיצוב" value={name} onChange={(e) => setName(e.target.value)} />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-10 rounded-lg border border-primary/10 bg-background px-3 text-sm"
        >
          {ALBUM_TEMPLATE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            className="w-20"
            value={minPages}
            onChange={(e) => setMinPages(Number(e.target.value))}
          />
          <span className="text-xs text-muted-foreground">עד</span>
          <Input
            type="number"
            className="w-20"
            value={maxPages}
            onChange={(e) => setMaxPages(Number(e.target.value))}
          />
          <span className="text-xs text-muted-foreground">עמודים</span>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground flex items-center gap-2">
          <Upload className="h-3.5 w-3.5" /> תמונת תצוגה מקדימה (לא חובה)
        </label>
        <input
          ref={thumbRef}
          type="file"
          accept="image/*"
          onChange={(e) => setThumbFile(e.target.files?.[0] ?? null)}
          className="text-xs"
        />
      </div>

      <div className="rounded-xl border border-primary/5 bg-cream/40 p-3 space-y-3">
        <div className="text-xs font-medium text-primary flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5" /> בניית עמודי העיצוב
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">מספר תמונות בעמוד:</span>
          {PHOTO_COUNT_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => setDraftCount(n)}
              className={`h-7 w-7 rounded-full text-xs border ${draftCount === n ? "border-primary bg-primary/10 text-primary" : "border-primary/10 text-muted-foreground"}`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {variantsForCount.map((v) => (
            <button
              key={v.id}
              onClick={() => addPage(v.id)}
              className="text-xs rounded-full border border-primary/10 px-3 py-1.5 hover:border-primary hover:bg-primary/5"
            >
              + עמוד: {v.label}
            </button>
          ))}
        </div>
        {pages.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {pages.map((p, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 text-xs bg-card rounded-lg border border-primary/5 px-2.5 py-1.5"
              >
                <span>
                  עמוד {idx + 1} — {p.photoCount} תמונות, פריסה "{p.layoutId}"
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleCaption(idx)}
                    className={`text-[11px] rounded-full px-2 py-0.5 border ${p.hasCaption ? "border-primary bg-primary/10 text-primary" : "border-primary/10 text-muted-foreground"}`}
                  >
                    כיתוב
                  </button>
                  <button
                    onClick={() => removePage(idx)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button className="w-full rounded-full gap-1.5" disabled={busy} onClick={create}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} יצירת העיצוב
      </Button>
    </div>
  );
}

function AdminAlbumTemplatesPage() {
  const qc = useQueryClient();
  const shapesQ = useQuery({
    queryKey: ["admin-album-shapes"],
    queryFn: async (): Promise<AlbumShapeRow[]> => {
      const { data, error } = await supabase.from("album_shapes").select("*").order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  const templatesQ = useQuery({
    queryKey: ["admin-album-templates"],
    queryFn: async (): Promise<AlbumTemplateRow[]> => {
      const { data, error } = await supabase
        .from("album_templates")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-album-templates"] });
  };

  const toggleActive = async (t: AlbumTemplateRow) => {
    const { error } = await supabase
      .from("album_templates")
      .update({ is_active: !t.is_active })
      .eq("id", t.id);
    if (error) return toast.error(heError(error));
    refresh();
  };

  const remove = async (t: AlbumTemplateRow) => {
    if (!confirm(`למחוק את העיצוב "${t.name}"?`)) return;
    const { error } = await supabase.from("album_templates").delete().eq("id", t.id);
    if (error) return toast.error(heError(error));
    toast.success("נמחק");
    refresh();
  };

  const shapes = shapesQ.data ?? [];

  return (
    <div dir="rtl" className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-primary flex items-center gap-2">
          <Images className="h-5 w-5" /> בניית אלבום מותאם אישית — ניהול
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          מחירי מידות (לפי צורה) ועיצובים מוכנים ל-<code>/album-builder</code>. עיצוב = רשימת
          עמודים, כל עמוד = מספר תמונות + פריסה מוכנה (מאותה מערכת שכבר בנויה ב"יצירת קולאז'"
          הציבורית) — בלי עורך גרירה חופשי.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-primary">מחירי מידות</h3>
        <SizesEditor shapes={shapes} />
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-primary">עיצובים קיימים</h3>
        {templatesQ.isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        <div className="grid sm:grid-cols-2 gap-3">
          {(templatesQ.data ?? []).map((t) => {
            const shapeName = shapes.find((s) => s.id === t.shape_id)?.name_he ?? "";
            return (
              <div
                key={t.id}
                className="rounded-2xl border border-primary/10 bg-card overflow-hidden"
              >
                {t.thumbnail_url && (
                  <img src={t.thumbnail_url} alt={t.name} className="w-full h-28 object-cover" />
                )}
                <div className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-primary text-sm">{t.name}</span>
                    {!t.is_active && (
                      <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-2 py-0.5">
                        כבוי
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {shapeName} · {t.category} · {t.template_data.pages.length} עמודים
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 rounded-full text-xs gap-1 px-2"
                      onClick={() => toggleActive(t)}
                    >
                      {t.is_active ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                      {t.is_active ? "הסתרה" : "הפעלה"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 rounded-full text-xs gap-1 px-2 text-destructive hover:text-destructive"
                      onClick={() => remove(t)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> מחיקה
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <TemplateForm shapes={shapes} onCreated={refresh} />
    </div>
  );
}

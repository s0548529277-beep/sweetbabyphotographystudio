// Admin for the "בניית אלבום מותאם אישית" customer wizard (/album-builder,
// still hidden from customers). Ported 2026-10-27 from the Sept 3 branch
// claude/email-search-rpn6jn (old page /admin/album-templates) and extended:
//  * "הזמנות אלבום" — album_orders sent from the wizard: design preview with
//    the customer's photos (private bucket → signed URLs), status, notes,
//    WhatsApp, and linking to an existing newborn order (reuse of
//    newborn_package_orders, no duplicate client records).
//  * "עיצובים" + "מידות ומחירים" — as in the old branch. A template page =
//    photo count + one of collage-data.ts's layout variants (same slot math
//    as the public collage maker), no freeform designer.
//  * "דוגמאות" — admin-only list of sample albums (album_examples), e.g.
//    links to the owner's own Drive files. Links only — Drive sharing is
//    never changed from here, so they open only for the Drive owner.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Upload,
  Trash2,
  Eye,
  EyeOff,
  Plus,
  X,
  Layers,
  BookHeart,
  MessageCircle,
  ExternalLink,
  Copy,
} from "lucide-react";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
import { heError } from "@/lib/he-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLayoutVariants, type LayoutVariant } from "@/lib/collage-data";
import {
  ALBUM_TEMPLATE_CATEGORIES,
  ALBUM_ORDER_STATUS,
  resolveAlbumPageRects,
  type AlbumShapeRow,
  type AlbumSizeRow,
  type AlbumTemplateRow,
  type AlbumTemplatePage,
  type AlbumOrderRow,
  type AlbumExampleRow,
} from "@/lib/album-data";

export const Route = createFileRoute("/_authenticated/admin/albums")({
  component: AdminAlbumsPage,
});

// album_* tables aren't in the generated Database type yet.
const supabase = supabaseTyped as any;

const CUSTOMER_URL = "https://sweetbabyphoto.shop/album-builder";

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
                  עמוד {idx + 1} — {p.photoCount} תמונות, פריסה "
                  {getLayoutVariants(p.photoCount).find((v) => v.id === p.layoutId)?.label ?? p.layoutId}"
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

type NewbornOption = { id: string; contact_name: string; session_date: string | null };

function waLink(phone: string | null) {
  const d = (phone ?? "").replace(/\D/g, "");
  if (!d) return null;
  const intl = d.startsWith("0") ? `972${d.slice(1)}` : d;
  return `https://wa.me/${intl}`;
}

function AlbumOrderCard({
  order,
  newbornOptions,
  onChanged,
}: {
  order: AlbumOrderRow;
  newbornOptions: NewbornOption[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState(order.admin_notes ?? "");

  useEffect(() => {
    if (!open) return;
    const paths = (order.design_json?.pages ?? [])
      .flatMap((p) => p.slots.map((s) => s.path))
      .filter((p): p is string => !!p && !urls[p]);
    if (paths.length === 0) return;
    void (async () => {
      const { data, error } = await supabase.storage.from("album-photos").createSignedUrls(paths, 60 * 60);
      if (error) return toast.error(heError(error));
      const next: Record<string, string> = {};
      (data ?? []).forEach((d: { path: string | null; signedUrl: string }) => {
        if (d.path && d.signedUrl) next[d.path] = d.signedUrl;
      });
      setUrls((u) => ({ ...u, ...next }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order.id]);

  const patch = async (values: Partial<AlbumOrderRow>) => {
    const { error } = await supabase.from("album_orders").update(values).eq("id", order.id);
    if (error) return toast.error(heError(error));
    toast.success("נשמר");
    onChanged();
  };

  const remove = async () => {
    if (!confirm("למחוק את הזמנת האלבום? (התמונות שהלקוחה העלתה נשארות באחסון)")) return;
    const { error } = await supabase.from("album_orders").delete().eq("id", order.id);
    if (error) return toast.error(heError(error));
    onChanged();
  };

  const st = ALBUM_ORDER_STATUS[order.status] ?? { label: order.status, cls: "bg-muted" };
  const wa = waLink(order.contact_phone);
  const photoCount = (order.design_json?.pages ?? []).reduce((n, p) => n + p.slots.filter((s) => s.path).length, 0);

  return (
    <div className="rounded-2xl border border-primary/10 bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium text-primary">{order.contact_name || "ללא שם"}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {new Date(order.created_at).toLocaleDateString("he-IL")} · {order.summary} · {photoCount} תמונות ·{" "}
            {Number(order.price)}₪
          </div>
          <div className="text-xs text-muted-foreground mt-0.5" dir="ltr">
            {[order.contact_phone, order.contact_email].filter(Boolean).join(" · ")}
          </div>
        </div>
        <span className={`text-xs rounded-full px-2.5 py-1 ${st.cls}`}>{st.label}</span>
      </div>
      {order.customer_notes && (
        <div className="text-xs rounded-xl bg-muted/50 p-2.5">
          <span className="text-muted-foreground">הערות הלקוחה: </span>
          {order.customer_notes}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={order.status}
          onChange={(e) => patch({ status: e.target.value })}
          className="h-8 rounded-lg border border-primary/10 bg-background px-2 text-xs"
        >
          {Object.entries(ALBUM_ORDER_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select
          value={order.newborn_order_id ?? ""}
          onChange={(e) => patch({ newborn_order_id: e.target.value || null })}
          className="h-8 max-w-56 rounded-lg border border-primary/10 bg-background px-2 text-xs"
          title="קישור להזמנת ניו-בורן קיימת"
        >
          <option value="">— לא מקושר לניו-בורן —</option>
          {newbornOptions.map((n) => (
            <option key={n.id} value={n.id}>
              ניו-בורן: {n.contact_name}
              {n.session_date ? ` (${new Date(n.session_date).toLocaleDateString("he-IL")})` : ""}
            </option>
          ))}
        </select>
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline" className="h-8 rounded-full text-xs gap-1">
              <MessageCircle className="h-3.5 w-3.5" /> וואטסאפ
            </Button>
          </a>
        )}
        <Button size="sm" variant="ghost" className="h-8 rounded-full text-xs" onClick={() => setOpen((o) => !o)}>
          {open ? "הסתרת העיצוב" : "צפייה בעיצוב ובתמונות"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 rounded-full text-xs text-destructive hover:text-destructive"
          onClick={remove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex gap-2">
        <Input
          className="h-8 text-xs"
          placeholder="הערות פנימיות"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {notes !== (order.admin_notes ?? "") && (
          <Button size="sm" className="h-8 rounded-full text-xs" onClick={() => patch({ admin_notes: notes || null })}>
            שמירה
          </Button>
        )}
      </div>
      {open && (
        <div className="grid sm:grid-cols-2 gap-3 pt-1">
          {(order.design_json?.pages ?? []).map((page, pi) => {
            const rects = resolveAlbumPageRects({
              layoutId: page.layoutId,
              photoCount: page.photoCount,
              hasCaption: page.caption !== null,
            });
            return (
              <div key={pi} className="space-y-1">
                <div className="text-[11px] text-muted-foreground">עמוד {pi + 1}</div>
                <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden bg-muted">
                  {page.slots.map((s, si) => {
                    const r = rects[si] ?? { x: 0, y: 0, w: 1, h: 1 };
                    const url = s.path ? urls[s.path] : undefined;
                    return (
                      <a
                        key={si}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="absolute border border-white overflow-hidden bg-background/60"
                        style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
                      >
                        {url && <img src={url} alt="" className="w-full h-full object-cover" />}
                      </a>
                    );
                  })}
                </div>
                {page.caption && <div className="text-xs">״{page.caption}״</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OrdersTab() {
  const qc = useQueryClient();
  const ordersQ = useQuery({
    queryKey: ["admin-album-orders"],
    queryFn: async (): Promise<AlbumOrderRow[]> => {
      const { data, error } = await supabase.from("album_orders").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const newbornQ = useQuery({
    queryKey: ["admin-album-newborn-options"],
    queryFn: async (): Promise<NewbornOption[]> => {
      const { data, error } = await supabase
        .from("newborn_package_orders")
        .select("id, contact_name, session_date")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-album-orders"] });
  const orders = ordersQ.data ?? [];
  return (
    <div className="space-y-3">
      {ordersQ.isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
      {ordersQ.error && <p className="text-sm text-destructive">{heError(ordersQ.error)}</p>}
      {!ordersQ.isLoading && orders.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">
          עדיין אין הזמנות אלבום. כשלקוחה תשלח אלבום מהעמוד, הוא יופיע כאן.
        </p>
      )}
      {orders.map((o) => (
        <AlbumOrderCard key={o.id} order={o} newbornOptions={newbornQ.data ?? []} onChanged={refresh} />
      ))}
    </div>
  );
}

function ExamplesTab() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-album-examples"],
    queryFn: async (): Promise<AlbumExampleRow[]> => {
      const { data, error } = await supabase.from("album_examples").select("*").order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState(ALBUM_TEMPLATE_CATEGORIES[0]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-album-examples"] });

  const add = async () => {
    if (!title.trim() || !/^https?:\/\//.test(url.trim())) return toast.error("צריך שם וקישור תקין");
    const { error } = await supabase.from("album_examples").insert({
      title: title.trim(),
      url: url.trim(),
      category,
      sort_order: (q.data?.length ?? 0) + 1,
    });
    if (error) return toast.error(heError(error));
    setTitle("");
    setUrl("");
    refresh();
  };
  const remove = async (id: string) => {
    if (!confirm("להסיר את הדוגמה מהרשימה? (הקובץ עצמו בדרייב לא נמחק)")) return;
    const { error } = await supabase.from("album_examples").delete().eq("id", id);
    if (error) return toast.error(heError(error));
    refresh();
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        אלבומים לדוגמה לעיון בזמן בניית עיצובים. הקישורים נפתחים רק בחשבון הדרייב שלך — שום הגדרת שיתוף לא שונתה.
      </p>
      {q.isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
      <div className="grid sm:grid-cols-2 gap-2">
        {(q.data ?? []).map((ex) => (
          <div key={ex.id} className="rounded-xl border border-primary/10 bg-card p-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <a
                href={ex.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
              >
                {ex.title} <ExternalLink className="h-3 w-3" />
              </a>
              <div className="text-xs text-muted-foreground">
                {[ex.category, ex.note].filter(Boolean).join(" · ")}
              </div>
            </div>
            <button onClick={() => remove(ex.id)} className="text-muted-foreground hover:text-destructive">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-primary/10 bg-card p-3 grid sm:grid-cols-[1fr_1.4fr_auto_auto] gap-2">
        <Input placeholder="שם הדוגמה" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input placeholder="קישור (דרייב / אחר)" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-10 rounded-lg border border-primary/10 bg-background px-2 text-sm"
        >
          {ALBUM_TEMPLATE_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <Button className="rounded-full gap-1" onClick={add}>
          <Plus className="h-4 w-4" /> הוספה
        </Button>
      </div>
    </div>
  );
}

function TemplatesTab({ shapes }: { shapes: AlbumShapeRow[] }) {
  const qc = useQueryClient();
  const templatesQ = useQuery({
    queryKey: ["admin-album-templates"],
    queryFn: async (): Promise<AlbumTemplateRow[]> => {
      const { data, error } = await supabase.from("album_templates").select("*").order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-album-templates"] });

  const toggleActive = async (t: AlbumTemplateRow) => {
    const { error } = await supabase.from("album_templates").update({ is_active: !t.is_active }).eq("id", t.id);
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

  return (
    <div className="space-y-4">
      {templatesQ.isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
      <div className="grid sm:grid-cols-2 gap-3">
        {(templatesQ.data ?? []).map((t) => {
          const shapeName = shapes.find((s) => s.id === t.shape_id)?.name_he ?? "";
          return (
            <div key={t.id} className="rounded-2xl border border-primary/10 bg-card overflow-hidden">
              {t.thumbnail_url && <img src={t.thumbnail_url} alt={t.name} className="w-full h-28 object-cover" />}
              <div className="p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-primary text-sm">{t.name}</span>
                  {!t.is_active && (
                    <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-2 py-0.5">כבוי</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {shapeName} · {t.category} · {t.template_data.pages.length} עמודי עיצוב
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" variant="ghost" className="h-7 rounded-full text-xs gap-1 px-2" onClick={() => toggleActive(t)}>
                    {t.is_active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
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
      {shapes.length > 0 && <TemplateForm shapes={shapes} onCreated={refresh} />}
    </div>
  );
}

const TABS = [
  { key: "orders", label: "הזמנות אלבום" },
  { key: "templates", label: "עיצובים" },
  { key: "sizes", label: "מידות ומחירים" },
  { key: "examples", label: "דוגמאות מהדרייב" },
] as const;

function AdminAlbumsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("orders");
  const shapesQ = useQuery({
    queryKey: ["admin-album-shapes"],
    queryFn: async (): Promise<AlbumShapeRow[]> => {
      const { data, error } = await supabase.from("album_shapes").select("*").order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  const shapes = shapesQ.data ?? [];

  return (
    <div dir="rtl" className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-primary flex items-center gap-2">
          <BookHeart className="h-5 w-5" /> אלבומים מותאמים אישית
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          לקוחה בוחרת צורה, מידה, מספר עמודים ועיצוב מוכן, מעלה תמונות ושולחת — ההזמנה מגיעה לכאן.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-amber-100 text-amber-800 px-2.5 py-1">
            העמוד ללקוחות עדיין מוסתר (אין קישור באתר, לא בגוגל)
          </span>
          <a href="/album-builder" target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
            פתיחת העמוד ללקוחות <ExternalLink className="h-3 w-3" />
          </a>
          <button
            className="text-muted-foreground hover:text-primary inline-flex items-center gap-1"
            onClick={() => {
              void navigator.clipboard?.writeText(CUSTOMER_URL);
              toast.success("הקישור הועתק");
            }}
          >
            <Copy className="h-3 w-3" /> העתקת קישור
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-primary/10 pb-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-sm rounded-full px-3.5 py-1.5 ${tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {shapesQ.error && <p className="text-sm text-destructive">{heError(shapesQ.error)}</p>}
      {tab === "orders" && <OrdersTab />}
      {tab === "templates" && <TemplatesTab shapes={shapes} />}
      {tab === "sizes" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            המחירים כאן הם מחירי התחלה מהגרסה הישנה — יש לעבור ולאשר. מחיר = מחיר בסיס (כולל מספר העמודים המינימלי) + מחיר לכל עמוד נוסף.
          </p>
          <SizesEditor shapes={shapes} />
        </div>
      )}
      {tab === "examples" && <ExamplesTab />}
    </div>
  );
}

import { useMemo, useState } from "react";
import { ImagePlus, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toSiteMediaUrl } from "@/lib/media-url";
import galleryFiles from "@/lib/photographer-gallery-files.json";

const GALLERY_BASE = "https://michalsiboni.co.il/images/gallery/";
/** Shrinks a photo to at most 1600px (JPEG) before upload, so a phone photo does not weigh 8 MB in a mail / funnel. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Uploads a photo from the device and returns an absolute address on the site's own domain (works behind NetFree and inside e-mails). */
async function uploadPhoto(file: File): Promise<string> {
  const blob = await shrink(file);
  const path = `pages/funnel-${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("items").upload(path, blob, { upsert: false, contentType: "image/jpeg" });
  if (error) throw error;
  const { data, error: signErr } = await supabase.storage.from("items").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (signErr || !data?.signedUrl) throw signErr ?? new Error("שגיאה ביצירת קישור לתמונה");
  const rel = toSiteMediaUrl(data.signedUrl);
  return rel.startsWith("/") ? `https://sweetbabyphoto.shop${rel}` : rel;
}

const inp = "w-full rounded-lg border bg-white px-3 py-2 text-base";

/** Picker over the photographer site's gallery (or any https image URL). Shared by the funnel editor and the e-mail design page. */
export function GalleryImagePicker({ value, onChange }: { value?: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(48);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const list = useMemo(() => (galleryFiles as string[]).filter((f) => f.toLowerCase().includes(q.toLowerCase())), [q]);
  return (
    <div className="flex items-center gap-2">
      {value ? <img src={value} alt="" className="size-14 rounded-lg border object-cover" /> : <div className="flex size-14 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">ללא</div>}
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
        <ImagePlus className="size-4" /> תמונה
      </button>
      {value && (
        <button type="button" onClick={() => onChange(null)} className="text-xs text-muted-foreground underline">
          הסרה
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 md:items-center" dir="rtl">
          <div className="flex max-h-[88dvh] w-full flex-col rounded-t-2xl bg-background p-4 md:max-w-3xl md:rounded-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg">בחירת תמונה</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="סגירה">
                <X className="size-5" />
              </button>
            </div>
            <label className="mb-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm hover:bg-muted">
              <Upload className="size-4" /> {busy ? "מעלה…" : "העלאת תמונה מהמכשיר"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={busy}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  setBusy(true);
                  setErr("");
                  try {
                    onChange(await uploadPhoto(f));
                    setOpen(false);
                  } catch (x: any) {
                    setErr(x?.message || "ההעלאה נכשלה");
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            {err && <p className="mb-2 text-xs text-red-600">{err}</p>}
            <p className="mb-2 text-xs text-amber-700">רק תמונות של תינוקות וילדים — לא נשים ולא בנות מעל גיל 6.</p>
            <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(48); }} placeholder="חיפוש לפי שם קובץ" className={`${inp} mb-2`} />
            <input
              placeholder="או הדביקי כתובת תמונה (https://…) ולחצי Enter"
              className={`${inp} mb-2`}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = (e.target as HTMLInputElement).value.trim();
                  if (/^https:\/\//.test(v)) { onChange(v); setOpen(false); }
                }
              }}
            />
            <div className="grid flex-1 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-5">
              {list.slice(0, limit).map((f) => (
                <button key={f} type="button" onClick={() => { onChange(GALLERY_BASE + f); setOpen(false); }} className="overflow-hidden rounded-lg border hover:ring-2 hover:ring-primary">
                  <img src={GALLERY_BASE + f} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                </button>
              ))}
              {list.length > limit && (
                <button type="button" onClick={() => setLimit((l) => l + 48)} className="col-span-full rounded-lg border py-2 text-sm">
                  עוד תמונות ({list.length - limit})
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

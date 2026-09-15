import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { applyWatermark } from "@/lib/watermark";
import { toast } from "sonner";
import { ArrowRight, Check, Copy, ImagePlus, Loader2, Mail, Trash2 } from "lucide-react";
import {
  listNewbornOrders,
  listNewbornOrderImages,
  addNewbornOrderImage,
  deleteNewbornOrderImage,
  resendNewbornContract,
} from "@/lib/newborn-orders.functions";
import { findNewbornPackage } from "@/lib/newborn-packages";

// A dedicated gallery-management page per newborn order — its own table
// (newborn_order_images), its own storage prefix, completely separate from
// the general photo_client_images system used elsewhere on the site, per
// explicit request. The client's own view of this same data is the
// unbranded, token-gated /newborn/gallery/$token page — this admin page
// just manages what she sees there.
export const Route = createFileRoute("/_authenticated/admin/newborn-packages/$orderId")({
  component: NewbornOrderGallery,
});

type ImageRow = { id: string; kind: "proof" | "edited"; image_url: string; selected: boolean };

async function uploadToStorage(orderId: string, file: File): Promise<{ url: string; path: string }> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `newborn-orders/${orderId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("items").upload(path, file, { upsert: false });
  if (error) throw error;
  const { data, error: signErr } = await supabase.storage.from("items").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (signErr || !data?.signedUrl) throw signErr ?? new Error("שגיאה בהעלאה");
  return { url: data.signedUrl, path };
}

function UploadSection({
  title,
  hint,
  kind,
  orderId,
  images,
  onChanged,
}: {
  title: string;
  hint: string;
  kind: "proof" | "edited";
  orderId: string;
  images: ImageRow[];
  onChanged: () => void;
}) {
  const addImage = useServerFn(addNewbornOrderImage);
  const removeImage = useServerFn(deleteNewbornOrderImage);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        // Proofs: full resolution + the studio logo watermarked in, so the
        // client sees full quality while choosing. Edited (final delivery)
        // images go through the normal compressed path — same split as the
        // general photo-client system, kept consistent on purpose.
        const prepared = kind === "proof" ? await applyWatermark(file) : await compressImage(file);
        const { url, path } = await uploadToStorage(orderId, prepared);
        await addImage({ data: { orderId, kind, url, storagePath: path } });
      }
      toast.success("התמונות הועלו");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "העלאה נכשלה");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDelete = async (id: string) => {
    try {
      await removeImage({ data: { id } });
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "מחיקה נכשלה");
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-primary/10 p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-lg text-primary">{title}</h3>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        {images.length > 0 && <span className="text-xs text-muted-foreground shrink-0">תמונות ({images.length})</span>}
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onFiles(e.dataTransfer.files);
        }}
        disabled={uploading}
        className={`w-full rounded-xl border-2 border-dashed p-5 flex items-center gap-3 text-right transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-primary/20 hover:border-primary/40"
        }`}
      >
        {uploading ? <Loader2 className="h-5 w-5 shrink-0 text-primary animate-spin" /> : <ImagePlus className="h-5 w-5 shrink-0 text-primary" />}
        <div className="min-w-0">
          <p className="text-sm font-medium">{uploading ? "מעלה..." : "לחצי או גררי תמונות לכאן"}</p>
          <p className="text-xs text-muted-foreground">JPG, PNG, HEIC</p>
        </div>
      </button>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />

      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-2">
          {images.map((img, i) => (
            <div key={img.id} className="relative group aspect-square">
              <img src={img.image_url} alt="" className="w-full h-full object-cover rounded-lg border border-primary/10" />
              <span className="absolute bottom-1 right-1 bg-background/85 text-foreground text-[10px] font-mono px-1.5 py-0.5 rounded">
                {String(i + 1).padStart(3, "0")}
              </span>
              {kind === "proof" && img.selected && (
                <span className="absolute top-1 right-1 rounded-full p-1 bg-primary text-primary-foreground">
                  <Check className="h-3.5 w-3.5" />
                </span>
              )}
              <button
                type="button"
                onClick={() => onDelete(img.id)}
                className="absolute bottom-1 left-1 bg-background/90 rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                aria-label="מחיקה"
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewbornOrderGallery() {
  const { orderId } = Route.useParams();
  const qc = useQueryClient();
  const listImages = useServerFn(listNewbornOrderImages);
  const listOrders = useServerFn(listNewbornOrders);
  const resendContract = useServerFn(resendNewbornContract);
  const [resending, setResending] = useState(false);

  // The order list is already fetched on the main admin page — reused here
  // (same query key) rather than adding a dedicated "get one order" fn.
  const ordersQuery = useQuery({ queryKey: ["newborn-orders"], queryFn: () => listOrders({}) });
  const order = (ordersQuery.data ?? []).find((o: any) => o.id === orderId);

  const imagesQuery = useQuery({
    queryKey: ["newborn-order-images", orderId],
    queryFn: () => listImages({ data: { orderId } }),
  });
  const images = (imagesQuery.data ?? []) as ImageRow[];
  const refresh = () => qc.invalidateQueries({ queryKey: ["newborn-order-images", orderId] });

  const shareUrl = order?.access_token ? `https://sweetbabyphoto.shop/newborn/gallery/${order.access_token}` : null;

  const copyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(
      () => toast.success("הקישור הועתק"),
      () => toast.error("ההעתקה נכשלה"),
    );
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const res = await resendContract({ data: { id: orderId } });
      if (res.ok) toast.success("החוזה נשלח מחדש");
      else toast.error("שליחת החוזה נכשלה");
    } catch (e: any) {
      toast.error(e?.message ?? "שליחת החוזה נכשלה");
    } finally {
      setResending(false);
    }
  };

  if (ordersQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">טוען...</div>;
  }
  if (!order) {
    return <div className="p-6 text-sm text-muted-foreground">ההזמנה לא נמצאה.</div>;
  }

  const pkg = findNewbornPackage(order.package_id);

  return (
    <div dir="rtl" className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link to="/admin/newborn-packages" className="h-9 w-9 rounded-full hover:bg-primary/10 flex items-center justify-center text-primary">
          <ArrowRight className="h-4 w-4" />
        </Link>
        <div>
          <h2 className="font-display text-2xl text-primary">{order.contact_name}</h2>
          <p className="text-sm text-muted-foreground">{pkg?.name ?? order.package_id} · ₪{order.total_price}</p>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-primary/10 p-5 space-y-3">
        <h3 className="font-display text-lg text-primary">קישור אישי ללקוחה</h3>
        <p className="text-xs text-muted-foreground">
          הקישור הזה — ולא כניסה לאתר — הוא מה שהלקוחה משתמשת בו כדי לראות ולבחור תמונות. אין צורך שיהיה לה חשבון.
        </p>
        {shareUrl && (
          <div className="flex flex-wrap items-center gap-2">
            <code dir="ltr" className="text-xs bg-muted rounded-lg px-3 py-2 flex-1 min-w-0 truncate">{shareUrl}</code>
            <button type="button" onClick={copyLink} className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 px-4 h-9 text-sm hover:bg-cream">
              <Copy className="h-3.5 w-3.5" /> העתקה
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
          {order.contract_sent_at ? <span>חוזה נשלח ✓</span> : <span>החוזה עוד לא נשלח</span>}
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 px-3 h-7 hover:bg-cream disabled:opacity-60"
          >
            {resending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />} שליחה מחדש
          </button>
        </div>
        {order.proofs_selected_at && (
          <p className="text-xs text-primary font-medium">היא כבר סיימה לבחור תמונות ✓</p>
        )}
      </div>

      {imagesQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">טוען תמונות...</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          <UploadSection
            title="תמונות לבחירה (עם סימן מים)"
            hint="עולות באיכות מלאה עם לוגו כסימן מים — הלקוחה בוחרת מתוכן."
            kind="proof"
            orderId={orderId}
            images={images.filter((i) => i.kind === "proof")}
            onChanged={refresh}
          />
          <UploadSection
            title="תמונות מעובדות (איכות סופית)"
            hint="ברגע שיש כאן תמונות, הלקוחה רואה אותן במקום תמונות הבחירה."
            kind="edited"
            orderId={orderId}
            images={images.filter((i) => i.kind === "edited")}
            onChanged={refresh}
          />
        </div>
      )}
    </div>
  );
}

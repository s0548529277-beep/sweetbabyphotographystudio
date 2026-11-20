import { useState } from "react";
import { toSiteMediaUrl } from "@/lib/media-url";

/**
 * One file inside a WhatsApp conversation (admin /admin/whatsapp). Photos open large, videos play, voice notes and
 * audio play, PDFs and text files preview inside the page; every other type (Word, Excel, PowerPoint, ZIP...) shows a
 * card with its name and a download button. Files are served through the site's own /media proxy (NetFree-friendly).
 */
export type WhatsAppMediaProps = {
  url: string;
  type: "image" | "video" | "document" | "audio";
  filename: string | null;
  mime: string | null;
};

const PREVIEWABLE_DOC = /^(application\/pdf|text\/(plain|csv|html|xml)|application\/json)$/;

function extOf(name: string | null, url: string): string {
  const src = (name ?? url.split("?")[0]).toLowerCase();
  return src.match(/\.([a-z0-9]{1,8})$/)?.[1] ?? "";
}

function docIcon(ext: string): string {
  if (ext === "pdf") return "📕";
  if (["doc", "docx", "odt", "rtf", "txt"].includes(ext)) return "📝";
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return "📊";
  if (["ppt", "pptx"].includes(ext)) return "📽️";
  if (["zip", "rar", "7z"].includes(ext)) return "🗜️";
  if (ext === "vcf") return "👤";
  return "📎";
}

export function WhatsAppMedia({ url, type, filename, mime }: WhatsAppMediaProps) {
  const [open, setOpen] = useState(false);
  const src = toSiteMediaUrl(url);

  if (type === "image") {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" className="block mb-1" title="פתיחת התמונה בגודל מלא">
        <img src={src} alt={filename ?? ""} className="rounded-xl max-h-64 object-cover" />
      </a>
    );
  }
  if (type === "video") return <video src={src} controls preload="metadata" className="rounded-xl mb-1 max-h-64" />;
  if (type === "audio") {
    return (
      <div className="mb-1">
        <audio src={src} controls preload="metadata" className="max-w-full" />
        <a href={src} download={filename ?? undefined} className="block text-[11px] underline mt-0.5">
          הורדת ההקלטה
        </a>
      </div>
    );
  }

  const ext = extOf(filename, url);
  const name = filename || `קובץ${ext ? `.${ext}` : ""}`;
  const canPreview = !!mime && PREVIEWABLE_DOC.test(mime);
  return (
    <div className="mb-1 rounded-xl border border-current/15 bg-white/40 p-2.5 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-xl leading-none">{docIcon(ext)}</span>
        <span className="font-medium break-all" dir="auto">
          {name}
        </span>
      </div>
      <div className="flex flex-wrap gap-3 mt-1.5 text-xs">
        {canPreview && (
          <button type="button" className="underline" onClick={() => setOpen((v) => !v)}>
            {open ? "הסתרת התצוגה" : "צפייה כאן"}
          </button>
        )}
        <a href={src} target="_blank" rel="noopener noreferrer" className="underline">
          פתיחה בלשונית חדשה
        </a>
        <a href={src} download={name} className="underline">
          הורדה
        </a>
      </div>
      {open && canPreview && <iframe src={src} title={name} className="mt-2 w-full h-80 rounded-lg bg-white" />}
    </div>
  );
}

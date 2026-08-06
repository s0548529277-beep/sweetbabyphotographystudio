import { useState } from "react";
import { X, PlayCircle, FileText } from "lucide-react";
import guideVideo from "@/assets/studio-guide.mp4.asset.json";
import guidePdf from "@/assets/studio-guide.pdf.asset.json";

/** "הדרכה לשימוש בסטודיו" — short video + the full presentation, inside the site. */
export function StudioGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"video" | "deck">("video");
  if (!open) return null;
  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl h-[88vh] bg-[#f8ede4] rounded-3xl overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 h-14 border-b border-[#2d3d2b]/10 bg-[#fdf7f1]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTab("video")}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 h-9 text-xs font-semibold transition-colors ${
                tab === "video" ? "bg-[#2d3d2b] text-[#f8ede4]" : "text-[#2d3d2b] hover:bg-[#2d3d2b]/10"
              }`}
            >
              <PlayCircle className="h-4 w-4" /> סרטון הדרכה
            </button>
            <button
              type="button"
              onClick={() => setTab("deck")}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 h-9 text-xs font-semibold transition-colors ${
                tab === "deck" ? "bg-[#2d3d2b] text-[#f8ede4]" : "text-[#2d3d2b] hover:bg-[#2d3d2b]/10"
              }`}
            >
              <FileText className="h-4 w-4" /> המצגת המלאה
            </button>
          </div>
          <button
            type="button"
            aria-label="סגירה"
            onClick={onClose}
            className="h-8 w-8 rounded-full hover:bg-[#2d3d2b]/10 flex items-center justify-center text-[#2d3d2b]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {tab === "video" ? (
          <div className="flex-1 bg-black flex items-center justify-center">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video src={guideVideo.url} controls autoPlay playsInline className="max-h-full max-w-full" />
          </div>
        ) : (
          <iframe src={guidePdf.url} title="מצגת הדרכה לסטודיו" className="flex-1 w-full border-0 bg-white" />
        )}
      </div>
    </div>
  );
}

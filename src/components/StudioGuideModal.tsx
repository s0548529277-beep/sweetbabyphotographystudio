import { useState } from "react";
import { X, PlayCircle, Images, ChevronRight, ChevronLeft } from "lucide-react";
import guideVideo from "@/assets/studio-guide.mp4.asset.json";
import s1 from "@/assets/guide-slide-1.jpg.asset.json";
import s2 from "@/assets/guide-slide-2.jpg.asset.json";
import s3 from "@/assets/guide-slide-3.jpg.asset.json";
import s4 from "@/assets/guide-slide-4.jpg.asset.json";
import s5 from "@/assets/guide-slide-5.jpg.asset.json";
import s6 from "@/assets/guide-slide-6.jpg.asset.json";
import s7 from "@/assets/guide-slide-7.jpg.asset.json";
import s8 from "@/assets/guide-slide-8.jpg.asset.json";
import s9 from "@/assets/guide-slide-9.jpg.asset.json";

const slides = [s1, s2, s3, s4, s5, s6, s7, s8, s9].map((s) => s.url);

/** "הדרכה לשימוש בסטודיו" — סרטון מונפש או מצגת שעוברת תמונה-תמונה, בתוך האתר. */
export function StudioGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"video" | "deck">("video");
  const [idx, setIdx] = useState(0);
  if (!open) return null;

  const tabCls = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full px-4 h-9 text-xs font-semibold transition-colors ${
      active ? "bg-[#2d3d2b] text-[#f8ede4]" : "text-[#2d3d2b] hover:bg-[#2d3d2b]/10"
    }`;

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
            <button type="button" onClick={() => setTab("video")} className={tabCls(tab === "video")}>
              <PlayCircle className="h-4 w-4" /> סרטון הדרכה
            </button>
            <button type="button" onClick={() => setTab("deck")} className={tabCls(tab === "deck")}>
              <Images className="h-4 w-4" /> מצגת בתמונות
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
          <div className="flex-1 flex flex-col bg-[#f8ede4] p-4 gap-3 min-h-0">
            <div className="flex-1 min-h-0 flex items-center justify-center">
              <img
                key={idx}
                src={slides[idx]}
                alt={`שקופית ${idx + 1} מתוך ${slides.length}`}
                className="max-h-full max-w-full object-contain rounded-2xl shadow-lg animate-fade-in"
              />
            </div>
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                aria-label="הקודם"
                onClick={() => setIdx((i) => (i - 1 + slides.length) % slides.length)}
                className="h-10 w-10 rounded-full bg-white text-[#2d3d2b] flex items-center justify-center shadow hover:bg-[#f5d5cf]"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-1.5">
                {slides.map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    aria-label={`שקופית ${i + 1}`}
                    onClick={() => setIdx(i)}
                    className={`h-2.5 rounded-full transition-all ${i === idx ? "w-6 bg-[#2d3d2b]" : "w-2.5 bg-[#2d3d2b]/25"}`}
                  />
                ))}
              </div>
              <button
                type="button"
                aria-label="הבא"
                onClick={() => setIdx((i) => (i + 1) % slides.length)}
                className="h-10 w-10 rounded-full bg-white text-[#2d3d2b] flex items-center justify-center shadow hover:bg-[#f5d5cf]"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

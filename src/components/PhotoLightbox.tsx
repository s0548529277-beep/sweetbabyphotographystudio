// Shared full-screen photo viewer — used by every client-facing photo
// gallery in the app (my-photos.tsx for the main photo_client_* flow,
// newborn.gallery.$token.tsx for the separate newborn-package flow), per
// explicit request that zooming in be available everywhere. Click/tap the
// image to toggle between fit-to-screen and a larger (pannable, via native
// scroll) zoomed view; arrow buttons, swipe, and the keyboard arrows move
// between photos. `renderActions` lets each caller add its own bottom-bar
// button (favorite/remove, or download) without this component knowing
// about selection or downloads itself.
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export function PhotoLightbox({
  images,
  startIndex,
  onClose,
  renderActions,
}: {
  images: { id: string; url: string }[];
  startIndex: number;
  onClose: () => void;
  renderActions?: (img: { id: string; url: string }, index: number) => React.ReactNode;
}) {
  const [index, setIndex] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const go = (delta: number) => {
    setIndex((i) => Math.max(0, Math.min(images.length - 1, i + delta)));
    setZoomed(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length]);

  useEffect(() => {
    if (index >= images.length) setIndex(Math.max(0, images.length - 1));
  }, [images.length, index]);

  const img = images[index];
  if (!img) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(dx) > 50) go(dx > 0 ? -1 : 1);
        touchStartX.current = null;
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white/90 text-sm shrink-0">
        <span dir="ltr">
          {index + 1} / {images.length}
        </span>
        <button type="button" onClick={onClose} className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center" aria-label="סגירה">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex-1 overflow-auto flex items-center justify-center" onClick={() => setZoomed((z) => !z)}>
        {index > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center z-10"
            aria-label="התמונה הקודמת"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {index < images.length - 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center z-10"
            aria-label="התמונה הבאה"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
        <img
          src={img.url}
          alt=""
          className={zoomed ? "cursor-zoom-out" : "max-w-full max-h-[75vh] object-contain cursor-zoom-in"}
          style={zoomed ? { width: "200%", maxWidth: "none" } : undefined}
        />
      </div>

      {renderActions && <div className="px-4 py-3 flex items-center justify-center gap-3 shrink-0">{renderActions(img, index)}</div>}
      <p className="text-center text-[11px] text-white/50 pb-2 shrink-0">הקישי על התמונה להגדלה</p>
    </div>
  );
}

/** The opt-in "smart" guided-selection flow's 2-step indicator — browse (free selection) then narrow (down to the limit). Shared by both client galleries, shown only when the admin turned guided mode on for that client/order. */
export function GuidedStepper({ phase }: { phase: "browse" | "narrow" }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium ${phase === "browse" ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
        <span className="h-4 w-4 rounded-full bg-white/25 flex items-center justify-center text-[10px]">1</span> בחירה חופשית
      </span>
      <div className="h-px w-4 bg-primary/30" />
      <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium ${phase === "narrow" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
        <span className="h-4 w-4 rounded-full bg-white/25 flex items-center justify-center text-[10px]">2</span> צמצום לכמות הנכונה
      </span>
    </div>
  );
}

import { useState } from "react";
import { Sparkles, X } from "lucide-react";

type Props = {
  images: string[];
  title?: string;
  subtitle?: string;
};

export function InspirationStrip({ images, title = "השראה מהצילומים", subtitle }: Props) {
  const [zoom, setZoom] = useState<string | null>(null);
  if (!images || images.length === 0) return null;

  return (
    <section dir="rtl" className="mt-10">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-[#b98a7a]" />
        <h2 className="font-display text-xl md:text-2xl">{title}</h2>
      </div>
      {subtitle && <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {images.map((src, i) => (
          <button
            key={src + i}
            type="button"
            onClick={() => setZoom(src)}
            className="group relative aspect-square overflow-hidden rounded-2xl border border-black/5 bg-[#efe6df] focus:outline-none focus:ring-2 focus:ring-[#f3c9bd]"
            aria-label={`הגדל השראה ${i + 1}`}
          >
            <img
              src={src}
              alt={`${title} ${i + 1}`}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </button>
        ))}
      </div>

      {zoom && (
        <div
          className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setZoom(null)}
          role="dialog"
        >
          <button
            onClick={() => setZoom(null)}
            className="absolute top-4 left-4 h-10 w-10 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center"
            aria-label="סגור"
          >
            <X className="h-5 w-5" />
          </button>
          <img src={zoom} alt="השראה" className="max-h-[90vh] max-w-[95vw] object-contain rounded-2xl" />
        </div>
      )}
    </section>
  );
}

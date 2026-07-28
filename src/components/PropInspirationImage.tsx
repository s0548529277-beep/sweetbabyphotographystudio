import { useState } from "react";
import { Camera } from "lucide-react";

type Props = {
  src: string;
  alt: string;
  shots: string[];
  className?: string;
  grayscale?: boolean;
};

/**
 * Prop photo that reveals a real session photo taken with the prop
 * on hover (desktop) or tap (mobile). Tapping again cycles the photos.
 */
export function PropInspirationImage({ src, alt, shots, className = "", grayscale }: Props) {
  const [idx, setIdx] = useState<number | null>(null);
  const [hover, setHover] = useState(false);
  const has = shots.length > 0;
  const active = has && (hover || idx !== null);
  const current = active ? shots[(idx ?? 0) % shots.length] : src;

  const next = () => setIdx((i) => (i === null ? 0 : (i + 1) % shots.length));

  return (
    <div className="relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <img
        src={current}
        alt={active ? `${alt} – צולם עם האביזר` : alt}
        loading="lazy"
        className={className + (grayscale ? " grayscale" : "")}
      />
      {has && (
        <>
          <span className="absolute bottom-2 left-2 z-10 inline-flex items-center gap-1 bg-black/55 text-white text-[10px] px-2 py-1 rounded-full pointer-events-none">
            <Camera className="h-3 w-3" />
            {active ? "צולם עם האביזר" : `${shots.length} תמונות מהצילומים`}
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              next();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                e.preventDefault();
                next();
              }
            }}
            className="absolute inset-0 z-10 cursor-pointer"
            aria-label="הצגת תמונה שצולמה עם האביזר"
          />
        </>
      )}
    </div>
  );
}

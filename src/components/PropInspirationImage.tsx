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
 * on hover (desktop) or tap (mobile).
 */
export function PropInspirationImage({ src, alt, shots, className = "", grayscale }: Props) {
  const [idx, setIdx] = useState(0);
  const [hover, setHover] = useState(false);
  const has = shots.length > 0;
  const shown = has && (hover || idx > 0) ? shots[Math.max(0, idx - (hover && idx === 0 ? 0 : 1)) % shots.length] : src;
  const active = has && (hover || idx > 0);

  return (
    <div
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <img
        src={active ? shots[idx % shots.length] : src}
        alt={active ? `${alt} – צולם עם האביזר` : alt}
        loading="lazy"
        className={className + (grayscale ? " grayscale" : "")}
      />
      {has && (
        <>
          <span className="absolute bottom-2 left-2 z-10 inline-flex items-center gap-1 bg-black/55 text-white text-[10px] px-2 py-1 rounded-full pointer-events-none">
            <Camera className="h-3 w-3" /> {active ? "צולם עם האביזר" : `${shots.length} תמונות מהצילומים`}
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setIdx((i) => (i + 1) % shots.length);
              setHover(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                e.preventDefault();
                setIdx((i) => (i + 1) % shots.length);
              }
            }}
            className="absolute inset-0 z-10 cursor-pointer"
            aria-label="הצגת תמונה שצולמה עם האביזר"
          />
        </>
      )}
      {shown === null && null}
    </div>
  );
}

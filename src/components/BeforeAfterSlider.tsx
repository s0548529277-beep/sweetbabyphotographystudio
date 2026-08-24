import { useState } from "react";

/**
 * Drag-to-reveal before/after image compare. "before" sits on the right and
 * "after" on the left, matching RTL reading order — purely a visual choice,
 * the clip-path math below uses physical (not logical) sides throughout so
 * it isn't affected by page `dir`.
 */
export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = "לפני",
  afterLabel = "אחרי",
  aspectRatio = "4 / 5",
  className = "",
}: {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  aspectRatio?: string;
  className?: string;
}) {
  const [pos, setPos] = useState(50);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl border border-primary/10 bg-muted select-none ${className}`}
      style={{ aspectRatio }}
    >
      <img
        src={afterSrc}
        alt={afterLabel}
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 0 0 ${100 - pos}%)` }}
      >
        <img
          src={beforeSrc}
          alt={beforeLabel}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      </div>

      <div className="pointer-events-none absolute inset-y-0" style={{ right: `${pos}%` }}>
        <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)]" />
        <div className="absolute top-1/2 h-8 w-8 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white shadow-md" />
      </div>

      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="השוואת לפני ואחרי"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />

      <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/50 px-2 py-1 text-[10px] uppercase tracking-widest text-white">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-black/50 px-2 py-1 text-[10px] uppercase tracking-widest text-white">
        {afterLabel}
      </span>
    </div>
  );
}

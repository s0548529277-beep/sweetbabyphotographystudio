// The actual card — one SVG element used for BOTH the live editable preview
// AND the exported PNG (collage-maker.tsx grabs this exact element via a
// ref, serializes it, and rasterizes it — see downloadCollagePng there,
// which reads the real pixel size straight off the SVG's own viewBox).
// Photos are embedded as data: URLs (never uploaded anywhere) so the same
// markup works standalone once serialized, with no external image loads to
// wait on or fail.
//
// Card pixel size (cardW/cardH) is a PROP, not a fixed constant — the
// format/size picker (portrait / landscape / panoramic, then a real print
// ratio like 13×18) changes it per render. All internal geometry (margin,
// gap, photo-area height, caption placement/size) is derived as a fraction
// of cardW/cardH rather than hardcoded, so every format renders correctly
// proportioned instead of just stretching a portrait layout.
import {
  findCollageStyle,
  getLayoutVariants,
  shapeClipPath,
  PHOTO_EFFECTS,
  type CollageStyleId,
  type PhotoShapeId,
  type PhotoEffectId,
  type SlotRect,
  type DecorThemeId,
} from "@/lib/collage-data";

function scaleRect(r: SlotRect, areaX: number, areaY: number, areaW: number, areaH: number, gap: number) {
  return {
    x: areaX + r.x * areaW + gap / 2,
    y: areaY + r.y * areaH + gap / 2,
    w: r.w * areaW - gap,
    h: r.h * areaH - gap,
    rotation: r.rotation ?? 0,
  };
}

/**
 * Small themed sticker sets, one per occasion the user explicitly asked
 * for (birthday-1 / newborn / chalaka) — rendered as a corner flourish in
 * the card's own accent color so it matches whatever palette (style
 * default or override) is active. An independent toggle, not tied to
 * having picked that occasion preset. Deliberately light: a few simple
 * shapes, not a full sticker library. Sized for a ~1000px-wide card;
 * fine as-is across formats since it's a small fixed corner flourish, not
 * something that needs to scale with the whole card.
 */
function OccasionDecor({ theme, accent, cardW }: { theme: DecorThemeId; accent: string; cardW: number }) {
  if (theme === "birthday1") {
    return (
      <g opacity={0.9}>
        <g transform={`translate(${cardW - 78}, 18)`}>
          <ellipse cx={0} cy={0} rx={16} ry={20} fill={accent} opacity={0.85} />
          <path d="M0,20 L-4,26 L4,26 Z" fill={accent} opacity={0.85} />
          <line x1={0} y1={26} x2={-6} y2={70} stroke={accent} strokeWidth={1.5} opacity={0.6} />
        </g>
        <g transform={`translate(${cardW - 118}, 40)`}>
          <ellipse cx={0} cy={0} rx={12} ry={15} fill={accent} opacity={0.6} />
          <path d="M0,15 L-3,20 L3,20 Z" fill={accent} opacity={0.6} />
          <line x1={0} y1={20} x2={4} y2={55} stroke={accent} strokeWidth={1.2} opacity={0.5} />
        </g>
        {Array.from({ length: 6 }, (_, i) => (
          <circle key={i} cx={24 + (i % 3) * 16} cy={16 + Math.floor(i / 3) * 16} r={i % 2 ? 3 : 4.5} fill={accent} opacity={0.5} />
        ))}
      </g>
    );
  }
  if (theme === "newborn") {
    return (
      <g opacity={0.85}>
        <path d="M40,14 A14,14 0 1 0 40,42 A11,11 0 1 1 40,14 Z" fill={accent} opacity={0.6} />
        <circle cx={80} cy={24} r={2.5} fill={accent} opacity={0.5} />
        <circle cx={96} cy={40} r={3.5} fill={accent} opacity={0.4} />
        <circle cx={70} cy={50} r={2} fill={accent} opacity={0.5} />
      </g>
    );
  }
  if (theme === "chalaka") {
    return (
      <g opacity={0.85} stroke={accent} strokeWidth={2.5} fill="none" strokeLinecap="round">
        <g transform={`translate(${cardW - 90}, 22)`}>
          <circle cx={2} cy={2} r={5} />
          <circle cx={2} cy={22} r={5} />
          <line x1={6} y1={6} x2={30} y2={26} />
          <line x1={6} y1={18} x2={30} y2={-2} />
        </g>
      </g>
    );
  }
  return null;
}

export function CollageCard({
  svgRef,
  cardW,
  cardH,
  styleId,
  photos,
  layoutId = "featured",
  shape = "rect",
  effect = "none",
  frame = false,
  borderStyle = "none",
  captionPlacement = "below",
  paletteOverride,
  decorId = "none",
  onSlotClick,
  caption,
  subtitle,
}: {
  svgRef?: React.RefObject<SVGSVGElement | null>;
  /** Card pixel size — from the format/size picker (see getCardDimensions in collage-data.ts). */
  cardW: number;
  cardH: number;
  styleId: CollageStyleId;
  photos: (string | null)[];
  layoutId?: string;
  shape?: PhotoShapeId;
  effect?: PhotoEffectId;
  frame?: boolean;
  /** "polaroid": a thick white border (in the slot's own shape) around each photo, like a printed/stacked photo — independent of the thin colored `frame` outline above. */
  borderStyle?: "none" | "polaroid";
  /** "overlay": caption/subtitle sit directly on the photo area (bottom-anchored, white text + shadow) instead of in the band below it. */
  captionPlacement?: "below" | "overlay";
  /** Overrides the style's own bg/accent/captionColor — from a color-palette preset, the eyedropper, or auto photo-match. Missing keys fall back to the style's default. */
  paletteOverride?: { bg?: string; accent?: string; captionColor?: string } | null;
  decorId?: DecorThemeId;
  onSlotClick?: (index: number) => void;
  caption: string;
  subtitle: string;
}) {
  const style = findCollageStyle(styleId);
  const bg = paletteOverride?.bg ?? style.bg;
  const accent = paletteOverride?.accent ?? style.accent;
  const captionColor = paletteOverride?.captionColor ?? style.captionColor;
  const polaroid = borderStyle === "polaroid";
  const overlayCaption = captionPlacement === "overlay";

  // All geometry below is a fraction of the actual card size, not a fixed
  // pixel constant — the same ratios that used to be hardcoded for the one
  // 1000×1250 portrait card, now computed per format/size.
  const shortSide = Math.min(cardW, cardH);
  const MARGIN = Math.round(shortSide * 0.05);
  const GAP = Math.max(4, Math.round(shortSide * 0.01));
  // Overlay mode needs no reserved band below the photos — the caption
  // sits on the photo itself, so the photo area gets that space instead.
  const captionAreaH = Math.round(cardH * (overlayCaption ? 0.04 : 0.16));
  const PHOTO_H = Math.max(1, cardH - MARGIN * 2 - captionAreaH);
  const CAPTION_TOP = MARGIN + PHOTO_H + Math.round(cardH * 0.024);
  const captionFontSize = Math.round(cardH * 0.0512);
  const subtitleFontSize = Math.round(cardH * 0.024);
  const overlayBottomPad = Math.round(cardH * 0.03);
  const captionY = overlayCaption
    ? MARGIN + PHOTO_H - overlayBottomPad - (subtitle ? subtitleFontSize * 1.6 : 0)
    : CAPTION_TOP + captionFontSize * 1.05;
  const subtitleY = overlayCaption ? MARGIN + PHOTO_H - overlayBottomPad : captionY + subtitleFontSize * 2.2;
  const frameInset = Math.round(MARGIN * 0.28);

  const variants = getLayoutVariants(photos.length);
  const layout = variants.find((v) => v.id === layoutId) ?? variants[0];
  const slots = layout.rects.map((r) => scaleRect(r, MARGIN, MARGIN, cardW - MARGIN * 2, PHOTO_H, GAP));
  const cssFilter = PHOTO_EFFECTS.find((e) => e.id === effect)?.cssFilter || undefined;

  // The polaroid border insets the actual photo inside its slot, leaving a
  // white margin in the slot's own shape (rect/circle/heart/…) around it —
  // same shapeClipPath fn as everything else, just called on a smaller rect.
  const photoRectFor = (rect: { x: number; y: number; w: number; h: number }) => {
    if (!polaroid) return rect;
    const m = Math.max(6, Math.round(Math.min(rect.w, rect.h) * 0.06));
    return { x: rect.x + m, y: rect.y + m, w: rect.w - m * 2, h: rect.h - m * 2 };
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${cardW} ${cardH}`}
      width="100%"
      className="rounded-2xl shadow-lg"
      style={{ background: bg }}
    >
      <defs>
        {slots.map((rect, i) => {
          const d = shapeClipPath(shape, photoRectFor(rect));
          if (!d) return null;
          return (
            <clipPath key={i} id={`collage-clip-${i}`}>
              <path d={d} />
            </clipPath>
          );
        })}
      </defs>

      <rect x={0} y={0} width={cardW} height={cardH} fill={bg} />

      {style.decorative && (
        <rect
          x={MARGIN - frameInset}
          y={MARGIN - frameInset}
          width={cardW - (MARGIN - frameInset) * 2}
          height={PHOTO_H + frameInset * 2}
          fill="none"
          stroke={accent}
          strokeWidth={1.5}
          opacity={0.5}
        />
      )}

      {slots.map((rect, i) => {
        const photo = photos[i];
        const photoRect = photoRectFor(rect);
        const clipD = shapeClipPath(shape, photoRect);
        const clipId = clipD ? `collage-clip-${i}` : undefined;
        // Rotation (scatter layout) and/or the polaroid border both get a
        // soft drop-shadow — either sells the "real printed photo" depth;
        // flat, borderless slots stay shadow-free.
        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2;
        const rotate = rect.rotation ? `rotate(${rect.rotation} ${cx} ${cy})` : undefined;
        const outerD = polaroid ? shapeClipPath(shape, rect) : null;
        return (
          <g key={i} transform={rotate} style={rect.rotation || polaroid ? { filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.28))" } : undefined}>
            {polaroid &&
              (outerD ? <path d={outerD} fill="#ffffff" /> : <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="#ffffff" />)}
            <g clipPath={clipId ? `url(#${clipId})` : undefined}>
              {photo ? (
                <image
                  href={photo}
                  x={photoRect.x}
                  y={photoRect.y}
                  width={photoRect.w}
                  height={photoRect.h}
                  preserveAspectRatio="xMidYMid slice"
                  style={cssFilter ? { filter: cssFilter } : undefined}
                />
              ) : (
                <rect x={photoRect.x} y={photoRect.y} width={photoRect.w} height={photoRect.h} fill={style.id === "minimal" && !paletteOverride?.accent ? "#f2f2f2" : `${accent}22`} />
              )}
              {!photo &&
                (() => {
                  // A plain SVG "+" (two lines), not a <foreignObject>+HTML
                  // icon — Chromium taints the whole export canvas the
                  // moment an SVG-to-canvas rasterization contains ANY
                  // foreignObject, even same-origin, unfilled content. That
                  // silently broke downloading any collage with an empty
                  // slot; plain SVG shapes have no such restriction.
                  const pcx = photoRect.x + photoRect.w / 2;
                  const pcy = photoRect.y + photoRect.h / 2;
                  const half = Math.min(20, photoRect.w * 0.125, photoRect.h * 0.125);
                  return (
                    <g opacity={0.4} stroke={accent} strokeWidth={3} strokeLinecap="round">
                      <line x1={pcx - half} y1={pcy} x2={pcx + half} y2={pcy} />
                      <line x1={pcx} y1={pcy - half} x2={pcx} y2={pcy + half} />
                    </g>
                  );
                })()}
            </g>
          </g>
        );
      })}

      {/* Frame outlines + click overlays live OUTSIDE the clipped <g> above — an outline needs to trace the shape's own edge, not be clipped by it, and a click target must stay full-size even inside a circle/arch slot. Same rotation as the photo's own group above, so both stay aligned on scattered/tilted slots. */}
      {slots.map((rect, i) => {
        const clipD = shapeClipPath(shape, rect);
        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2;
        const rotate = rect.rotation ? `rotate(${rect.rotation} ${cx} ${cy})` : undefined;
        return (
          <g key={`overlay-${i}`} transform={rotate}>
            {frame &&
              (clipD ? (
                <path d={clipD} fill="none" stroke={accent} strokeWidth={3} />
              ) : (
                <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="none" stroke={accent} strokeWidth={3} />
              ))}
            {onSlotClick && (
              <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="transparent" className="cursor-pointer" onClick={() => onSlotClick(i)} />
            )}
          </g>
        );
      })}

      <OccasionDecor theme={decorId} accent={accent} cardW={cardW} />

      <text
        x={cardW / 2}
        y={captionY}
        textAnchor="middle"
        fontSize={captionFontSize}
        fontFamily={style.fontFamily}
        fill={overlayCaption ? "#ffffff" : captionColor}
        style={overlayCaption ? { filter: "drop-shadow(0 2px 5px rgba(0,0,0,0.65))" } : undefined}
      >
        {caption || " "}
      </text>
      {subtitle && (
        <text
          x={cardW / 2}
          y={subtitleY}
          textAnchor="middle"
          fontSize={subtitleFontSize}
          fontFamily={style.fontFamily}
          fill={overlayCaption ? "#ffffff" : captionColor}
          opacity={overlayCaption ? 0.95 : 0.85}
          style={overlayCaption ? { filter: "drop-shadow(0 2px 5px rgba(0,0,0,0.65))" } : undefined}
        >
          {subtitle}
        </text>
      )}
    </svg>
  );
}

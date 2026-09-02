// The actual card — one SVG element used for BOTH the live editable preview
// AND the exported PNG (collage-maker.tsx grabs this exact element via a
// ref, serializes it, and rasterizes it — see downloadCollagePng there).
// Photos are embedded as data: URLs (never uploaded anywhere) so the same
// markup works standalone once serialized, with no external image loads to
// wait on or fail.
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

export const CARD_W = 1000;
export const CARD_H = 1250;
const MARGIN = 50;
const PHOTO_H = 780;
const GAP = 10;
const CAPTION_TOP = MARGIN + PHOTO_H + 30;

function scaleRect(r: SlotRect, areaX: number, areaY: number, areaW: number, areaH: number) {
  return {
    x: areaX + r.x * areaW + GAP / 2,
    y: areaY + r.y * areaH + GAP / 2,
    w: r.w * areaW - GAP,
    h: r.h * areaH - GAP,
  };
}

/**
 * Small themed sticker sets, one per occasion the user explicitly asked
 * for (birthday-1 / newborn / chalaka) — rendered as a corner flourish in
 * the card's own accent color so it matches whatever palette (style
 * default or override) is active. An independent toggle, not tied to
 * having picked that occasion preset. Deliberately light: a few simple
 * shapes, not a full sticker library.
 */
function OccasionDecor({ theme, accent }: { theme: DecorThemeId; accent: string }) {
  if (theme === "birthday1") {
    return (
      <g opacity={0.9}>
        <g transform={`translate(${CARD_W - 78}, 18)`}>
          <ellipse cx={0} cy={0} rx={16} ry={20} fill={accent} opacity={0.85} />
          <path d="M0,20 L-4,26 L4,26 Z" fill={accent} opacity={0.85} />
          <line x1={0} y1={26} x2={-6} y2={70} stroke={accent} strokeWidth={1.5} opacity={0.6} />
        </g>
        <g transform={`translate(${CARD_W - 118}, 40)`}>
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
        <g transform={`translate(${CARD_W - 90}, 22)`}>
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
  styleId,
  photos,
  layoutId = "featured",
  shape = "rect",
  effect = "none",
  frame = false,
  paletteOverride,
  decorId = "none",
  onSlotClick,
  caption,
  subtitle,
}: {
  svgRef?: React.RefObject<SVGSVGElement | null>;
  styleId: CollageStyleId;
  photos: (string | null)[];
  layoutId?: string;
  shape?: PhotoShapeId;
  effect?: PhotoEffectId;
  frame?: boolean;
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
  const variants = getLayoutVariants(photos.length);
  const layout = variants.find((v) => v.id === layoutId) ?? variants[0];
  const slots = layout.rects.map((r) => scaleRect(r, MARGIN, MARGIN, CARD_W - MARGIN * 2, PHOTO_H));
  const cssFilter = PHOTO_EFFECTS.find((e) => e.id === effect)?.cssFilter || undefined;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${CARD_W} ${CARD_H}`}
      width="100%"
      className="rounded-2xl shadow-lg"
      style={{ background: bg }}
    >
      <defs>
        {slots.map((rect, i) => {
          const d = shapeClipPath(shape, rect);
          if (!d) return null;
          return (
            <clipPath key={i} id={`collage-clip-${i}`}>
              <path d={d} />
            </clipPath>
          );
        })}
      </defs>

      <rect x={0} y={0} width={CARD_W} height={CARD_H} fill={bg} />

      {style.decorative && (
        <rect
          x={MARGIN - 14}
          y={MARGIN - 14}
          width={CARD_W - (MARGIN - 14) * 2}
          height={PHOTO_H + 28}
          fill="none"
          stroke={accent}
          strokeWidth={1.5}
          opacity={0.5}
        />
      )}

      {slots.map((rect, i) => {
        const photo = photos[i];
        const clipD = shapeClipPath(shape, rect);
        const clipId = clipD ? `collage-clip-${i}` : undefined;
        return (
          <g key={i} clipPath={clipId ? `url(#${clipId})` : undefined}>
            {photo ? (
              <image
                href={photo}
                x={rect.x}
                y={rect.y}
                width={rect.w}
                height={rect.h}
                preserveAspectRatio="xMidYMid slice"
                style={cssFilter ? { filter: cssFilter } : undefined}
              />
            ) : (
              <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill={style.id === "minimal" && !paletteOverride?.accent ? "#f2f2f2" : `${accent}22`} />
            )}
            {!photo &&
              (() => {
                // A plain SVG "+" (two lines), not a <foreignObject>+HTML
                // icon — Chromium taints the whole export canvas the
                // moment an SVG-to-canvas rasterization contains ANY
                // foreignObject, even same-origin, unfilled content. That
                // silently broke downloading any collage with an empty
                // slot; plain SVG shapes have no such restriction.
                const cx = rect.x + rect.w / 2;
                const cy = rect.y + rect.h / 2;
                const half = Math.min(20, rect.w * 0.125, rect.h * 0.125);
                return (
                  <g opacity={0.4} stroke={accent} strokeWidth={3} strokeLinecap="round">
                    <line x1={cx - half} y1={cy} x2={cx + half} y2={cy} />
                    <line x1={cx} y1={cy - half} x2={cx} y2={cy + half} />
                  </g>
                );
              })()}
          </g>
        );
      })}

      {/* Frame outlines + click overlays live OUTSIDE the clipped <g> above — an outline needs to trace the shape's own edge, not be clipped by it, and a click target must stay full-size even inside a circle/arch slot. */}
      {slots.map((rect, i) => {
        const clipD = shapeClipPath(shape, rect);
        return (
          <g key={`overlay-${i}`}>
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

      <OccasionDecor theme={decorId} accent={accent} />

      <text x={CARD_W / 2} y={CAPTION_TOP + 90} textAnchor="middle" fontSize={64} fontFamily={style.fontFamily} fill={captionColor}>
        {caption || " "}
      </text>
      {subtitle && (
        <text x={CARD_W / 2} y={CAPTION_TOP + 150} textAnchor="middle" fontSize={30} fontFamily={style.fontFamily} fill={captionColor} opacity={0.85}>
          {subtitle}
        </text>
      )}
    </svg>
  );
}

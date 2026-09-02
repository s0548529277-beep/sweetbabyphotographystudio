// The actual card — one SVG element used for BOTH the live editable preview
// AND the exported PNG (collage-maker.tsx grabs this exact element via a
// ref, serializes it, and rasterizes it — see downloadCollagePng there).
// Photos are embedded as data: URLs (never uploaded anywhere) so the same
// markup works standalone once serialized, with no external image loads to
// wait on or fail.
import { findCollageStyle, layoutForCount, type CollageStyleId, type SlotRect } from "@/lib/collage-data";
import { Plus } from "lucide-react";

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

export function CollageCard({
  svgRef,
  styleId,
  photos,
  onSlotClick,
  caption,
  subtitle,
}: {
  svgRef?: React.RefObject<SVGSVGElement | null>;
  styleId: CollageStyleId;
  photos: (string | null)[];
  onSlotClick?: (index: number) => void;
  caption: string;
  subtitle: string;
}) {
  const style = findCollageStyle(styleId);
  const slots = layoutForCount(photos.length).map((r) => scaleRect(r, MARGIN, MARGIN, CARD_W - MARGIN * 2, PHOTO_H));

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${CARD_W} ${CARD_H}`}
      width="100%"
      className="rounded-2xl shadow-lg"
      style={{ background: style.bg }}
    >
      <rect x={0} y={0} width={CARD_W} height={CARD_H} fill={style.bg} />

      {style.decorative && (
        <rect
          x={MARGIN - 14}
          y={MARGIN - 14}
          width={CARD_W - (MARGIN - 14) * 2}
          height={PHOTO_H + 28}
          fill="none"
          stroke={style.accent}
          strokeWidth={1.5}
          opacity={0.5}
        />
      )}

      {slots.map((rect, i) => {
        const photo = photos[i];
        return (
          <g key={i}>
            {photo ? (
              <image
                href={photo}
                x={rect.x}
                y={rect.y}
                width={rect.w}
                height={rect.h}
                preserveAspectRatio="xMidYMid slice"
              />
            ) : (
              <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill={style.id === "minimal" ? "#f2f2f2" : `${style.accent}22`} />
            )}
            {/* Clickable overlay — only meaningful in the live editor; harmless (invisible, un-clickable via CSS) once exported/serialized since onSlotClick is omitted there. */}
            {onSlotClick && (
              <rect
                x={rect.x}
                y={rect.y}
                width={rect.w}
                height={rect.h}
                fill="transparent"
                className="cursor-pointer"
                onClick={() => onSlotClick(i)}
              />
            )}
            {!photo && (
              <foreignObject x={rect.x} y={rect.y} width={rect.w} height={rect.h} pointerEvents="none">
                <div className="w-full h-full flex items-center justify-center">
                  <Plus className="opacity-40" style={{ width: Math.min(40, rect.w * 0.25), height: Math.min(40, rect.w * 0.25), color: style.accent }} />
                </div>
              </foreignObject>
            )}
          </g>
        );
      })}

      <text x={CARD_W / 2} y={CAPTION_TOP + 90} textAnchor="middle" fontSize={64} fontFamily={style.fontFamily} fill={style.captionColor}>
        {caption || " "}
      </text>
      {subtitle && (
        <text x={CARD_W / 2} y={CAPTION_TOP + 150} textAnchor="middle" fontSize={30} fontFamily={style.fontFamily} fill={style.captionColor} opacity={0.85}>
          {subtitle}
        </text>
      )}
    </svg>
  );
}

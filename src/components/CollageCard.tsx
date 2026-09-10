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
import { useRef } from "react";
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
import type { BackgroundPatternId, PlacedSticker, StickerKind } from "@/lib/collage-decor";

/** Per-photo zoom/pan state — how much bigger than its own slot the photo
 * renders (zoom) and how far its box is shifted from centered (offsetX/Y,
 * in card px) — see the "hand" drag control below for how offsetX/Y is
 * produced. Keyed by photo slot index; a slot with no entry renders at the
 * plain default (zoom 1, centered), identical to the old behavior. */
export type PhotoTransform = { offsetX: number; offsetY: number; zoom: number };

/** One sticker shape, drawn inside a 100×100 box centered on (0,0). */
export function StickerShape({ kind }: { kind: StickerKind }) {
  const heart = (fill: string, stroke?: string) => (
    <path
      d="M0,34 C-30,10 -44,-12 -28,-28 C-15,-41 2,-32 0,-18 C-2,-32 15,-41 28,-28 C44,-12 30,10 0,34 Z"
      fill={fill}
      stroke={stroke}
      strokeWidth={stroke ? 6 : 0}
    />
  );
  const flower = (petal: string, center: string) => (
    <g>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx={0} cy={-26} rx={16} ry={22} fill={petal} transform={`rotate(${a})`} />
      ))}
      <circle cx={0} cy={0} r={13} fill={center} />
    </g>
  );
  switch (kind) {
    case "heart-pink":
      return heart("#f28ab2");
    case "heart-red":
      return heart("#ef5f52");
    case "heart-outline":
      return heart("none", "#d94f7b");
    case "hearts-trio":
      return (
        <g>
          <g transform="translate(-18,6) scale(0.55)">{heart("#f9b7cd")}</g>
          <g transform="translate(14,10) scale(0.5)">{heart("#ef5f52")}</g>
          <g transform="translate(0,-16) scale(0.6)">{heart("#f28ab2")}</g>
        </g>
      );
    case "flower-yellow":
      return flower("#f6d24b", "#8a5a1e");
    case "flower-purple":
      return flower("#b1a2e0", "#f6d24b");
    case "flower-pink":
      return flower("#f6b3c6", "#f4c534");
    case "bouquet":
      return (
        <g>
          <path d="M0,42 C-4,16 -10,4 -20,-6" stroke="#6b9a5a" strokeWidth={5} fill="none" strokeLinecap="round" />
          <path d="M0,42 C2,16 8,2 18,-8" stroke="#6b9a5a" strokeWidth={5} fill="none" strokeLinecap="round" />
          <g transform="translate(-22,-14) scale(0.5)">{flower("#f6b3c6", "#f4c534")}</g>
          <g transform="translate(20,-16) scale(0.5)">{flower("#b1a2e0", "#f6d24b")}</g>
          <g transform="translate(-1,-32) scale(0.5)">{flower("#f6d24b", "#e08a4a")}</g>
        </g>
      );
    case "sparkle":
      return <path d="M0,-44 C6,-14 14,-6 44,0 C14,6 6,14 0,44 C-6,14 -14,6 -44,0 C-14,-6 -6,-14 0,-44 Z" fill="#f4c534" />;
    case "star":
      return <path d="M0,-42 L11,-13 L42,-13 L17,6 L26,36 L0,18 L-26,36 L-17,6 L-42,-13 L-11,-13 Z" fill="#f6c94b" />;
    case "bee":
      return (
        <g>
          <ellipse cx={-16} cy={-16} rx={16} ry={11} fill="#fdf4dd" opacity={0.9} transform="rotate(-25 -16 -16)" />
          <ellipse cx={16} cy={-16} rx={16} ry={11} fill="#fdf4dd" opacity={0.9} transform="rotate(25 16 -16)" />
          <ellipse cx={0} cy={6} rx={24} ry={26} fill="#f4c534" />
          <path d="M-22,-2 h44 M-24,12 h48 M-18,26 h36" stroke="#2f2a22" strokeWidth={6} strokeLinecap="round" />
          <circle cx={-9} cy={-10} r={3} fill="#2f2a22" />
          <circle cx={9} cy={-10} r={3} fill="#2f2a22" />
        </g>
      );
    case "honey":
      return (
        <g>
          <rect x={-26} y={-16} width={52} height={50} rx={10} fill="#e8a33c" />
          <rect x={-30} y={-28} width={60} height={16} rx={7} fill="#c9832a" />
          <path d="M-16,4 q16,12 32,0" stroke="#8a5a1e" strokeWidth={5} fill="none" strokeLinecap="round" />
        </g>
      );
    case "apple":
      return (
        <g>
          <circle cx={0} cy={6} r={30} fill="#e2624a" />
          <path d="M0,-22 q4,-16 16,-20" stroke="#6b9a5a" strokeWidth={6} fill="none" strokeLinecap="round" />
          <ellipse cx={14} cy={-30} rx={12} ry={7} fill="#6b9a5a" transform="rotate(-20 14 -30)" />
        </g>
      );
    case "pomegranate":
      return (
        <g>
          <circle cx={0} cy={8} r={28} fill="#c9436b" />
          <path d="M-8,-22 l8,-16 l8,16 l10,-8 l-6,14 z" fill="#a83457" />
        </g>
      );
    case "leaf":
      return <path d="M-28,28 C-28,-14 0,-36 30,-32 C34,-2 12,28 -28,28 Z" fill="#6b9a5a" />;
    case "balloon":
      return (
        <g>
          <ellipse cx={0} cy={-8} rx={22} ry={27} fill="#f28ab2" />
          <path d="M0,20 l-5,8 h10 z" fill="#f28ab2" />
          <path d="M0,28 q10,18 -4,32" stroke="#c9436b" strokeWidth={3} fill="none" />
        </g>
      );
    case "cloud":
      return (
        <g fill="#dbe9f7">
          <circle cx={-18} cy={6} r={16} />
          <circle cx={2} cy={-4} r={21} />
          <circle cx={22} cy={8} r={15} />
          <rect x={-18} y={8} width={40} height={14} rx={7} />
        </g>
      );
    case "moon":
      return <path d="M14,-34 A34,34 0 1 0 22,30 A27,27 0 1 1 14,-34 Z" fill="#f6d24b" />;
    case "crown":
      return <path d="M-32,22 L-32,-18 L-12,0 L0,-26 L12,0 L32,-18 L32,22 Z" fill="#f4c534" stroke="#d8a51f" strokeWidth={3} />;
    case "bow":
      return (
        <g fill="#f28ab2">
          <path d="M-6,0 L-34,-18 L-34,18 Z" />
          <path d="M6,0 L34,-18 L34,18 Z" />
          <circle cx={0} cy={0} r={9} fill="#e2708f" />
        </g>
      );
    case "pacifier":
      return (
        <g>
          <circle cx={0} cy={0} r={22} fill="none" stroke="#f28ab2" strokeWidth={9} />
          <circle cx={0} cy={0} r={11} fill="#fdf6ee" />
          <rect x={-9} y={20} width={18} height={16} rx={8} fill="#f9c9d8" />
        </g>
      );
    case "footprint":
      return (
        <g fill="#f6b3c6">
          <ellipse cx={0} cy={12} rx={17} ry={21} />
          <circle cx={-13} cy={-14} r={6} />
          <circle cx={-3} cy={-20} r={6} />
          <circle cx={8} cy={-19} r={5.5} />
          <circle cx={16} cy={-11} r={5} />
        </g>
      );
    default:
      return null;
  }
}

const STICKER_TONES = {
  pink: { bg: "#fbe3ec", text: "#c9436b", border: "#f2a8c1" },
  cream: { bg: "#fdf3e2", text: "#8a5a1e", border: "#eccf9c" },
  green: { bg: "#e6f0e2", text: "#2d3d2b", border: "#a8c69c" },
} as const;


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
  if (theme === "sweet") {
    // Honey jar + a small bee — the Rosh Hashana / "sweet year" motif from
    // the owner's own reference stickers, as a corner flourish for this
    // simpler renderer (the full bee/honey-jar/apple element library lives
    // in the fuller /collage-studio editor — see collage-studio-library.ts).
    return (
      <g opacity={0.85} transform={`translate(${cardW - 76}, 18)`}>
        <rect x={-20} y={-2} width={40} height={38} rx={8} fill={accent} opacity={0.9} />
        <rect x={-23} y={-14} width={46} height={12} rx={5} fill={accent} />
        <path d="M-10,10 q10,9 20,0" stroke="#fff" strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.7} />
        <g transform="translate(38, 44) scale(0.5)">
          <ellipse cx={-13} cy={-13} rx={13} ry={9} fill="#fff" opacity={0.7} transform="rotate(-25 -13 -13)" />
          <ellipse cx={13} cy={-13} rx={13} ry={9} fill="#fff" opacity={0.7} transform="rotate(25 13 -13)" />
          <ellipse cx={0} cy={5} rx={19} ry={21} fill={accent} />
          <path d="M-18,-2 h36 M-19,10 h38 M-14,21 h28" stroke="#2f2a22" strokeWidth={5} strokeLinecap="round" />
        </g>
      </g>
    );
  }
  if (theme === "wedding") {
    // Two interlocking rings — a light, universal wedding motif.
    return (
      <g opacity={0.85} stroke={accent} strokeWidth={3} fill="none">
        <g transform={`translate(${cardW - 84}, 30)`}>
          <circle cx={0} cy={0} r={17} />
          <circle cx={20} cy={0} r={17} />
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
  bgPattern = "none",
  stickers = [],
  onStickerClick,
  onSlotClick,
  photoTransforms,
  onPhotoTransform,
  onPhotoSelect,
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
  /** Repeating background texture drawn over the flat bg color (see BACKGROUND_PATTERNS). */
  bgPattern?: BackgroundPatternId;
  /** Shape/caption stickers the user added, positioned as card fractions. */
  stickers?: PlacedSticker[];
  onStickerClick?: (uid: string) => void;
  onSlotClick?: (index: number) => void;
  /** Current zoom/pan per photo slot index — see PhotoTransform. */
  photoTransforms?: Record<number, PhotoTransform>;
  /** Fired continuously while dragging a photo's "hand" control, with the new (already-clamped) offset for that slot. */
  onPhotoTransform?: (index: number, next: PhotoTransform) => void;
  /** Fired when a filled photo's hand control is grabbed — lets the caller show that slot's zoom control (e.g. a slider in a side panel). Passing this prop (together with onPhotoTransform) is what makes the hand control appear at all — omit both to keep the old fixed/centered photo behavior. */
  onPhotoSelect?: (index: number) => void;
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
  // Sits close to the very bottom edge of the photo area — pulled down
  // from an earlier, higher placement per explicit feedback.
  const overlayBottomPad = Math.round(cardH * 0.012);
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

  // ---- photo pan/zoom (the "hand" drag control) --------------------------
  // Converts a pointer-move delta in browser/screen px into card/SVG user
  // units via the SVG's own screen CTM — correct regardless of the card's
  // responsive on-screen scale (width="100%"), no manual bounding-rect math
  // needed. Only the matrix's linear part (a,b,c,d) applies to a delta
  // vector — its translation (e,f) is for absolute points, not deltas.
  const panDragRef = useRef<{ index: number; startClientX: number; startClientY: number; startOffsetX: number; startOffsetY: number } | null>(null);
  const canPan = Boolean(onPhotoTransform);

  function clampedTransformFor(index: number, rect: { w: number; h: number }): PhotoTransform {
    const t = photoTransforms?.[index] ?? { offsetX: 0, offsetY: 0, zoom: 1 };
    const boxW = rect.w * t.zoom;
    const boxH = rect.h * t.zoom;
    const maxX = Math.max(0, (boxW - rect.w) / 2);
    const maxY = Math.max(0, (boxH - rect.h) / 2);
    return { zoom: t.zoom, offsetX: Math.max(-maxX, Math.min(maxX, t.offsetX)), offsetY: Math.max(-maxY, Math.min(maxY, t.offsetY)) };
  }

  function screenDeltaToSvg(dxClient: number, dyClient: number): { dx: number; dy: number } {
    const svg = svgRef?.current;
    const ctm = svg?.getScreenCTM();
    if (!ctm) return { dx: dxClient, dy: dyClient };
    const inv = ctm.inverse();
    return { dx: dxClient * inv.a + dyClient * inv.c, dy: dxClient * inv.b + dyClient * inv.d };
  }

  const onHandPointerDown = (index: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const t = photoTransforms?.[index] ?? { offsetX: 0, offsetY: 0, zoom: 1 };
    panDragRef.current = { index, startClientX: e.clientX, startClientY: e.clientY, startOffsetX: t.offsetX, startOffsetY: t.offsetY };
    onPhotoSelect?.(index);
  };
  const onHandPointerMove = (e: React.PointerEvent) => {
    const d = panDragRef.current;
    if (!d || !onPhotoTransform) return;
    const { dx, dy } = screenDeltaToSvg(e.clientX - d.startClientX, e.clientY - d.startClientY);
    const rect = photoRectFor(slots[d.index]);
    const t = photoTransforms?.[d.index] ?? { offsetX: 0, offsetY: 0, zoom: 1 };
    // Direct-manipulation feel: the content moves WITH the pointer, so the
    // box's own offset moves the same direction as the drag.
    const raw: PhotoTransform = { zoom: t.zoom, offsetX: d.startOffsetX + dx, offsetY: d.startOffsetY + dy };
    const boxW = rect.w * raw.zoom;
    const boxH = rect.h * raw.zoom;
    const maxX = Math.max(0, (boxW - rect.w) / 2);
    const maxY = Math.max(0, (boxH - rect.h) / 2);
    onPhotoTransform(d.index, { zoom: raw.zoom, offsetX: Math.max(-maxX, Math.min(maxX, raw.offsetX)), offsetY: Math.max(-maxY, Math.min(maxY, raw.offsetY)) });
  };
  const onHandPointerUp = () => {
    panDragRef.current = null;
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
        {bgPattern !== "none" && (
          <pattern id="collage-bg-pattern" patternUnits="userSpaceOnUse" width={48} height={48} patternTransform={bgPattern === "diagonal" ? "rotate(45)" : undefined}>
            {(bgPattern === "stripes" || bgPattern === "diagonal") && <rect x={0} y={0} width={24} height={48} fill={accent} opacity={0.16} />}
            {bgPattern === "grid" && <path d="M0,0 H48 M0,0 V48" stroke={accent} strokeWidth={2} opacity={0.2} fill="none" />}
            {bgPattern === "dots" && <circle cx={12} cy={12} r={4} fill={accent} opacity={0.25} />}
            {bgPattern === "dots-pink" && <circle cx={12} cy={12} r={5} fill="#f28ab2" opacity={0.3} />}
            {bgPattern === "confetti" && (
              <g opacity={0.35}>
                <rect x={6} y={8} width={10} height={4} rx={2} fill={accent} transform="rotate(20 6 8)" />
                <rect x={30} y={28} width={10} height={4} rx={2} fill="#f28ab2" transform="rotate(-25 30 28)" />
                <circle cx={38} cy={9} r={3} fill="#f4c534" />
              </g>
            )}
          </pattern>
        )}
      </defs>

      <rect x={0} y={0} width={cardW} height={cardH} fill={bg} />
      {bgPattern !== "none" && <rect x={0} y={0} width={cardW} height={cardH} fill="url(#collage-bg-pattern)" />}


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
                (() => {
                  const t = clampedTransformFor(i, photoRect);
                  const boxW = photoRect.w * t.zoom;
                  const boxH = photoRect.h * t.zoom;
                  const boxX = photoRect.x - (boxW - photoRect.w) / 2 + t.offsetX;
                  const boxY = photoRect.y - (boxH - photoRect.h) / 2 + t.offsetY;
                  return (
                    <image
                      href={photo}
                      x={boxX}
                      y={boxY}
                      width={boxW}
                      height={boxH}
                      preserveAspectRatio="xMidYMid slice"
                      style={cssFilter ? { filter: cssFilter } : undefined}
                    />
                  );
                })()
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

      {/* The "hand" pan controls get their OWN final pass, after every
          slot's frame/click-overlay above — in a scattered/tilted layout,
          neighboring cards overlap on screen, and SVG paint order is
          strictly document order, so a LATER slot's full-size transparent
          click rect (added in the pass above) would sit on top of an
          EARLIER slot's hand icon and swallow its pointer events even
          when the icon is nested "after" its own slot's rect — the only
          reliable fix is one shared last pass so every hand icon beats
          every click rect, regardless of which slot either belongs to. */}
      {slots.map((rect, i) => {
        const photo = photos[i];
        if (!photo || !canPan) return null;
        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2;
        const rotate = rect.rotation ? `rotate(${rect.rotation} ${cx} ${cy})` : undefined;
        const photoRect = photoRectFor(rect);
        return (
          <g key={`pan-${i}`} transform={rotate}>
            <g
              className="collage-card-editor-ui"
              transform={`translate(${photoRect.x + photoRect.w / 2}, ${photoRect.y + photoRect.h - 16})`}
              style={{ cursor: "grab" }}
              onPointerDown={onHandPointerDown(i)}
              onPointerMove={onHandPointerMove}
              onPointerUp={onHandPointerUp}
              onPointerCancel={onHandPointerUp}
            >
              <circle r={13} fill="#ffffff" fillOpacity={0.95} stroke="#d98a4a" strokeWidth={1.5} style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.25))" }} />
              <text textAnchor="middle" dominantBaseline="central" fontSize={13}>
                ✋
              </text>
            </g>
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

      {stickers.map((sticker) => {
        const base = Math.min(cardW, cardH) * 0.16 * sticker.scale;
        const x = sticker.x * cardW;
        const y = sticker.y * cardH;
        if (sticker.text) {
          const tone = STICKER_TONES[sticker.tone ?? "pink"];
          const fontSize = Math.max(14, base * 0.34);
          const w = sticker.text.length * fontSize * 0.56 + fontSize * 1.4;
          const h = fontSize * 2.1;
          return (
            <g key={sticker.uid} transform={`translate(${x - w / 2}, ${y - h / 2})`} onClick={onStickerClick ? () => onStickerClick(sticker.uid) : undefined} className={onStickerClick ? "cursor-pointer" : undefined}>
              <rect x={0} y={0} width={w} height={h} rx={h / 2} fill={tone.bg} stroke={tone.border} strokeWidth={3} style={{ filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.18))" }} />
              <text x={w / 2} y={h / 2 + fontSize * 0.36} textAnchor="middle" fontSize={fontSize} fontFamily={style.fontFamily} fill={tone.text}>
                {sticker.text}
              </text>
            </g>
          );
        }
        if (!sticker.kind) return null;
        return (
          <g key={sticker.uid} transform={`translate(${x}, ${y}) scale(${base / 100})`} onClick={onStickerClick ? () => onStickerClick(sticker.uid) : undefined} className={onStickerClick ? "cursor-pointer" : undefined} style={{ filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.2))" }}>
            <StickerShape kind={sticker.kind} />
            <circle cx={0} cy={0} r={52} fill="transparent" />
          </g>
        );
      })}
    </svg>

  );
}

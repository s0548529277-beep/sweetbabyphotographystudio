// The real editing engine — a fabric.js canvas wrapped for React, exposed
// to StudioEditor via an imperative handle (StudioCanvasHandle) so the
// surrounding toolbar/panels stay simple, dumb UI that just calls methods
// here. fabric.js needs a real DOM, so it's imported dynamically inside
// useEffect (client-only) — this file never touches `fabric` at module
// scope, which keeps TanStack Start's SSR pass safe.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { shapeClipPath } from "@/lib/collage-data";
import { findElement, type DesignPreset, type StyledCaptionPreset } from "@/lib/collage-studio-library";
import type { CollageTemplate, StudioElement, StudioImageShape, StudioFrameStyle } from "@/lib/collage-studio-data";

// fabric's own object types aren't imported at module scope (see above) —
// these are kept loose (`any`) rather than duplicating fabric's types by
// hand; StudioCanvas is the one file in the app allowed that trade-off.
type FabricNS = typeof import("fabric");
type FabricCanvas = InstanceType<FabricNS["Canvas"]>;
type FabricObj = any;

export type LayerInfo = {
  id: string;
  kind: "image" | "text" | "shape";
  label: string;
  hasPhoto?: boolean;
  hidden: boolean;
  locked: boolean;
  selected: boolean;
};

export type SelectionInfo =
  | { kind: "none" }
  | {
      kind: "image";
      id: string;
      hasPhoto: boolean;
      shape: StudioImageShape;
      frame: StudioFrameStyle;
      frameColor: string;
      zoom: number;
      offsetX: number;
      offsetY: number;
    }
  | { kind: "text"; id: string; text: string; fontFamily: string; fontSize: number; color: string; bold: boolean }
  | { kind: "shape"; id: string; color: string };

/** Everything that controls how one photo renders inside its own fixed
 * frame — shape (clip), border/mat treatment, and crop (zoom + pan). Kept
 * as one bundle since changing any of them means fully rebuilding the
 * photo's fabric object (see buildPhotoElement) rather than patching it in
 * place. */
export type PhotoStyle = {
  shape: StudioImageShape;
  frame: StudioFrameStyle;
  frameColor: string;
  zoom: number;
  offsetX: number;
  offsetY: number;
};
const DEFAULT_PHOTO_STYLE: PhotoStyle = { shape: "rect", frame: "none", frameColor: "#ffffff", zoom: 1, offsetX: 0, offsetY: 0 };

export type StudioCanvasHandle = {
  addTextPreset: (text: string, subtitle?: string) => void;
  addCustomText: () => void;
  addElement: (elementId: string) => void;
  /** Inserts one ready-made caption sticker (colored pill + its own text, grouped as one object) — distinct from addTextPreset's bare text. */
  addStyledCaption: (preset: StyledCaptionPreset) => void;
  /** Adds a brand-new empty photo frame to the canvas (default centered,
   * rounded) — the real answer to "let me add/remove photos freely,
   * regardless of how many the template started with". Removing one is
   * just selecting it and using the existing delete button. */
  addPhotoFrame: (shape?: StudioImageShape) => void;
  setBackgroundColor: (color: string) => void;
  applyDesignPreset: (preset: DesignPreset) => void;
  replaceSelectedImage: (dataUrl: string) => Promise<void>;
  assignImagesSequentially: (dataUrls: string[]) => Promise<void>;
  /** Click-to-add flow: fills the selected empty frame, else the first empty frame, else does nothing (no frame left to fill). Returns whether it found somewhere to put the photo. */
  assignToSelectedOrNextEmptyFrame: (dataUrl: string) => Promise<boolean>;
  /** Drag-and-drop flow: fills whichever frame (empty or already filled) is under the given canvas-space point. */
  assignImageAtPoint: (dataUrl: string, x: number, y: number) => Promise<boolean>;
  /** Rebuilds the selected photo (or empty frame) with a new clip shape, keeping its position/size/photo/frame/crop. */
  updateSelectedShape: (shape: StudioImageShape) => Promise<void>;
  /** Rebuilds the selected (photo-holding) frame with a patch over its current border style and/or crop (zoom/pan). No-op on an empty frame — nothing to crop yet. */
  updateSelectedImageStyle: (patch: Partial<Pick<PhotoStyle, "frame" | "frameColor" | "zoom" | "offsetX" | "offsetY">>) => Promise<void>;
  /** Resets the selected photo's zoom/pan back to a plain centered cover-fit. */
  resetSelectedImageCrop: () => Promise<void>;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  bringForward: () => void;
  sendBackward: () => void;
  flipSelected: () => void;
  rotateSelected: (deltaDeg: number) => void;
  toggleLockSelected: () => void;
  toggleHideLayer: (id: string) => void;
  reorderLayer: (id: string, dir: "up" | "down") => void;
  selectLayer: (id: string) => void;
  undo: () => void;
  redo: () => void;
  zoom: (factor: number) => void;
  updateSelectedText: (props: Partial<{ text: string; fontFamily: string; fontSize: number; color: string; bold: boolean; align: "right" | "center" | "left" }>) => void;
  updateSelectedColor: (color: string) => void;
  exportPNG: (multiplier?: number) => Promise<string>;
  getLayers: () => LayerInfo[];
};

function unitClipPathD(shape: StudioImageShape, w: number, h: number): string | null {
  // Reuses the free collage-maker's shape math (shapeClipPath works on
  // plain absolute x/y/w/h, nothing free-tool-specific about it) —
  // centered at (0,0) here because that's the coordinate convention
  // fabric expects for a non-absolute clipPath (relative to the target
  // object's own center).
  return shapeClipPath(shape as any, { x: -w / 2, y: -h / 2, w, h });
}

export const StudioCanvas = forwardRef<
  StudioCanvasHandle,
  {
    template: CollageTemplate;
    zoomToFit?: boolean;
    onSelectionChange: (sel: SelectionInfo) => void;
    onLayersChange: (layers: LayerInfo[]) => void;
    onReady?: () => void;
  }
>(function StudioCanvas({ template, onSelectionChange, onLayersChange, onReady }, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricNS | null>(null);
  const canvasRef = useRef<FabricCanvas | null>(null);
  const historyRef = useRef<{ stack: string[]; index: number; restoring: boolean }>({ stack: [], index: -1, restoring: false });
  const guideLinesRef = useRef<FabricObj[]>([]);
  const [ready, setReady] = useState(false);

  // ---- init ----------------------------------------------------------
  useEffect(() => {
    let disposed = false;
    (async () => {
      const fabric = await import("fabric");
      if (disposed || !canvasElRef.current) return;
      fabricRef.current = fabric;
      const canvas = new fabric.Canvas(canvasElRef.current, {
        width: template.canvas.width,
        height: template.canvas.height,
        backgroundColor: template.background.color,
        preserveObjectStacking: true,
      });
      canvasRef.current = canvas;

      await buildFromTemplate(fabric, canvas, template);
      pushHistory();
      wireEvents(fabric, canvas);
      setReady(true);
      onReady?.();
    })();
    return () => {
      disposed = true;
      canvasRef.current?.dispose();
      canvasRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id]);

  function wireEvents(fabric: FabricNS, canvas: FabricCanvas) {
    const notifySelection = () => {
      const obj = canvas.getActiveObject() as FabricObj;
      if (!obj) {
        onSelectionChange({ kind: "none" });
        return;
      }
      const kind = obj.studioType as "image" | "text" | "shape" | undefined;
      if (kind === "text") {
        onSelectionChange({ kind: "text", id: obj.studioId, text: obj.text ?? "", fontFamily: obj.fontFamily ?? "Assistant", fontSize: Math.round(obj.fontSize ?? 24), color: obj.fill ?? "#000000", bold: obj.fontWeight === "bold" });
      } else if (kind === "image") {
        onSelectionChange({
          kind: "image",
          id: obj.studioId,
          hasPhoto: Boolean(obj.studioHasPhoto),
          shape: obj.studioShape ?? "rect",
          frame: obj.studioFrame ?? "none",
          frameColor: obj.studioFrameColor ?? "#ffffff",
          zoom: obj.studioZoom ?? 1,
          offsetX: obj.studioOffsetX ?? 0,
          offsetY: obj.studioOffsetY ?? 0,
        });
      } else if (kind === "shape") {
        // A caption sticker (or any decorative element) has no fill of its
        // own on the outer group — studioColor (kept in sync by
        // addElement/addStyledCaption/updateSelectedColor) is the real
        // source of truth, not obj.fill.
        onSelectionChange({ kind: "shape", id: obj.studioId, color: obj.studioColor ?? obj.fill ?? "#000000" });
      } else {
        onSelectionChange({ kind: "none" });
      }
    };
    canvas.on("selection:created", notifySelection);
    canvas.on("selection:updated", notifySelection);
    canvas.on("selection:cleared", () => onSelectionChange({ kind: "none" }));

    const notifyLayers = () => onLayersChange(collectLayers(canvas));
    canvas.on("object:added", notifyLayers);
    canvas.on("object:removed", notifyLayers);
    canvas.on("object:modified", () => {
      notifyLayers();
      pushHistory();
    });

    // Smart guides: canvas center + object-center snapping while dragging.
    canvas.on("object:moving", (e: any) => {
      const obj = e.target as FabricObj;
      if (!obj) return;
      clearGuides(fabric, canvas);
      const threshold = 6;
      const cw = canvas.getWidth();
      const ch = canvas.getHeight();
      const center = obj.getCenterPoint();
      let snappedX = false;
      let snappedY = false;
      if (Math.abs(center.x - cw / 2) < threshold) {
        obj.setPositionByOrigin(new fabric.Point(cw / 2, center.y), "center", "center");
        drawGuide(fabric, canvas, "v", cw / 2);
        snappedX = true;
      }
      if (Math.abs(center.y - ch / 2) < threshold) {
        obj.setPositionByOrigin(new fabric.Point(snappedX ? cw / 2 : center.x, ch / 2), "center", "center");
        drawGuide(fabric, canvas, "h", ch / 2);
        snappedY = true;
      }
      if (!snappedX || !snappedY) {
        for (const other of canvas.getObjects() as FabricObj[]) {
          if (other === obj || other.studioIsGuide) continue;
          const oc = other.getCenterPoint();
          if (!snappedX && Math.abs(center.x - oc.x) < threshold) {
            obj.setPositionByOrigin(new fabric.Point(oc.x, obj.getCenterPoint().y), "center", "center");
            drawGuide(fabric, canvas, "v", oc.x);
            snappedX = true;
          }
          if (!snappedY && Math.abs(center.y - oc.y) < threshold) {
            obj.setPositionByOrigin(new fabric.Point(obj.getCenterPoint().x, oc.y), "center", "center");
            drawGuide(fabric, canvas, "h", oc.y);
            snappedY = true;
          }
        }
      }
    });
    canvas.on("mouse:up", () => clearGuides(fabric, canvas));
  }

  function drawGuide(fabric: FabricNS, canvas: FabricCanvas, axis: "h" | "v", pos: number) {
    const cw = canvas.getWidth();
    const ch = canvas.getHeight();
    const line = new fabric.Line(axis === "v" ? [pos, 0, pos, ch] : [0, pos, cw, pos], {
      stroke: "#ec4899",
      strokeWidth: 1,
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });
    (line as FabricObj).studioIsGuide = true;
    guideLinesRef.current.push(line);
    canvas.add(line);
    canvas.bringObjectToFront(line);
  }
  function clearGuides(fabric: FabricNS, canvas: FabricCanvas) {
    for (const l of guideLinesRef.current) canvas.remove(l);
    guideLinesRef.current = [];
  }

  function collectLayers(canvas: FabricCanvas): LayerInfo[] {
    const active = canvas.getActiveObject();
    return canvas
      .getObjects()
      .filter((o: FabricObj) => !o.studioIsGuide)
      .map((o: FabricObj) => ({
        id: o.studioId,
        kind: o.studioType,
        label: o.studioLabel ?? o.studioType,
        hasPhoto: o.studioType === "image" ? Boolean(o.studioHasPhoto) : undefined,
        hidden: !o.visible,
        locked: Boolean(o.lockMovementX),
        selected: o === active,
      }))
      .reverse(); // top-of-stack (front) first, reads naturally as "layers"
  }

  async function buildFromTemplate(fabric: FabricNS, canvas: FabricCanvas, tmpl: CollageTemplate) {
    for (const el of tmpl.elements) {
      const obj = await buildElement(fabric, el);
      if (obj) canvas.add(obj);
    }
    canvas.renderAll();
  }

  async function buildElement(fabric: FabricNS, el: StudioElement): Promise<FabricObj | null> {
    if (el.type === "image") {
      return buildEmptyFrame(fabric, el);
    }
    if (el.type === "text") {
      // Default wide enough that a normal title phrase doesn't wrap to a
      // second line and collide with whatever sits below it — templates
      // can still request a narrower width explicitly.
      const defaultWidth = Math.min(900, template.canvas.width - 100);
      const box = new fabric.Textbox(el.text, {
        left: el.x,
        top: el.y,
        width: el.width ?? defaultWidth,
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
        fill: el.color,
        fontWeight: el.bold ? "bold" : "normal",
        textAlign: el.align ?? "center",
        angle: el.rotation ?? 0,
        originX: "center",
        originY: "top",
        direction: "rtl" as any,
        editable: true,
      });
      (box as FabricObj).studioId = el.id;
      (box as FabricObj).studioType = "text";
      (box as FabricObj).studioLabel = el.text;
      return box;
    }
    // shape
    const lib = findElement(el.elementId);
    if (!lib) return null;
    const color = el.color ?? "#333333";
    const svgMarkup = lib.svg(color);
    const parsed = await fabric.loadSVGFromString(svgMarkup);
    const group = fabric.util.groupSVGElements(parsed.objects.filter(Boolean) as FabricObj[], parsed.options);
    group.set({
      left: el.x,
      top: el.y,
      angle: el.rotation ?? 0,
      opacity: el.opacity ?? 1,
    });
    group.scaleToWidth(el.width);
    group.scaleToHeight(el.height);
    (group as FabricObj).studioId = el.id;
    (group as FabricObj).studioType = "shape";
    (group as FabricObj).studioLabel = lib.label;
    (group as FabricObj).studioElementId = el.elementId;
    (group as FabricObj).studioColor = color;
    return group;
  }

  function buildEmptyFrame(fabric: FabricNS, el: Extract<StudioElement, { type: "image" }>): FabricObj {
    const shape = el.shape ?? "rect";
    const d = unitClipPathD(shape, el.width, el.height);
    let shapeObj: FabricObj;
    if (!d) {
      shapeObj = new fabric.Rect({ width: el.width, height: el.height, left: 0, top: 0, originX: "center", originY: "center", fill: "#eeeeee", stroke: "#c9c9c9", strokeDashArray: [8, 6], rx: 0, ry: 0 });
    } else {
      shapeObj = new fabric.Path(d, { left: 0, top: 0, originX: "center", originY: "center", fill: "#eeeeee", stroke: "#c9c9c9", strokeDashArray: [8, 6] });
    }
    const half = Math.min(24, el.width * 0.12, el.height * 0.12);
    const plus = new fabric.Path(`M ${-half},0 L ${half},0 M 0,${-half} L 0,${half}`, {
      left: 0,
      top: 0,
      originX: "center",
      originY: "center",
      stroke: "#a3a3a3",
      strokeWidth: 3,
      fill: "",
    });
    const group = new fabric.Group([shapeObj, plus], {
      left: el.x + el.width / 2,
      top: el.y + el.height / 2,
      originX: "center",
      originY: "center",
      angle: el.rotation ?? 0,
    });
    (group as FabricObj).studioId = el.id;
    (group as FabricObj).studioType = "image";
    (group as FabricObj).studioLabel = "תמונה";
    (group as FabricObj).studioHasPhoto = false;
    (group as FabricObj).studioShape = shape;
    (group as FabricObj).studioFrameW = el.width;
    (group as FabricObj).studioFrameH = el.height;
    (group as FabricObj).studioFrame = el.frame ?? "none";
    (group as FabricObj).studioFrameColor = el.frameColor ?? "#ffffff";
    return group;
  }

  /** Border/mat padding (in the frame's own px) for one frame style — "none"
   * and the pure stroke styles (thin/thick/dashed/double) get no mat at
   * all, only "polaroid" (classic deep-bottom print) and "passepartout"
   * (equal picture-frame mat) push the photo inward. */
  function matPadding(frame: StudioFrameStyle, w: number, h: number): { side: number; top: number; bottom: number } {
    if (frame === "polaroid") return { side: w * 0.055, top: w * 0.055, bottom: h * 0.22 };
    if (frame === "passepartout") {
      const p = Math.max(w, h) * 0.07;
      return { side: p, top: p, bottom: p };
    }
    return { side: 0, top: 0, bottom: 0 };
  }

  /**
   * Builds one placed photo as a small fixed group: [mat?, image, outline?]
   * — always the same shape of object (a Group), so swapping/rebuilding it
   * on a shape/frame/crop change is uniform whether or not it currently has
   * a mat or outline. The group's own left/top/angle/width/height is
   * exactly the frame's own fixed geometry — moving/resizing/rotating the
   * WHOLE element (drag, corner handles) works exactly as before,
   * completely independent of the photo's own zoom/pan.
   *
   * Zoom/pan is implemented via the image's own cropX/cropY/width/height
   * (a real fabric.Image feature, not a hack) instead of translating the
   * image object — that keeps the image's own bounding box (and therefore
   * the frame's position/size) untouched no matter how the photo is
   * zoomed or panned inside it, so "drag moves the whole element" and
   * "zoom/pan reveals different content in a fixed window" never fight
   * each other.
   */
  async function buildPhotoElement(
    fabric: FabricNS,
    opts: { dataUrl: string; frameId: string; x: number; y: number; w: number; h: number; angle: number; style: PhotoStyle },
  ): Promise<FabricObj> {
    const { dataUrl, frameId, x, y, w, h, angle, style } = opts;
    const img = await fabric.FabricImage.fromURL(dataUrl);
    const imgW = img.width || 1;
    const imgH = img.height || 1;
    const baseScale = Math.max(w / imgW, h / imgH);
    const zoom = Math.max(1, style.zoom || 1);
    const scale = baseScale * zoom;
    const cropW = Math.min(imgW, w / scale);
    const cropH = Math.min(imgH, h / scale);
    const availX = Math.max(0, imgW - cropW);
    const availY = Math.max(0, imgH - cropH);
    const ox = Math.max(-1, Math.min(1, style.offsetX || 0));
    const oy = Math.max(-1, Math.min(1, style.offsetY || 0));
    const cropX = Math.max(0, Math.min(availX, availX / 2 + (ox * availX) / 2));
    const cropY = Math.max(0, Math.min(availY, availY / 2 + (oy * availY) / 2));
    img.set({
      cropX,
      cropY,
      width: cropW,
      height: cropH,
      left: 0,
      top: 0,
      originX: "center",
      originY: "center",
      scaleX: scale,
      scaleY: scale,
    });
    // Stashed so the drag-to-pan hand control (below) can clamp live drags
    // without re-deriving imgW/imgH/baseScale from scratch on every mouse
    // move.
    (img as FabricObj).studioCropAvailX = availX;
    (img as FabricObj).studioCropAvailY = availY;
    const d = unitClipPathD(style.shape, w, h);
    if (d) {
      const clip = new fabric.Path(d, { originX: "center", originY: "center" });
      // clipPath coordinates are in the target object's own (unscaled)
      // local space, so undo the image's own scale for the clip shape.
      clip.set({ scaleX: 1 / scale, scaleY: 1 / scale });
      img.clipPath = clip;
    }

    const children: FabricObj[] = [];
    const pad = matPadding(style.frame, w, h);
    if (pad.side || pad.top || pad.bottom) {
      const mat = new fabric.Rect({
        left: 0,
        top: (pad.bottom - pad.top) / 2,
        width: w + pad.side * 2,
        height: h + pad.top + pad.bottom,
        originX: "center",
        originY: "center",
        fill: style.frameColor,
        stroke: "#00000014",
        strokeWidth: 1,
        rx: Math.min(10, pad.side * 0.4 || 6),
        ry: Math.min(10, pad.side * 0.4 || 6),
      });
      children.push(mat);
    }
    children.push(img as FabricObj);
    if (style.frame === "thin" || style.frame === "thick" || style.frame === "dashed" || style.frame === "double") {
      const outlineD = d ?? `M ${-w / 2},${-h / 2} H ${w / 2} V ${h / 2} H ${-w / 2} Z`;
      const strokeWidth = style.frame === "thick" ? 14 : 4;
      children.push(
        new fabric.Path(outlineD, {
          left: 0,
          top: 0,
          originX: "center",
          originY: "center",
          fill: "",
          stroke: style.frameColor,
          strokeWidth,
          strokeDashArray: style.frame === "dashed" ? [12, 9] : undefined,
        }),
      );
      if (style.frame === "double") {
        const innerD = unitClipPathD(style.shape, Math.max(1, w - 16), Math.max(1, h - 16)) ?? `M ${-(w - 16) / 2},${-(h - 16) / 2} H ${(w - 16) / 2} V ${(h - 16) / 2} H ${-(w - 16) / 2} Z`;
        children.push(new fabric.Path(innerD, { left: 0, top: 0, originX: "center", originY: "center", fill: "", stroke: style.frameColor, strokeWidth: 3 }));
      }
    }

    const group = new fabric.Group(children, { left: x + w / 2, top: y + h / 2, originX: "center", originY: "center", angle });
    (group as FabricObj).studioId = frameId;
    (group as FabricObj).studioType = "image";
    (group as FabricObj).studioLabel = "תמונה";
    (group as FabricObj).studioHasPhoto = true;
    (group as FabricObj).studioShape = style.shape;
    (group as FabricObj).studioFrameW = w;
    (group as FabricObj).studioFrameH = h;
    (group as FabricObj).studioFrame = style.frame;
    (group as FabricObj).studioFrameColor = style.frameColor;
    (group as FabricObj).studioZoom = zoom;
    (group as FabricObj).studioOffsetX = ox;
    (group as FabricObj).studioOffsetY = oy;
    attachPanControl(fabric, group);
    return group;
  }

  /**
   * Adds the "hand" drag control the owner asked to match — a dedicated
   * handle (bottom-center, alongside fabric's own resize/rotate handles)
   * that pans the photo's content INSIDE its own fixed frame, as opposed
   * to the object's normal body-drag which moves the whole framed element.
   * Only meaningful (and only attached) on a photo that actually has an
   * image — an empty placeholder has nothing to pan.
   *
   * Mechanics: while this control is being dragged, we mutate the inner
   * image's own cropX/cropY directly (same fields buildPhotoElement uses
   * for the initial centered crop) and re-render — cheap enough to do on
   * every mousemove, unlike buildPhotoElement's full rebuild — then only
   * sync the result back into React state (and push undo history) once,
   * on mouse-up. x/y handed to a custom control's actionHandler are plain
   * canvas viewport pixels, so the delta is converted through the
   * canvas's own preview zoom and the image's current render scale to get
   * back to real source-image pixels — correct for the common case of an
   * unrotated photo; a manually-rotated one pans slightly off-axis, a
   * known, acceptable trade-off given how rare a rotated photo is here.
   */
  function attachPanControl(fabric: FabricNS, group: FabricObj) {
    const control = new fabric.Control({
      x: 0,
      y: 0.5,
      offsetY: 22,
      cursorStyleHandler: () => "grab",
      render: (ctx: CanvasRenderingContext2D, left: number, top: number) => {
        ctx.save();
        ctx.translate(left, top);
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fill();
        ctx.strokeStyle = "#d98a4a";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("✋", 0, 1);
        ctx.restore();
      },
      actionHandler: (_eventData: any, transform: any, x: number, y: number) => {
        const target = transform.target as FabricObj;
        const inner = innerImageOf(target);
        if (!inner) return false;
        const lastX = transform.lastX ?? x;
        const lastY = transform.lastY ?? y;
        const dx = x - lastX;
        const dy = y - lastY;
        if (!dx && !dy) return false;
        const canvas = target.canvas as FabricCanvas | undefined;
        const zoom = canvas?.getZoom?.() ?? 1;
        const scale = inner.scaleX || 1;
        const sdx = dx / zoom / scale;
        const sdy = dy / zoom / scale;
        const availX = inner.studioCropAvailX ?? 0;
        const availY = inner.studioCropAvailY ?? 0;
        const newCropX = Math.max(0, Math.min(availX, (inner.cropX ?? 0) - sdx));
        const newCropY = Math.max(0, Math.min(availY, (inner.cropY ?? 0) - sdy));
        inner.set({ cropX: newCropX, cropY: newCropY });
        return true;
      },
      mouseUpHandler: (_eventData: any, transform: any) => {
        const target = transform.target as FabricObj;
        const inner = innerImageOf(target);
        const canvas = canvasRef.current;
        if (!inner || !canvas) return false;
        const availX = inner.studioCropAvailX ?? 0;
        const availY = inner.studioCropAvailY ?? 0;
        const ox = availX > 0 ? ((inner.cropX ?? 0) - availX / 2) / (availX / 2) : 0;
        const oy = availY > 0 ? ((inner.cropY ?? 0) - availY / 2) / (availY / 2) : 0;
        target.studioOffsetX = ox;
        target.studioOffsetY = oy;
        onSelectionChange({
          kind: "image",
          id: target.studioId,
          hasPhoto: true,
          shape: target.studioShape ?? "rect",
          frame: target.studioFrame ?? "none",
          frameColor: target.studioFrameColor ?? "#ffffff",
          zoom: target.studioZoom ?? 1,
          offsetX: ox,
          offsetY: oy,
        });
        pushHistory();
        return false;
      },
    });
    group.controls = { ...group.controls, panner: control };
  }

  function pushHistory() {
    const canvas = canvasRef.current;
    if (!canvas || historyRef.current.restoring) return;
    // toObject (not toJSON — this fabric version's toJSON() takes no
    // extra-properties argument) lets us keep the custom studio* props
    // through a save/restore round trip, which loadFromJSON still accepts
    // as a plain object just fine.
    const json = JSON.stringify(
      canvas.toObject([
        "studioId",
        "studioType",
        "studioLabel",
        "studioHasPhoto",
        "studioShape",
        "studioFrameW",
        "studioFrameH",
        "studioFrame",
        "studioFrameColor",
        "studioZoom",
        "studioOffsetX",
        "studioOffsetY",
        "studioElementId",
        "studioColor",
        "studioIsGuide",
      ]),
    );
    const h = historyRef.current;
    // Drop any redo tail once a new change happens.
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push(json);
    if (h.stack.length > 40) h.stack.shift();
    h.index = h.stack.length - 1;
  }

  async function restoreHistory(index: number) {
    const canvas = canvasRef.current;
    const fabric = fabricRef.current;
    if (!canvas || !fabric) return;
    const h = historyRef.current;
    if (index < 0 || index >= h.stack.length) return;
    h.restoring = true;
    await canvas.loadFromJSON(h.stack[index]);
    canvas.renderAll();
    h.index = index;
    h.restoring = false;
    onLayersChange(collectLayers(canvas));
    onSelectionChange({ kind: "none" });
  }

  function findById(id: string): FabricObj | undefined {
    return canvasRef.current?.getObjects().find((o: FabricObj) => o.studioId === id);
  }

  /** Reads the current style (shape/frame/crop) off any frame or photo group — used both to carry a template/placeholder's intended look into its first photo, and to preserve a photo's existing style whenever it's rebuilt (replace image, shape change, frame change, crop change). */
  function styleOf(obj: FabricObj): PhotoStyle {
    return {
      shape: obj.studioShape ?? DEFAULT_PHOTO_STYLE.shape,
      frame: obj.studioFrame ?? DEFAULT_PHOTO_STYLE.frame,
      frameColor: obj.studioFrameColor ?? DEFAULT_PHOTO_STYLE.frameColor,
      zoom: obj.studioZoom ?? DEFAULT_PHOTO_STYLE.zoom,
      offsetX: obj.studioOffsetX ?? DEFAULT_PHOTO_STYLE.offsetX,
      offsetY: obj.studioOffsetY ?? DEFAULT_PHOTO_STYLE.offsetY,
    };
  }

  /** Shared by every "put this photo in that frame" flow (replace-selected, sequential fill, click-to-add, drag-drop): swaps whatever object currently occupies the frame's z-order slot for a fresh photo object with the same id/bounds/angle, carrying over the frame's own shape/border/crop style (a template's chosen shape, or a re-placed photo's own frame/zoom/pan). */
  async function swapFrameForPhoto(fabric: FabricNS, canvas: FabricCanvas, frame: FabricObj, dataUrl: string, styleOverride?: Partial<PhotoStyle>) {
    const id = frame.studioId;
    const style: PhotoStyle = { ...styleOf(frame), ...styleOverride };
    const w = frame.studioFrameW ?? frame.getScaledWidth();
    const h = frame.studioFrameH ?? frame.getScaledHeight();
    const center = frame.getCenterPoint();
    const angle = frame.angle ?? 0;
    const wasActive = canvas.getActiveObject() === frame;
    const idx = canvas.getObjects().indexOf(frame);
    canvas.remove(frame);
    const img = await buildPhotoElement(fabric, { dataUrl, frameId: id, x: center.x - w / 2, y: center.y - h / 2, w, h, angle, style });
    canvas.insertAt(idx, img);
    if (wasActive) canvas.setActiveObject(img);
    canvas.renderAll();
    return img;
  }

  /** Finds the actual fabric.Image child inside a placed photo's group (or, for legacy pre-group photos loaded from an old saved JSON, the object itself) — the only place a photo's original data URL is still available (fabric.Image keeps its own source via getSrc()), so restyling never needs the source data URL tracked separately in React state. */
  function innerImageOf(obj: FabricObj): FabricObj | null {
    if (obj.type === "image") return obj;
    const kids = typeof obj.getObjects === "function" ? obj.getObjects() : (obj._objects ?? []);
    return (kids as FabricObj[]).find((o) => o.type === "image") ?? null;
  }

  // ---- imperative API --------------------------------------------------
  useImperativeHandle(ref, () => ({
    addTextPreset(text, subtitle) {
      const canvas = canvasRef.current;
      const fabric = fabricRef.current;
      if (!canvas || !fabric) return;
      const box = new fabric.Textbox(text, {
        left: canvas.getWidth() / 2,
        top: canvas.getHeight() / 2,
        width: 500,
        fontSize: 48,
        fontFamily: "Heebo, sans-serif",
        fill: "#2d2d2d",
        textAlign: "center",
        originX: "center",
        originY: "center",
        direction: "rtl" as any,
      });
      (box as FabricObj).studioId = `text-${Date.now()}`;
      (box as FabricObj).studioType = "text";
      (box as FabricObj).studioLabel = text;
      canvas.add(box);
      canvas.setActiveObject(box);
      canvas.renderAll();
      if (subtitle) {
        const sub = new fabric.Textbox(subtitle, {
          left: canvas.getWidth() / 2,
          top: canvas.getHeight() / 2 + 60,
          width: 500,
          fontSize: 22,
          fontFamily: "Assistant, sans-serif",
          fill: "#2d2d2d",
          opacity: 0.85,
          textAlign: "center",
          originX: "center",
          originY: "center",
          direction: "rtl" as any,
        });
        (sub as FabricObj).studioId = `text-${Date.now()}-sub`;
        (sub as FabricObj).studioType = "text";
        (sub as FabricObj).studioLabel = subtitle;
        canvas.add(sub);
      }
      pushHistory();
    },
    addCustomText() {
      const canvas = canvasRef.current;
      const fabric = fabricRef.current;
      if (!canvas || !fabric) return;
      const box = new fabric.Textbox("טקסט חדש", {
        left: canvas.getWidth() / 2,
        top: canvas.getHeight() / 2,
        width: 400,
        fontSize: 40,
        fontFamily: "Heebo, sans-serif",
        fill: "#2d2d2d",
        textAlign: "center",
        originX: "center",
        originY: "center",
        direction: "rtl" as any,
      });
      (box as FabricObj).studioId = `text-${Date.now()}`;
      (box as FabricObj).studioType = "text";
      (box as FabricObj).studioLabel = "טקסט חדש";
      canvas.add(box);
      canvas.setActiveObject(box);
      canvas.renderAll();
      pushHistory();
    },
    addElement(elementId) {
      const canvas = canvasRef.current;
      const fabric = fabricRef.current;
      if (!canvas || !fabric) return;
      const lib = findElement(elementId);
      if (!lib) return;
      const color = "#333333";
      fabric.loadSVGFromString(lib.svg(color)).then((parsed) => {
        const group = fabric.util.groupSVGElements(parsed.objects.filter(Boolean) as FabricObj[], parsed.options);
        group.set({ left: canvas.getWidth() / 2, top: canvas.getHeight() / 2, originX: "center", originY: "center" });
        group.scaleToWidth(120);
        (group as FabricObj).studioId = `shape-${Date.now()}`;
        (group as FabricObj).studioType = "shape";
        (group as FabricObj).studioLabel = lib.label;
        (group as FabricObj).studioElementId = elementId;
        (group as FabricObj).studioColor = color;
        canvas.add(group);
        canvas.setActiveObject(group);
        canvas.renderAll();
        pushHistory();
      });
    },
    addStyledCaption(preset) {
      const canvas = canvasRef.current;
      const fabric = fabricRef.current;
      if (!canvas || !fabric) return;
      const text = new fabric.FabricText(preset.text, {
        fontFamily: preset.font,
        fontSize: 32,
        fill: preset.color,
        fontWeight: "bold",
        originX: "center",
        originY: "center",
        left: 0,
        top: 0,
        direction: "rtl" as any,
      });
      const tw = text.width ?? 120;
      const th = text.height ?? 36;
      const pillW = tw + 64;
      const pillH = th + 30;
      const pill = new fabric.Rect({
        width: pillW,
        height: pillH,
        rx: pillH / 2,
        ry: pillH / 2,
        left: 0,
        top: 0,
        originX: "center",
        originY: "center",
        fill: preset.bg,
      });
      const group = new fabric.Group([pill, text], { left: canvas.getWidth() / 2, top: canvas.getHeight() / 2, originX: "center", originY: "center" });
      (group as FabricObj).studioId = `caption-${Date.now()}`;
      (group as FabricObj).studioType = "shape";
      (group as FabricObj).studioLabel = preset.text;
      (group as FabricObj).studioColor = preset.bg;
      (group as FabricObj).studioIsCaption = true;
      canvas.add(group);
      canvas.setActiveObject(group);
      canvas.renderAll();
      pushHistory();
    },
    addPhotoFrame(shape = "rounded") {
      const canvas = canvasRef.current;
      const fabric = fabricRef.current;
      if (!canvas || !fabric) return;
      const w = Math.round(canvas.getWidth() * 0.32);
      const h = Math.round(canvas.getHeight() * 0.28);
      // Stagger repeated clicks a little so adding several frames in a row
      // doesn't stack them exactly on top of each other.
      const n = (canvas.getObjects() as FabricObj[]).filter((o) => o.studioType === "image").length;
      const jitter = (n % 5) * 18;
      const x = Math.round((canvas.getWidth() - w) / 2 + jitter);
      const y = Math.round((canvas.getHeight() - h) / 2 + jitter);
      const el: Extract<StudioElement, { type: "image" }> = { type: "image", id: `photo-${Date.now()}`, x, y, width: w, height: h, shape };
      const group = buildEmptyFrame(fabric, el);
      canvas.add(group);
      canvas.setActiveObject(group);
      canvas.renderAll();
      pushHistory();
    },
    setBackgroundColor(color) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.backgroundColor = color;
      canvas.renderAll();
      pushHistory();
    },
    applyDesignPreset(preset) {
      const canvas = canvasRef.current;
      const fabric = fabricRef.current;
      if (!canvas || !fabric) return;
      canvas.backgroundColor = preset.palette.bg;
      for (const obj of canvas.getObjects() as FabricObj[]) {
        if (obj.studioType === "text") obj.set({ fill: preset.palette.text, fontFamily: obj.studioId?.toString().includes("sub") ? preset.textStyle.bodyFont : preset.textStyle.titleFont });
        if (obj.studioType === "shape") obj.set({ opacity: obj.opacity ?? 1 });
      }
      canvas.renderAll();
      pushHistory();
    },
    async replaceSelectedImage(dataUrl) {
      const canvas = canvasRef.current;
      const fabric = fabricRef.current;
      const active = canvas?.getActiveObject() as FabricObj;
      if (!canvas || !fabric || !active || active.studioType !== "image") return;
      await swapFrameForPhoto(fabric, canvas, active, dataUrl);
      pushHistory();
    },
    async assignImagesSequentially(dataUrls) {
      const canvas = canvasRef.current;
      const fabric = fabricRef.current;
      if (!canvas || !fabric) return;
      const frames = (canvas.getObjects() as FabricObj[]).filter((o) => o.studioType === "image");
      for (let i = 0; i < frames.length && i < dataUrls.length; i++) {
        await swapFrameForPhoto(fabric, canvas, frames[i], dataUrls[i]);
      }
      pushHistory();
    },
    async assignToSelectedOrNextEmptyFrame(dataUrl) {
      const canvas = canvasRef.current;
      const fabric = fabricRef.current;
      if (!canvas || !fabric) return false;
      const active = canvas.getActiveObject() as FabricObj;
      const target =
        active && active.studioType === "image" && !active.studioHasPhoto
          ? active
          : (canvas.getObjects() as FabricObj[]).find((o) => o.studioType === "image" && !o.studioHasPhoto);
      if (!target) return false;
      await swapFrameForPhoto(fabric, canvas, target, dataUrl);
      pushHistory();
      return true;
    },
    async assignImageAtPoint(dataUrl, x, y) {
      const canvas = canvasRef.current;
      const fabric = fabricRef.current;
      if (!canvas || !fabric) return false;
      const target = (canvas.getObjects() as FabricObj[])
        .filter((o) => o.studioType === "image")
        .find((o) => o.containsPoint(new fabric.Point(x, y)));
      if (!target) return false;
      await swapFrameForPhoto(fabric, canvas, target, dataUrl);
      pushHistory();
      return true;
    },
    async updateSelectedShape(shape) {
      const canvas = canvasRef.current;
      const fabric = fabricRef.current;
      const active = canvas?.getActiveObject() as FabricObj;
      if (!canvas || !fabric || !active || active.studioType !== "image") return;
      const w = active.studioFrameW ?? active.getScaledWidth();
      const h = active.studioFrameH ?? active.getScaledHeight();
      const center = active.getCenterPoint();
      const angle = active.angle ?? 0;
      const idx = canvas.getObjects().indexOf(active);
      const inner = innerImageOf(active);
      canvas.remove(active);
      let next: FabricObj;
      if (active.studioHasPhoto && inner) {
        const style: PhotoStyle = { ...styleOf(active), shape };
        next = await buildPhotoElement(fabric, { dataUrl: inner.getSrc(), frameId: active.studioId, x: center.x - w / 2, y: center.y - h / 2, w, h, angle, style });
      } else {
        next = buildEmptyFrame(fabric, { type: "image", id: active.studioId, x: center.x - w / 2, y: center.y - h / 2, width: w, height: h, shape, rotation: angle, frame: active.studioFrame, frameColor: active.studioFrameColor });
      }
      canvas.insertAt(idx, next);
      canvas.setActiveObject(next);
      canvas.renderAll();
      pushHistory();
    },
    async updateSelectedImageStyle(patch) {
      const canvas = canvasRef.current;
      const fabric = fabricRef.current;
      const active = canvas?.getActiveObject() as FabricObj;
      if (!canvas || !fabric || !active || active.studioType !== "image" || !active.studioHasPhoto) return;
      const inner = innerImageOf(active);
      if (!inner) return;
      const w = active.studioFrameW ?? active.getScaledWidth();
      const h = active.studioFrameH ?? active.getScaledHeight();
      const center = active.getCenterPoint();
      const angle = active.angle ?? 0;
      const idx = canvas.getObjects().indexOf(active);
      const style: PhotoStyle = { ...styleOf(active), ...patch };
      canvas.remove(active);
      const next = await buildPhotoElement(fabric, { dataUrl: inner.getSrc(), frameId: active.studioId, x: center.x - w / 2, y: center.y - h / 2, w, h, angle, style });
      canvas.insertAt(idx, next);
      canvas.setActiveObject(next);
      canvas.renderAll();
      pushHistory();
    },
    async resetSelectedImageCrop() {
      const canvas = canvasRef.current;
      const fabric = fabricRef.current;
      const active = canvas?.getActiveObject() as FabricObj;
      if (!canvas || !fabric || !active || active.studioType !== "image" || !active.studioHasPhoto) return;
      const inner = innerImageOf(active);
      if (!inner) return;
      const w = active.studioFrameW ?? active.getScaledWidth();
      const h = active.studioFrameH ?? active.getScaledHeight();
      const center = active.getCenterPoint();
      const angle = active.angle ?? 0;
      const idx = canvas.getObjects().indexOf(active);
      const style: PhotoStyle = { ...styleOf(active), zoom: 1, offsetX: 0, offsetY: 0 };
      canvas.remove(active);
      const next = await buildPhotoElement(fabric, { dataUrl: inner.getSrc(), frameId: active.studioId, x: center.x - w / 2, y: center.y - h / 2, w, h, angle, style });
      canvas.insertAt(idx, next);
      canvas.setActiveObject(next);
      canvas.renderAll();
      pushHistory();
    },
    deleteSelected() {
      const canvas = canvasRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !active) return;
      canvas.remove(active);
      canvas.discardActiveObject();
      canvas.renderAll();
      pushHistory();
    },
    duplicateSelected() {
      const canvas = canvasRef.current;
      const active = canvas?.getActiveObject() as FabricObj;
      if (!canvas || !active) return;
      active.clone().then((clone: FabricObj) => {
        clone.set({ left: (active.left ?? 0) + 24, top: (active.top ?? 0) + 24 });
        clone.studioId = `${active.studioType}-${Date.now()}`;
        clone.studioType = active.studioType;
        clone.studioLabel = active.studioLabel;
        clone.studioHasPhoto = active.studioHasPhoto;
        clone.studioShape = active.studioShape;
        clone.studioFrameW = active.studioFrameW;
        clone.studioFrameH = active.studioFrameH;
        clone.studioFrame = active.studioFrame;
        clone.studioFrameColor = active.studioFrameColor;
        clone.studioZoom = active.studioZoom;
        clone.studioOffsetX = active.studioOffsetX;
        clone.studioOffsetY = active.studioOffsetY;
        clone.studioElementId = active.studioElementId;
        canvas.add(clone);
        canvas.setActiveObject(clone);
        canvas.renderAll();
        pushHistory();
      });
    },
    bringForward() {
      const canvas = canvasRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !active) return;
      canvas.bringObjectForward(active);
      canvas.renderAll();
      pushHistory();
    },
    sendBackward() {
      const canvas = canvasRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !active) return;
      canvas.sendObjectBackwards(active);
      canvas.renderAll();
      pushHistory();
    },
    flipSelected() {
      const canvas = canvasRef.current;
      const active = canvas?.getActiveObject() as FabricObj;
      if (!canvas || !active) return;
      active.set({ flipX: !active.flipX });
      canvas.renderAll();
      pushHistory();
    },
    rotateSelected(deltaDeg) {
      const canvas = canvasRef.current;
      const active = canvas?.getActiveObject() as FabricObj;
      if (!canvas || !active) return;
      active.rotate(((active.angle ?? 0) + deltaDeg) % 360);
      canvas.renderAll();
      pushHistory();
    },
    toggleLockSelected() {
      const canvas = canvasRef.current;
      const active = canvas?.getActiveObject() as FabricObj;
      if (!canvas || !active) return;
      const locked = !active.lockMovementX;
      active.set({ lockMovementX: locked, lockMovementY: locked, lockRotation: locked, lockScalingX: locked, lockScalingY: locked, hasControls: !locked });
      canvas.renderAll();
      onLayersChange(collectLayers(canvas));
    },
    toggleHideLayer(id) {
      const canvas = canvasRef.current;
      const obj = findById(id);
      if (!canvas || !obj) return;
      obj.visible = !obj.visible;
      canvas.renderAll();
      onLayersChange(collectLayers(canvas));
    },
    reorderLayer(id, dir) {
      const canvas = canvasRef.current;
      const obj = findById(id);
      if (!canvas || !obj) return;
      if (dir === "up") canvas.bringObjectForward(obj);
      else canvas.sendObjectBackwards(obj);
      canvas.renderAll();
      onLayersChange(collectLayers(canvas));
      pushHistory();
    },
    selectLayer(id) {
      const canvas = canvasRef.current;
      const obj = findById(id);
      if (!canvas || !obj) return;
      canvas.setActiveObject(obj);
      canvas.renderAll();
    },
    undo() {
      const h = historyRef.current;
      if (h.index > 0) restoreHistory(h.index - 1);
    },
    redo() {
      const h = historyRef.current;
      if (h.index < h.stack.length - 1) restoreHistory(h.index + 1);
    },
    zoom(factor) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const z = Math.min(3, Math.max(0.2, canvas.getZoom() * factor));
      canvas.setZoom(z);
      canvas.setDimensions({ width: template.canvas.width * z, height: template.canvas.height * z });
      canvas.renderAll();
    },
    updateSelectedText(props) {
      const canvas = canvasRef.current;
      const active = canvas?.getActiveObject() as FabricObj;
      if (!canvas || !active || active.studioType !== "text") return;
      const patch: FabricObj = {};
      if (props.text !== undefined) patch.text = props.text;
      if (props.fontFamily !== undefined) patch.fontFamily = props.fontFamily;
      if (props.fontSize !== undefined) patch.fontSize = props.fontSize;
      if (props.color !== undefined) patch.fill = props.color;
      if (props.bold !== undefined) patch.fontWeight = props.bold ? "bold" : "normal";
      if (props.align !== undefined) patch.textAlign = props.align;
      active.set(patch);
      if (props.text !== undefined) active.studioLabel = props.text;
      canvas.renderAll();
      onLayersChange(collectLayers(canvas));
      pushHistory();
    },
    updateSelectedColor(color) {
      const canvas = canvasRef.current;
      const active = canvas?.getActiveObject() as FabricObj;
      if (!canvas || !active) return;
      if (active.studioType === "shape") {
        if (active.studioIsCaption) {
          // Caption sticker: recolor the pill background, not the group
          // itself (a Group has no fill of its own) — leave the text color
          // alone so it stays readable against the new background.
          const kids = typeof active.getObjects === "function" ? active.getObjects() : (active._objects ?? []);
          const pill = (kids as FabricObj[]).find((o) => o.type === "rect");
          pill?.set({ fill: color });
        } else {
          active.set({ fill: color });
        }
        active.studioColor = color;
      } else if (active.studioType === "image" && !active.studioHasPhoto) {
        // empty frame group: recolor its stroke, not fill, so it stays legible
        for (const child of active._objects ?? []) child.set({ stroke: color });
      }
      canvas.renderAll();
      pushHistory();
    },
    async exportPNG(multiplier = 3) {
      const canvas = canvasRef.current;
      if (!canvas) return "";
      // Custom Hebrew webfonts (loaded via this route's own <link>) might
      // not be ready yet if the user downloads right after landing —
      // wait, or the export can silently fall back to a system font for
      // one render, same risk already fixed in the free collage-maker.
      try {
        await document.fonts.ready;
      } catch {
        // best effort — proceed anyway
      }
      const savedZoom = canvas.getZoom();
      canvas.setZoom(1);
      canvas.setDimensions({ width: template.canvas.width, height: template.canvas.height });
      canvas.renderAll();
      const url = canvas.toDataURL({ format: "png", multiplier, quality: 1 });
      canvas.setZoom(savedZoom);
      canvas.setDimensions({ width: template.canvas.width * savedZoom, height: template.canvas.height * savedZoom });
      canvas.renderAll();
      return url;
    },
    getLayers() {
      const canvas = canvasRef.current;
      return canvas ? collectLayers(canvas) : [];
    },
  }));

  return (
    <div ref={wrapRef} className="inline-block bg-white shadow-2xl rounded-sm" style={{ lineHeight: 0 }}>
      <canvas ref={canvasElRef} />
    </div>
  );
});

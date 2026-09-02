// The real editing engine — a fabric.js canvas wrapped for React, exposed
// to StudioEditor via an imperative handle (StudioCanvasHandle) so the
// surrounding toolbar/panels stay simple, dumb UI that just calls methods
// here. fabric.js needs a real DOM, so it's imported dynamically inside
// useEffect (client-only) — this file never touches `fabric` at module
// scope, which keeps TanStack Start's SSR pass safe.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { shapeClipPath } from "@/lib/collage-data";
import { findElement, type DesignPreset } from "@/lib/collage-studio-library";
import type { CollageTemplate, StudioElement, StudioImageShape } from "@/lib/collage-studio-data";

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
  | { kind: "image"; id: string; hasPhoto: boolean }
  | { kind: "text"; id: string; text: string; fontFamily: string; fontSize: number; color: string; bold: boolean }
  | { kind: "shape"; id: string; color: string };

export type StudioCanvasHandle = {
  addTextPreset: (text: string, subtitle?: string) => void;
  addCustomText: () => void;
  addElement: (elementId: string) => void;
  setBackgroundColor: (color: string) => void;
  applyDesignPreset: (preset: DesignPreset) => void;
  replaceSelectedImage: (dataUrl: string) => Promise<void>;
  assignImagesSequentially: (dataUrls: string[]) => Promise<void>;
  /** Click-to-add flow: fills the selected empty frame, else the first empty frame, else does nothing (no frame left to fill). Returns whether it found somewhere to put the photo. */
  assignToSelectedOrNextEmptyFrame: (dataUrl: string) => Promise<boolean>;
  /** Drag-and-drop flow: fills whichever frame (empty or already filled) is under the given canvas-space point. */
  assignImageAtPoint: (dataUrl: string, x: number, y: number) => Promise<boolean>;
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
        onSelectionChange({ kind: "image", id: obj.studioId, hasPhoto: Boolean(obj.studioHasPhoto) });
      } else if (kind === "shape") {
        onSelectionChange({ kind: "shape", id: obj.studioId, color: obj.fill ?? "#000000" });
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
    return group;
  }

  async function makePhotoObject(fabric: FabricNS, dataUrl: string, frameId: string, shape: StudioImageShape, x: number, y: number, w: number, h: number, angle: number): Promise<FabricObj> {
    const img = await fabric.FabricImage.fromURL(dataUrl);
    const scale = Math.max(w / (img.width || 1), h / (img.height || 1));
    img.set({
      left: x + w / 2,
      top: y + h / 2,
      originX: "center",
      originY: "center",
      angle,
      scaleX: scale,
      scaleY: scale,
    });
    const d = unitClipPathD(shape, w, h);
    if (d) {
      const clip = new fabric.Path(d, { originX: "center", originY: "center" });
      // clipPath coordinates are in the target object's own (unscaled)
      // local space, so undo the image's own scale for the clip shape.
      clip.set({ scaleX: 1 / scale, scaleY: 1 / scale });
      img.clipPath = clip;
    }
    (img as FabricObj).studioId = frameId;
    (img as FabricObj).studioType = "image";
    (img as FabricObj).studioLabel = "תמונה";
    (img as FabricObj).studioHasPhoto = true;
    (img as FabricObj).studioShape = shape;
    (img as FabricObj).studioFrameW = w;
    (img as FabricObj).studioFrameH = h;
    return img;
  }

  function pushHistory() {
    const canvas = canvasRef.current;
    if (!canvas || historyRef.current.restoring) return;
    // toObject (not toJSON — this fabric version's toJSON() takes no
    // extra-properties argument) lets us keep the custom studio* props
    // through a save/restore round trip, which loadFromJSON still accepts
    // as a plain object just fine.
    const json = JSON.stringify(canvas.toObject(["studioId", "studioType", "studioLabel", "studioHasPhoto", "studioShape", "studioFrameW", "studioFrameH", "studioElementId", "studioColor", "studioIsGuide"]));
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

  /** Shared by every "put this photo in that frame" flow (replace-selected, sequential fill, click-to-add, drag-drop): swaps whatever object currently occupies the frame's z-order slot for a fresh photo object with the same id/shape/bounds/angle. */
  async function swapFrameForPhoto(fabric: FabricNS, canvas: FabricCanvas, frame: FabricObj, dataUrl: string) {
    const id = frame.studioId;
    const shape: StudioImageShape = frame.studioShape ?? "rect";
    const w = frame.studioFrameW ?? frame.getScaledWidth();
    const h = frame.studioFrameH ?? frame.getScaledHeight();
    const center = frame.getCenterPoint();
    const angle = frame.angle ?? 0;
    const wasActive = canvas.getActiveObject() === frame;
    const idx = canvas.getObjects().indexOf(frame);
    canvas.remove(frame);
    const img = await makePhotoObject(fabric, dataUrl, id, shape, center.x - w / 2, center.y - h / 2, w, h, angle);
    canvas.insertAt(idx, img);
    if (wasActive) canvas.setActiveObject(img);
    canvas.renderAll();
    return img;
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
        active.set({ fill: color });
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

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Minus, Plus, Crop } from "lucide-react";

const VIEWPORT = 320; // on-screen crop frame, px — square, matches the catalog's own square item tiles
const OUTPUT = 1000; // exported crop size, px

type Props = {
  imageUrl: string;
  trigger: React.ReactNode;
  /** Called with the cropped JPEG blob when the admin confirms — the caller uploads it and updates image_url/image_hash. */
  onSave: (blob: Blob) => Promise<void> | void;
};

/**
 * A small self-contained zoom/pan/crop tool for one square image, opened
 * from the item form's "תמונה" field. Deliberately built from a plain
 * <canvas> + pointer events instead of a cropper library — matches
 * image-compress.ts's existing canvas-only approach elsewhere in the app,
 * no new dependency.
 *
 * The math: the image is always displayed at least large enough to cover
 * the square viewport (object-fit: cover, base scale), then the zoom
 * slider multiplies on top of that. Panning is clamped so the image can
 * never show empty space inside the frame. "שמירה" maps the visible
 * viewport rectangle back to source-image pixel coordinates and draws
 * exactly that rectangle onto an OUTPUT×OUTPUT canvas.
 */
export function ImageCropDialog({ imageUrl, trigger, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1); // multiplier on top of the base "cover" scale, 1..4
  const [pan, setPan] = useState({ x: 0, y: 0 }); // screen px, top-left of the displayed image relative to the viewport
  const [saving, setSaving] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!open) return;
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setNatural(null);
  }, [open, imageUrl]);

  const baseScale = natural ? Math.max(VIEWPORT / natural.w, VIEWPORT / natural.h) : 1;
  const scale = baseScale * zoom;
  const dispW = natural ? natural.w * scale : VIEWPORT;
  const dispH = natural ? natural.h * scale : VIEWPORT;

  const clampPan = (x: number, y: number) => ({
    x: Math.min(0, Math.max(VIEWPORT - dispW, x)),
    y: Math.min(0, Math.max(VIEWPORT - dispH, y)),
  });

  const onImgLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
  };

  const changeZoom = (next: number) => {
    const z = Math.min(4, Math.max(1, next));
    setZoom(z);
    // Re-clamp with the NEW scale so zooming out never leaves a gap.
    const newBase = natural ? Math.max(VIEWPORT / natural.w, VIEWPORT / natural.h) : 1;
    const newScale = newBase * z;
    const newDispW = natural ? natural.w * newScale : VIEWPORT;
    const newDispH = natural ? natural.h * newScale : VIEWPORT;
    setPan((p) => ({
      x: Math.min(0, Math.max(VIEWPORT - newDispW, p.x)),
      y: Math.min(0, Math.max(VIEWPORT - newDispH, p.y)),
    }));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan(clampPan(dragRef.current.panX + dx, dragRef.current.panY + dy));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const saveCrop = async () => {
    const img = imgRef.current;
    if (!img || !natural) return;
    setSaving(true);
    try {
      // Screen coords [0,VIEWPORT]x[0,VIEWPORT] -> source-image pixel coords.
      const sx = -pan.x / scale;
      const sy = -pan.y / scale;
      const sSize = VIEWPORT / scale;
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("שגיאה בעיבוד התמונה");
      ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUTPUT, OUTPUT);
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("שגיאה בעיבוד התמונה");
      await onSave(blob);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">התאמת תמונה</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className="relative mx-auto overflow-hidden rounded-xl bg-cream touch-none select-none cursor-grab active:cursor-grabbing"
            style={{ width: VIEWPORT, height: VIEWPORT }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* Crossorigin so a same-signed-URL image can still be read back into a canvas for export. */}
            <img
              ref={imgRef}
              src={imageUrl}
              alt=""
              crossOrigin="anonymous"
              onLoad={onImgLoad}
              draggable={false}
              className="absolute top-0 left-0 pointer-events-none"
              style={{ width: dispW, height: dispH, transform: `translate(${pan.x}px, ${pan.y}px)` }}
            />
          </div>

          <div className="flex items-center gap-3 justify-center">
            <Button type="button" variant="outline" size="icon" className="rounded-full h-8 w-8" onClick={() => changeZoom(zoom - 0.2)}>
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <input
              type="range"
              min={1}
              max={4}
              step={0.05}
              value={zoom}
              onChange={(e) => changeZoom(Number(e.target.value))}
              className="w-40"
            />
            <Button type="button" variant="outline" size="icon" className="rounded-full h-8 w-8" onClick={() => changeZoom(zoom + 0.2)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">גררי כדי להזיז, השתמשי במחוון כדי להגדיל/להקטין</p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>ביטול</Button>
          <Button onClick={saveCrop} disabled={saving || !natural}>
            {saving ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Crop className="h-4 w-4 ml-2" />}
            שמירת חיתוך
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

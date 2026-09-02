// Gallery card for one template — the preview is a real SVG rendered
// straight from the template's own element data (placeholder gradients
// for photo frames, the actual title font/text, the actual decorative
// elements) rather than a static screenshot, so what you see is what
// picking "השתמשי בתבנית" actually opens.
import { Link } from "@tanstack/react-router";
import { shapeClipPath } from "@/lib/collage-data";
import { findElement } from "@/lib/collage-studio-library";
import { countImageElements, TEMPLATE_CATEGORIES, type CollageTemplate } from "@/lib/collage-studio-data";
import { Camera } from "lucide-react";

const GRADIENTS = ["#e9d5cf,#f3e6dc", "#d7e3d2,#eef4ea", "#dce5ef,#eef3f8", "#ecdcdc,#f6ecec", "#e6dce9,#f2ecf5"];

export function TemplatePreview({ template, className }: { template: CollageTemplate; className?: string }) {
  const { width, height } = template.canvas;
  let gradIdx = 0;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} style={{ background: template.background.color }}>
      <defs>
        {GRADIENTS.map((g, i) => {
          const [c1, c2] = g.split(",");
          return (
            <linearGradient key={i} id={`tpl-grad-${template.id}-${i}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={c1} />
              <stop offset="100%" stopColor={c2} />
            </linearGradient>
          );
        })}
        {template.elements
          .filter((e) => e.type === "image" && e.shape && e.shape !== "rect")
          .map((e: any) => {
            const d = shapeClipPath(e.shape, { x: e.x, y: e.y, w: e.width, h: e.height });
            if (!d) return null;
            return (
              <clipPath key={e.id} id={`tpl-clip-${template.id}-${e.id}`}>
                <path d={d} />
              </clipPath>
            );
          })}
      </defs>
      {template.elements.map((el) => {
        if (el.type === "image") {
          const grad = `url(#tpl-grad-${template.id}-${gradIdx++ % GRADIENTS.length})`;
          const clipId = el.shape && el.shape !== "rect" ? `tpl-clip-${template.id}-${el.id}` : undefined;
          return <rect key={el.id} x={el.x} y={el.y} width={el.width} height={el.height} fill={grad} clipPath={clipId ? `url(#${clipId})` : undefined} />;
        }
        if (el.type === "text") {
          return (
            <text key={el.id} x={el.x} y={el.y} textAnchor={el.align === "right" ? "end" : el.align === "left" ? "start" : "middle"} fontSize={el.fontSize} fontFamily={el.fontFamily} fill={el.color} fontWeight={el.bold ? "bold" : "normal"}>
              {el.text}
            </text>
          );
        }
        const lib = findElement(el.elementId);
        if (!lib) return null;
        return (
          <g key={el.id} transform={`translate(${el.x} ${el.y}) rotate(${el.rotation ?? 0})`} opacity={el.opacity ?? 1} dangerouslySetInnerHTML={{ __html: lib.svg(el.color ?? "#333").replace(/<svg[^>]*>|<\/svg>/g, "") }} />
        );
      })}
    </svg>
  );
}

export function TemplateCard({ template }: { template: CollageTemplate }) {
  const categoryLabel = TEMPLATE_CATEGORIES.find((c) => c.id === template.category)?.label ?? template.category;
  return (
    <Link
      to="/collage-studio/$templateId"
      params={{ templateId: template.id }}
      className="group block bg-white rounded-2xl overflow-hidden border border-black/5 hover:shadow-xl transition-all hover:-translate-y-1"
    >
      <div className="aspect-[4/5] overflow-hidden bg-[#f4f1ea]">
        <TemplatePreview template={template} className="w-full h-full" />
      </div>
      <div className="p-4">
        <div className="text-[10px] tracking-[0.2em] uppercase text-forest/70 mb-1">{categoryLabel}</div>
        <h3 className="font-display text-lg text-primary mb-1 truncate">{template.name}</h3>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Camera className="h-3 w-3" /> {countImageElements(template)} תמונות
        </div>
        <span className="inline-flex items-center justify-center w-full rounded-full bg-primary text-primary-foreground text-sm py-2 group-hover:bg-primary/90 transition-colors">
          השתמשי בתבנית
        </span>
      </div>
    </Link>
  );
}

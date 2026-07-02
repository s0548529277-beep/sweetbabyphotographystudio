import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { normalizeImageUrl } from "@/lib/images";

type ProductImageProps = {
  imageUrl?: string | null;
  alt: string;
  className?: string;
  fallbackClassName?: string;
};

export function ProductImage({
  imageUrl,
  alt,
  className = "h-full w-full object-cover",
  fallbackClassName = "h-10 w-10",
}: ProductImageProps) {
  const src = normalizeImageUrl(imageUrl);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center text-foreground/25" aria-label={alt}>
        <ImageIcon className={fallbackClassName} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
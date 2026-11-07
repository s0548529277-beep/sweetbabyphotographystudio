import type { ReactNode } from "react";
import botHeart from "@/assets/heart-gradient-small.png";
import michalHeart from "@/assets/michal-heart.png";

export type HeartKind = "bot" | "michal";

/**
 * The site's hearts: the colourful gradient heart of the bot for everything
 * about the studio / props, and Michal's own heart (from her contract) for
 * everything about the photography. Replaces the pink 💗 emoji.
 */
export function Heart({ kind = "bot", className = "" }: { kind?: HeartKind; className?: string }) {
  const michal = kind === "michal";
  return (
    <img
      src={michal ? michalHeart : botHeart}
      alt="♥"
      width={michal ? 19 : 16}
      height={16}
      className={`inline-block h-4 ${michal ? "w-[19px]" : "w-4"} align-text-bottom mx-0.5 ${className}`}
    />
  );
}

/** Renders a plain string, swapping every 💗 for the heart image. */
export function HeartText({ text, kind = "bot" }: { text: string; kind?: HeartKind }): ReactNode {
  const parts = text.split("💗");
  if (parts.length === 1) return text;
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 ? <Heart kind={kind} /> : null}
        </span>
      ))}
    </>
  );
}

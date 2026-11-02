import botHeartAsset from "@/assets/heart-gradient-small.png";
import michalHeartAsset from "@/assets/michal-heart.png";

/**
 * Hearts for emails (email clients can't use the 💗 emoji style we want, and
 * must have absolute URLs): the colourful gradient heart of the bot for
 * studio / general mails, and Michal's own crimson heart (from her logo) for
 * every photographer-brand mail.
 */
const SITE = "https://sweetbabyphoto.shop";
export const BOT_HEART_URL = `${SITE}${botHeartAsset}`;
export const MICHAL_HEART_URL = `${SITE}${michalHeartAsset}`;

export type HeartKind = "bot" | "michal";

/** Inline heart image sized to sit in a line of text (or as a divider when `px` is bigger). */
export function heartImg(kind: HeartKind, px = 14): string {
  const url = kind === "michal" ? MICHAL_HEART_URL : BOT_HEART_URL;
  const w = kind === "michal" ? Math.round(px * 1.19) : px; // Michal's heart is slightly wider than tall
  return `<img src="${url}" alt="♥" width="${w}" height="${px}" style="display:inline-block;width:${w}px;height:${px}px;vertical-align:-2px;border:0;margin:0 2px">`;
}

/** Replaces every 💗 / ♥ character in an HTML string with the heart image. */
export function withEmailHearts(html: string, kind: HeartKind, px = 14): string {
  return html.split("💗").join(heartImg(kind, px));
}

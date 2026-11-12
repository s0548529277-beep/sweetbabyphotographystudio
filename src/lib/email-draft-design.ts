/**
 * Designed reply-draft templates for the site's automatic email assistant
 * (email-drafts.server.ts). Replaces the owner's Claude scheduled task
 * "טיוטות תשובה לכל פנייה" (2026-10-27) — same three brands, same price
 * lists, polished layout. Email-safe: tables + inline styles only, RTL.
 * The AI only writes the text (paragraphs / short lists); everything visual
 * is built here, so every draft looks the same and nothing is invented.
 */

import michalWordmark from "@/assets/michal-logo-wordmark.png";
import sweetbabyLogo from "@/assets/logo-green-hero.png";
import { heartImg, withEmailHearts, type HeartKind } from "@/lib/email-hearts";

// Absolute URLs — email clients can't resolve relative/build-hashed paths
// (same approach as the contract emails, photoContract.ts).
/** "MICHAL SIBONI" as an image in the SAME font as the animated signature (Montserrat, light, wide-spaced) — mail clients ignore web fonts. */
const WORDMARK_IMG = `<div style="line-height:0"><img src="https://sweetbabyphoto.shop/email/michal-wordmark.png" alt="MICHAL SIBONI" width="250" style="width:250px;max-width:75%;height:auto;border:0;display:inline-block"></div>`;
const MICHAL_LOGO_URL = `https://sweetbabyphoto.shop${michalWordmark}`;
// Michal's FIXED email signature (the animated GIF from her Gmail signature: circle photo + "MICHAL SIBONI",
// phone, mail, site and services) — re-coloured to the card colour below by scripts/make-email-signature-gif.py
// (source: Drive "michal-siboni-signature-final-cream2.gif"; first frame = a finished frame for Outlook / blocked
// images). Under it come her three signature buttons, exactly as in her Gmail signature.
const SIGNATURE_GIF_URL = "https://sweetbabyphoto.shop/email/michal-signature.gif";
const STUDIO_SIGNATURE_GIF_URL = "https://sweetbabyphoto.shop/email/studio-signature.gif";
const STUDIO_WAZE = "https://waze.com/ul?q=%D7%AA%D7%9C%D7%9E%D7%95%D7%93%20%D7%99%D7%A8%D7%95%D7%A9%D7%9C%D7%9E%D7%99%2024%2C%20%D7%91%D7%99%D7%AA%20%D7%A9%D7%9E%D7%A9&navigate=yes";
const SITE_PHONE = "053-418-1051";
const SITE_MAIL = "m0548529277@gmail.com";
const SIG_BROWN = "#3e3029";
const SIG_CREAM = "#f7f3ee";
const STUDIO_LOGO_URL = `https://sweetbabyphoto.shop${sweetbabyLogo}`;

export type DraftBrand = "photographer" | "studio" | "general";
export type PriceList = "newborn" | "outdoor" | "both" | "studio" | "none";

type Theme = {
  pageBg: string;
  cardBg: string;
  border: string;
  headerBg: string;
  wordmark: string;
  accent: string;
  text: string;
  soft: string;
  highlight: string;
};

const THEMES: Record<DraftBrand, Theme> = {
  // Contract-email palette (owner liked it, 2026-10-30), softened 2026-11-04: a light sand frame instead of
  // the full brown one. Personal ("general") replies use the same look. cardBg is Michal's brand cream
  // (#f7f3ee) and must equal the colour the signature GIF was re-coloured to (scripts/make-email-signature-gif.py).
  photographer: {
    pageBg: "#e8dccb",
    cardBg: "#f7f3ee",
    border: "#e2cfb6",
    headerBg: "",
    wordmark: "#c23b6d",
    accent: "#c23b6d",
    text: "#5a4433",
    soft: "#8a6a52",
    highlight: "#fbeef2",
  },
  studio: {
    pageBg: "#2d3d2b",
    cardBg: "#f8ede4",
    border: "#e3cfc0",
    headerBg: "",
    wordmark: "#1c3a2e",
    accent: "#2d3d2b",
    text: "#2d3d2b",
    soft: "#6b5a4c",
    highlight: "#f3ddd2",
  },
  general: {
    pageBg: "#f7f7f7",
    cardBg: "#ffffff",
    border: "#e5e5e5",
    headerBg: "",
    wordmark: "#333333",
    accent: "#333333",
    text: "#333333",
    soft: "#777777",
    highlight: "#f3f3f3",
  },
};

const FONT = "Arial,Helvetica,sans-serif";

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * The AI's body text → safe HTML. Supported: blank-line paragraphs,
 * lines starting with "- " → bullet list, "## title" → small heading,
 * "> text" → highlighted box, **bold**. Everything else is escaped.
 */
export function bodyToHtml(body: string, t: Theme): string {
  const blocks = body.replace(/\r/g, "").split(/\n{2,}/);
  const WRAP = "overflow-wrap:anywhere;word-break:break-word;";
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      // placeholders for the owner ("[[מיכל: …]]") are shown as a highlighted note, never as mail text
      .replace(
        /\[\[(.+?)\]\]/g,
        `<span style="background:#fff3c4;color:#7a5a00;border-radius:6px;padding:1px 6px;font-weight:bold">✎ לפני שליחה: $1</span>`,
      )
      // long links wrap instead of running off the card
      .replace(
        /(https?:\/\/[^\s<]+)/g,
        `<a href="$1" style="color:${t.accent};${WRAP}direction:ltr;unicode-bidi:isolate">$1</a>`,
      );
  return blocks
    .map((b) => {
      const lines = b.split("\n").filter((l) => l.trim());
      if (!lines.length) return "";
      if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
        return `<ul style="padding-right:20px;margin:6px 0 12px">${lines
          .map((l) => `<li style="margin:3px 0">${inline(l.replace(/^\s*[-•]\s+/, ""))}</li>`)
          .join("")}</ul>`;
      }
      if (/^##\s+/.test(lines[0]) && lines.length === 1) {
        return `<h3 style="color:${t.accent};font-size:17px;margin:20px 0 6px;font-family:${FONT}">${inline(lines[0].replace(/^##\s+/, ""))}</h3>`;
      }
      if (lines.every((l) => /^>\s?/.test(l))) {
        return `<div style="background:${t.highlight};border-radius:12px;padding:12px 16px;margin:12px 0">${lines
          .map((l) => inline(l.replace(/^>\s?/, "")))
          .join("<br>")}</div>`;
      }
      return `<p style="margin:0 0 12px;${WRAP}">${lines.map(inline).join("<br>")}</p>`;
    })
    .join("");
}

type Pkg = { name: string; price: string; lines: string[]; featured?: boolean };

const NEWBORN: { title: string; note: string; pkgs: Pkg[]; addons: string } = {
  title: "מחירון ניו בורן",
  note: "בצילומים נחליט על סוג האווירה, אביזרים וביגוד לפי הטעם שלך, כך שהבייבי יהיה מובלט בצורה נעימה ורכה עד ליצירת תמונה מושלמת.",
  pkgs: [
    { name: "חבילה מיני", price: "970₪", lines: ["2 סטים", "8 תמונות מעובדות", "קולאז׳ מעוצב"] },
    {
      name: "חבילה מפנקת",
      price: "1,300₪",
      lines: ["3 סטים", "10 תמונות מעובדות", "סט הורים / אחים", "קולאז׳ מעוצב", "אלבום"],
      featured: true,
    },
    {
      name: "חבילה חלומית",
      price: "1,650₪",
      lines: ["4 סטים", "15 תמונות מעובדות", "סט הורים", "סט אחים", "קולאז׳ מעוצב", "אלבום"],
    },
  ],
  addons: "תוספות: אלבום 280₪ · תמונה נוספת 40₪ · תוספת צילומי אחים 200₪",
};

/** Side offer for whoever asks for a photographer in the studio — a draft only, Michal sends it by hand. */
const STUDIO_OFFER: { title: string; note: string; pkgs: Pkg[]; addons: string } = {
  title: "הצעה לצילום בסטודיו",
  note: "צילום ניו בורן בסטודיו הבוטיק של סוויט בייבי בבית שמש.",
  pkgs: [{ name: "חבילת מיני לסטודיו", price: "750₪", lines: ["2 סטים", "8 תמונות מעובדות", "קולאז׳ מעוצב"], featured: true }],
  addons: "מעוניינת בחבילה גדולה יותר? אשמח לשלוח גם את המחירון המלא.",
};

const OUTDOOR: { title: string; note: string; pkgs: Pkg[]; addons: string } = {
  title: "מחירון צילומי חוץ וסטודיו",
  note: "משפחה, חלאקה, גיל שנה וילדים — בסטודיו או בחוץ.",
  pkgs: [
    { name: "קסם", price: "1,250₪", lines: ["3 סשנים", "15 תמונות מעובדות בעיבוד אומנותי", "כל התמונות באיכות", "קולאז׳ מעוצב"] },
    {
      name: "פופולארית",
      price: "1,750₪",
      lines: ["שיחת סטיילינג", "4 סשנים", "25 תמונות מעובדות בעיבוד אומנותי", "כל התמונות באיכות", "קולאז׳ מעוצב", "אלבום דיגיטלי, כריכת בוק 21/56"],
      featured: true,
    },
    {
      name: "חלום",
      price: "2,350₪",
      lines: ["5 סשנים — חוץ + סטודיו", "30 תמונות מעובדות בעיבוד אומנותי", "כל התמונות באיכות", "קולאז׳ מעוצב", "אלבום דיגיטלי, כריכת בוק 21/56"],
    },
  ],
  addons: "צילום שאינו בחבילה — בהתאמה אישית, בפנייה.",
};

const PKG_LABELS: Record<string, string[]> = {
  newborn: ["MINI", "PAMPER", "LUXURY"],
  outdoor: ["MAGIC", "POPULAR", "DREAM"],
  studio: ["STUDIO"],
};

/**
 * Photographer price list in the style of the owner's newborn price-list image (11-08): an arched photo on top of
 * every card, a small English label, the package name, a thin divider, the contents and a boxed price; the
 * featured card is dark brown with cream text. Cards are inline-blocks (not table cells) so on a phone they wrap.
 * Photos from `/email/newborn-card-*.jpg` are already cut into an arch (corners = card colour); any other photo
 * gets the arch from CSS (fixed height + big top radius). Without a photo the card starts at the label.
 */
function priceBlock(list: typeof NEWBORN, t: Theme, kind: keyof typeof PKG_LABELS = "newborn", photos: string[] = []): string {
  const DARK = "#4a3a2e";
  const CREAM = "#f7f3ee";
  const card = (p: Pkg, i: number) => {
    const f = !!p.featured;
    const fg = f ? CREAM : t.text;
    const photo = photos.length ? photos[i % photos.length] : "";
    const baked = photo.includes("/email/newborn-card-") || photo.includes("/email/outdoor-card-");
    const label = (PKG_LABELS[kind] ?? [])[i] ?? "";
    const img = photo
      ? `<tr><td style="padding:0;text-align:center;background:${CREAM}"><img src="${esc(photo)}" alt="" width="190"${baked ? "" : ' class="cp"'} style="width:100%;max-width:100%;${baked ? "height:auto;" : "height:170px;object-fit:cover;border-radius:999px 999px 0 0;"}display:block;border:0"></td></tr>`
      : "";
    return `<div class="pc" style="display:inline-block;vertical-align:top;width:31%;min-width:150px;box-sizing:border-box;padding:6px;direction:rtl;text-align:center;font-size:15px;line-height:1.5;-webkit-text-size-adjust:100%;text-size-adjust:100%">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${f ? DARK : "#fbf8f3"};border-radius:${photo ? "0 0" : "14px 14px"} 14px 14px;overflow:hidden">
      ${img}
      <tr><td style="padding:16px 10px 6px;text-align:center">
        ${label ? `<div dir="ltr" style="font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;letter-spacing:4px;color:${f ? "#d8c3a8" : t.soft}">${label}</div>` : ""}
        <div style="font-size:19px;line-height:1.4;color:${f ? CREAM : SIG_BROWN};margin-top:4px">${esc(p.name)}</div>
        <div style="height:1px;width:34px;background:${f ? "#d8c3a8" : "#c4a47e"};margin:11px auto"></div>
        ${p.lines.map((l) => `<div style="font-size:13px;color:${fg};line-height:1.8">${esc(l)}</div>`).join("")}
      </td></tr>
      <tr><td style="padding:10px 10px 20px;text-align:center">
        <span style="display:inline-block;white-space:nowrap;${f ? `background:${CREAM};color:${DARK};border:1px solid ${CREAM}` : `background:transparent;color:${DARK};border:1px solid ${DARK}`};font-size:19px;line-height:1.4;padding:7px 24px;border-radius:3px"><span style="font-size:15px;line-height:1.4">&#8362;</span> ${esc(p.price.replace(/[₪\s]/g, ""))}</span>
      </td></tr>
    </table>
  </div>`;
  };
  // On a phone (Gmail / Apple Mail honour this) every card takes the full width instead of a narrow strip.
  const phoneCss = `<style>@media only screen and (max-width:520px){.pc{width:100%!important;min-width:0!important}.pc img.cp{height:230px!important}}</style>`;
  const addons = list.addons.replace(/^תוספות:\s*/, "").split(" · ").join("  |  ");
  return `<div style="margin:26px 0 10px">${phoneCss}
    <div dir="ltr" style="text-align:center;font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:5px;color:${t.soft}">${kind === "outdoor" ? "FAMILY &amp; KIDS" : kind === "studio" ? "STUDIO" : "NEWBORN"}</div>
    <h3 style="color:${SIG_BROWN};font-size:24px;font-weight:normal;margin:6px 0 6px;text-align:center;font-family:${FONT}">${esc(list.title)}</h3>
    <p style="margin:0 auto 14px;max-width:520px;text-align:center;font-size:13px;line-height:1.7;color:${t.soft}">${esc(list.note)}</p>
    <div dir="rtl" style="text-align:center;font-size:0;line-height:0;-webkit-text-size-adjust:100%">${list.pkgs.map(card).join("")}</div>
    <p style="margin:12px 0 0;text-align:center;font-size:12px;color:${t.soft};line-height:1.7">${esc(addons)}</p>
  </div>`;
}

function photoStrip(urls: string[], big: boolean): string {
  if (!urls.length) return "";
  if (big) {
    const rows: string[] = [];
    for (let i = 0; i < urls.length; i += 2) {
      rows.push(
        `<tr>${urls
          .slice(i, i + 2)
          .map(
            (u) =>
              `<td width="50%" style="padding:4px"><img src="${esc(u)}" alt="" width="260" style="width:100%;height:160px;object-fit:cover;border-radius:12px;display:block"></td>`,
          )
          .join("")}</tr>`,
      );
    }
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px">${rows.join("")}</table>`;
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr>${urls
    .slice(0, 4)
    .map(
      (u) =>
        `<td width="25%" style="padding:3px"><img src="${esc(u)}" alt="" width="140" style="width:100%;height:110px;object-fit:cover;border-radius:10px;display:block"></td>`,
    )
    .join("")}</tr></table>`;
}

const SIGNATURES: Record<DraftBrand, { name: string; lines: string[]; site?: { label: string; url: string } }> = {
  photographer: {
    name: "מיכל סיבוני",
    lines: ["צילומי ניו בורן ומשפחה", "053-418-1051"],
    site: { label: "michalsiboni.co.il", url: "https://michalsiboni.co.il" },
  },
  studio: {
    name: "סטודיו Sweetbaby · מיכל סיבוני",
    lines: ["תלמוד ירושלמי 24, בית שמש", "054-8529277"],
    site: { label: "sweetbabyphoto.shop", url: "https://sweetbabyphoto.shop" },
  },
  general: { name: "מיכל סיבוני", lines: ["053-418-1051"] },
};

export { RB_STUDIO, RB_MICHAL, RB2_STUDIO, RB2_MICHAL, RB_CSS } from "@/lib/email-design";
import { RB_STUDIO, RB_MICHAL, RB_CSS } from "@/lib/email-design";

/** Animated (colour-rotating) button image — e-mail clients ignore CSS animation, a GIF wrapped in a link works everywhere. */
function animBtn(href: string, gif: string, label: string): string {
  return `<td width="33%" align="center" valign="top" style="padding:0 2px;line-height:0"><a href="${href}" style="display:block;text-decoration:none"><img src="https://sweetbabyphoto.shop/email/${gif}" alt="${label}" width="160" height="50" style="width:100%;max-width:160px;height:auto;border:0;display:block;margin:0 auto"></a></td>`;
}

/** Three animated buttons in ONE row (a table: works in Gmail Android, which ignores percentage widths on inline links). */
function animBtnRow(...btns: string[]): string {
  return `<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;table-layout:fixed"><tr>${btns.join("")}</tr></table>`;
}

/**
 * Michal's fixed e-mail signature (animated GIF + her three buttons), as one RTL block. Used by the reply drafts
 * AND by the site's automatic mails (reminders etc.) so every mail closes the same way.
 */
export function signatureBlockHtml(): string {
  return `<div style="line-height:0"><img src="${SIGNATURE_GIF_URL}" alt="MICHAL SIBONI · ${SITE_PHONE} · ${SITE_MAIL} · michalsiboni.co.il" width="560" style="width:100%;max-width:560px;height:auto;border:0;display:inline-block"></div>
      <div style="margin-top:14px;line-height:0">
        ${animBtnRow(animBtn("https://michalsiboni.co.il/", "btn-michal-gallery.gif", "לגלריה שלי"), animBtn("https://sweetbabyphoto.shop/", "btn-michal-site.gif", "לאתר הסטודיו"), animBtn(`mailto:${SITE_MAIL}`, "btn-michal-mail.gif", "שליחת מייל"))}
      </div>`;
}

/**
 * The photographer-site look (sand frame, cream card, MICHAL SIBONI wordmark, heart divider, pink heading) around
 * ready-made inner HTML — used by the site's automatic mails (reminders, payment, gallery nudge) so they match the
 * reply drafts, the photographer site and the newborn page. RTL is forced on every wrapper (Gmail strips the
 * attribute on <html>), and Michal's fixed signature closes the mail.
 */
export function buildBrandedMailHtml(opts: { title: string; innerHtml: string; tagline?: string }): string {
  const t = THEMES.photographer;
  const heartKind: HeartKind = "michal";
  const rtl = "direction:rtl;text-align:right";
  // Soft blush-to-sand gradient behind the card (solid colour first as the fallback for clients without gradients).
  const html = `<div dir="rtl" data-mail="photographer" style="background:#ecd0b8;background-image:linear-gradient(160deg,#f6d8d0 0%,#eccbb4 55%,#d9b898 100%);padding:12px 8px;${rtl}">${RB_CSS}
  <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:${t.cardBg};border:1px solid #efe0d2;border-radius:12px;overflow:hidden;box-shadow:0 8px 28px rgba(120,86,60,0.16);font-family:${FONT};color:${t.text};${rtl}">
    <tr><td align="center" style="padding:30px 28px 6px">${WORDMARK_IMG}
      <div style="font-size:12px;letter-spacing:2px;color:${t.soft};margin-top:8px">${esc(opts.tagline ?? "צילומי ניו בורן ומשפחה")}</div></td></tr>
    <tr><td style="padding:6px 28px 0"><div style="border-top:1px solid ${t.soft}55;text-align:center;line-height:0"><span style="position:relative;top:-1px;background:${t.cardBg};padding:0 10px;color:${t.accent};font-size:12px;line-height:1">${heartImg(heartKind, 14)}</span></div></td></tr>
    <tr><td dir="rtl" style="padding:14px 34px 10px;font-size:15px;line-height:1.8;${rtl}">
      <h2 style="margin:0 0 14px;text-align:center;font-size:21px;font-weight:bold;color:${SIG_BROWN};font-family:${FONT}">${esc(opts.title)}</h2>
      ${opts.innerHtml}
    </td></tr>
    <tr><td style="padding:14px 28px 26px;font-size:13px;color:${t.soft};text-align:center;line-height:1.6">${signatureBlockHtml()}</td></tr>
  </table>
</div>`;
  return withEmailHearts(html, heartKind, 14);
}

/**
 * Studio-brand shell (thick gradient frame, Sweetbaby logo, studio colours, the colour-rotating studio signature and
 * three buttons: site / Waze / mail) around ready-made inner HTML — for the studio's own mails (props orders,
 * studio bookings). The photographer mails keep the thinner Michal look above.
 */
export function buildStudioMailHtml(opts: { title: string; innerHtml: string }): string {
  const t = THEMES.studio;
  const rtl = "direction:rtl;text-align:right";
  const btn = (href: string, label: string, primary = false) =>
    `<a href="${href}" style="display:inline-block;background:${primary ? t.accent : t.cardBg};color:${primary ? t.cardBg : t.accent};border:1px solid ${t.accent};font-family:Arial,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;padding:9px 22px;border-radius:18px;white-space:nowrap;margin:4px">${label}</a>`;
  const html = `<div dir="rtl" data-mail="studio" style="background:#e9dcc8;background-image:linear-gradient(160deg,#dfe8d3 0%,#f3d9d2 55%,#e9d3b9 100%);padding:26px 16px;${rtl}">${RB_CSS}
  <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:${t.cardBg};border:1px solid #efddd0;border-radius:22px;overflow:hidden;box-shadow:0 8px 28px rgba(90,70,50,0.16);font-family:${FONT};color:${t.text};${rtl}">
    <tr><td align="center" style="padding:28px 28px 6px"><img src="${STUDIO_LOGO_URL}" alt="Sweetbaby" height="52" style="height:52px;width:auto;border:0">
      <div style="font-size:12px;letter-spacing:2px;color:${t.soft};margin-top:8px">סטודיו בוטיק לצילום · בית שמש</div></td></tr>
    <tr><td style="padding:6px 28px 0"><div style="border-top:1px solid ${t.soft}55;text-align:center;line-height:0"><span style="position:relative;top:-1px;background:${t.cardBg};padding:0 10px;font-size:12px;line-height:1">${heartImg("bot", 14)}</span></div></td></tr>
    <tr><td dir="rtl" style="padding:14px 30px 10px;font-size:15px;line-height:1.8;${rtl}">
      ${opts.title ? `<h2 style="margin:0 0 14px;text-align:center;font-size:21px;font-weight:bold;color:${t.accent};font-family:${FONT}">${esc(opts.title)}</h2>` : ""}
      ${opts.innerHtml}
    </td></tr>
    <tr><td style="padding:14px 20px 24px;font-size:13px;color:${t.soft};text-align:center;line-height:1.6">
      <div style="line-height:0"><img src="${STUDIO_SIGNATURE_GIF_URL}" alt="Sweetbaby · תלמוד ירושלמי 24, בית שמש · 054-8529277" width="560" style="width:100%;max-width:560px;height:auto;border:0;display:inline-block"></div>
      <div style="margin-top:14px;line-height:0">${animBtnRow(animBtn("https://sweetbabyphoto.shop/", "btn-studio-site.gif", "לאתר הסטודיו"), animBtn(STUDIO_WAZE, "btn-studio-waze.gif", "ניווט בוויז"), animBtn("mailto:s0548529277@gmail.com", "btn-studio-mail.gif", "שליחת מייל"))}</div>
    </td></tr>
  </table>
</div>`;
  return withEmailHearts(html, "bot", 14);
}

export function buildDraftHtml(opts: {
  brand: DraftBrand;
  body: string;
  priceList?: PriceList;
  photos?: string[];
  bigPhotos?: boolean;
  /** Photos for the arched price-list cards (newborn / outdoor lists); no photo -> text-only cards. */
  cardPhotos?: { newborn?: string[]; outdoor?: string[] };
  cta?: { label: string; url: string } | null;
  /** More buttons next to the main one (e.g. gallery + details + chat in the automatic first reply). */
  extraCtas?: Array<{ label: string; url: string }>;
  /**
   * Photographer brand only: close with the signature block shown in the site's footer (animated logo with
   * Michal's heart, tagline, phone, mail). ON by default for every photographer draft / reply (regular,
   * follow-up and automatic); pass `false` to fall back to the small static-logo signature.
   */
  siteSignature?: boolean;
  /** Raw HTML placed under the body / buttons, inside the card (e.g. the rotating-photos GIF). */
  extraHtml?: string;
}): string {
  // Personal replies ("general": suppliers, colleagues, everything else) look exactly like the photographer's
  // — soft contract-style frame, Michal's animated signature logo, her heart. Only the studio brand differs.
  const look: DraftBrand = opts.brand === "general" ? "photographer" : opts.brand;
  const useSiteSig = look === "photographer" && opts.siteSignature !== false;
  const t = THEMES[look];
  const sig = SIGNATURES[look];
  // Michal's own heart for every photographer / personal mail, the bot's colourful heart for the studio.
  const heartKind: HeartKind = look === "photographer" ? "michal" : "bot";
  const logo = (h: number) =>
    look === "photographer"
      ? `<img src="${MICHAL_LOGO_URL}" alt="מיכל סיבוני" height="${h}" style="height:${h}px;width:auto;border:0">`
      : look === "studio"
        ? `<img src="${STUDIO_LOGO_URL}" alt="Sweetbaby" height="${h}" style="height:${h}px;width:auto;border:0">`
        : "";
  // Personal replies: no big logo on top (it would repeat the signature) — the signature logo closes the mail.
  const header = opts.brand === "general" ? "" : `<tr><td align="center" style="padding:30px 28px 6px">${
    look === "studio"
      ? logo(52)
      : `${WORDMARK_IMG}`
  }
          <div style="font-size:12px;letter-spacing:2px;color:${t.soft};margin-top:8px">${
            look === "studio" ? "סטודיו בוטיק לצילום · בית שמש" : "צילומי ניו בורן ומשפחה"
          }</div></td></tr>`;
  const heart = `<tr><td style="padding:6px 28px 0"><div style="border-top:1px solid ${t.soft}55;text-align:center;line-height:0"><span style="position:relative;top:-1px;background:${t.cardBg};padding:0 10px;color:${t.accent};font-size:12px;line-height:1">${heartImg(heartKind, 14)}</span></div></td></tr>`;
  const lists =
    opts.brand === "photographer" && opts.priceList && opts.priceList !== "none"
      ? (opts.priceList === "newborn" || opts.priceList === "both" ? priceBlock(NEWBORN, t, "newborn", opts.cardPhotos?.newborn) : "") +
        (opts.priceList === "outdoor" || opts.priceList === "both" ? priceBlock(OUTDOOR, t, "outdoor", opts.cardPhotos?.outdoor) : "") +
        (opts.priceList === "studio" ? priceBlock(STUDIO_OFFER, t, "studio", opts.cardPhotos?.newborn?.slice(0, 1)) : "")
      : "";
  const ctaButtons = [...(opts.cta ? [opts.cta] : []), ...(opts.extraCtas ?? [])];
  const cta = ctaButtons.length
    ? `<div style="text-align:center;margin:20px 0 6px">${ctaButtons
        .map(
          (c) =>
            `<a class="rb" href="${esc(c.url)}" style="display:inline-block;background:${look === "studio" ? t.accent : "#a18266"};background-image:${look === "studio" ? RB_STUDIO : RB_MICHAL};color:#ffffff;padding:11px 26px;border-radius:24px;text-decoration:none;font-weight:bold;margin:4px">${esc(c.label)}</a>`,
        )
        .join("")}</div>`
    : "";
  const photos = opts.brand === "photographer" ? photoStrip(opts.photos ?? [], !!opts.bigPhotos) : "";
  // Studio drafts use the same new studio shell as the order / booking mails (thick gradient frame, Sweetbaby
  // logo, animated studio signature + buttons).
  if (look === "studio") return buildStudioMailHtml({ title: "", innerHtml: `${bodyToHtml(opts.body, t)}${cta}` });
  const branded = true;
  const html = `<div dir="rtl" data-mail="${look}" style="background:${t.pageBg};${look === "photographer" ? "background-image:linear-gradient(160deg,#f6d8d0 0%,#eccbb4 55%,#d9b898 100%);" : ""}padding:7px 6px;direction:rtl">${RB_CSS}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:${t.cardBg};border:1px solid ${t.border};border-radius:14px;overflow:hidden;font-family:${FONT};color:${t.text};direction:rtl;text-align:right">
    ${header}
    <tr><td style="padding:${opts.brand === "general" ? "30px 34px 10px" : "18px 34px 10px"};font-size:15px;line-height:1.8">
      ${photos}
      ${bodyToHtml(opts.body, t)}
      ${lists}
      ${cta}
      ${opts.extraHtml ?? ""}
    </td></tr>
    ${heart}
    <tr><td style="padding:${branded ? "14px 28px 26px" : "16px 28px 20px"};${branded ? "" : `border-top:1px solid ${t.border};`}font-size:13px;color:${t.soft};text-align:center;line-height:1.6">
      ${
        useSiteSig
          ? signatureBlockHtml()
          : `<div style="font-weight:bold;color:${t.accent}">${esc(sig.name)}</div>
      ${sig.lines.map((l) => `<div>${esc(l)}</div>`).join("")}
      ${sig.site ? `<div><a href="${sig.site.url}" style="color:${t.soft}">${esc(sig.site.label)}</a></div>` : ""}
      ${branded ? `<div style="margin-top:12px">${logo(26)}</div>` : ""}`
      }
    </td></tr>
  </table>
</div>`;
  return withEmailHearts(html, heartKind, 14);
}

/** Plain-text twin of the draft (for the text/plain part). */
export function buildDraftText(opts: {
  brand: DraftBrand;
  body: string;
  priceList?: PriceList;
  cta?: { label: string; url: string } | null;
  extraCtas?: Array<{ label: string; url: string }>;
  siteSignature?: boolean;
}): string {
  const sig = SIGNATURES[opts.brand];
  const listText = (l: typeof NEWBORN) =>
    `\n${l.title}\n${l.pkgs.map((p) => `• ${p.name} — ${p.price}: ${p.lines.join(", ")}`).join("\n")}\n${l.addons}\n`;
  const lists =
    opts.brand === "photographer" && opts.priceList && opts.priceList !== "none"
      ? (opts.priceList === "newborn" || opts.priceList === "both" ? listText(NEWBORN) : "") +
        (opts.priceList === "outdoor" || opts.priceList === "both" ? listText(OUTDOOR) : "") +
        (opts.priceList === "studio" ? listText(STUDIO_OFFER) : "")
      : "";
  const body = opts.body.replace(/^##\s+/gm, "").replace(/^>\s?/gm, "").replace(/\*\*/g, "");
  return `${body}\n${lists}${[...(opts.cta ? [opts.cta] : []), ...(opts.extraCtas ?? [])].map((c) => `\n${c.label}: ${c.url}`).join("")}${opts.cta || opts.extraCtas?.length ? "\n" : ""}\n--\n${
    opts.brand !== "studio" && opts.siteSignature !== false
      ? `MICHAL SIBONI\nצילומי ניו בורן | משפחה | מימוש סל לידה | סטודיו סוויט בייבי\n${SITE_PHONE} · ${SITE_MAIL} · michalsiboni.co.il`
      : `${sig.name}\n${sig.lines.join(" · ")}${sig.site ? `\n${sig.site.label}` : ""}`
  }\n`;
}

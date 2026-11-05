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
const MICHAL_LOGO_URL = `https://sweetbabyphoto.shop${michalWordmark}`;
// Michal's FIXED email signature (the animated GIF from her Gmail signature: circle photo + "MICHAL SIBONI",
// phone, mail, site and services) — re-coloured to the card colour below by scripts/make-email-signature-gif.py
// (source: Drive "michal-siboni-signature-final-cream2.gif"; first frame = a finished frame for Outlook / blocked
// images). Under it come her three signature buttons, exactly as in her Gmail signature.
const SIGNATURE_GIF_URL = "https://sweetbabyphoto.shop/email/michal-signature.gif";
const SITE_PHONE = "053-418-1051";
const SITE_MAIL = "m0548529277@gmail.com";
const SIG_BROWN = "#3e3029";
const SIG_CREAM = "#f7f3ee";
const STUDIO_LOGO_URL = `https://sweetbabyphoto.shop${sweetbabyLogo}`;

export type DraftBrand = "photographer" | "studio" | "general";
export type PriceList = "newborn" | "outdoor" | "both" | "none";

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
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
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
      return `<p style="margin:0 0 12px">${lines.map(inline).join("<br>")}</p>`;
    })
    .join("");
}

type Pkg = { name: string; price: string; lines: string[]; featured?: boolean };

const NEWBORN: { title: string; note: string; pkgs: Pkg[]; addons: string } = {
  title: "מחירון ניו בורן",
  note: "בחירת אווירה, אביזרים ובגדים לפי הטעם שלך — והתינוק מטופל בעדינות ובבטיחות.",
  pkgs: [
    { name: "חבילה מיני", price: "970₪", lines: ["2 סטים", "8 תמונות ערוכות", "קולאז׳ מעוצב"] },
    {
      name: "חבילה מפנקת",
      price: "1,300₪",
      lines: ["3 סטים", "10 תמונות ערוכות", "סט הורים / אחים", "קולאז׳ מעוצב", "אלבום"],
      featured: true,
    },
    {
      name: "חבילה חלומית",
      price: "1,650₪",
      lines: ["4 סטים", "15 תמונות ערוכות", "סט הורים", "סט אחים", "קולאז׳ מעוצב", "אלבום"],
    },
  ],
  addons: "תוספות: אלבום 280₪ · תמונה ערוכה נוספת 40₪ · צילומי אחים 200₪",
};

const OUTDOOR: { title: string; note: string; pkgs: Pkg[]; addons: string } = {
  title: "מחירון צילומי חוץ וסטודיו",
  note: "משפחה, חלאקה, גיל שנה וילדים — בסטודיו או בחוץ.",
  pkgs: [
    { name: "קסם", price: "1,250₪", lines: ["3 סטים", "15 תמונות בעריכה אומנותית", "כל התמונות באיכות", "קולאז׳ מעוצב"] },
    {
      name: "פופולארית",
      price: "1,750₪",
      lines: ["שיחת סטיילינג", "4 סטים", "25 תמונות בעריכה אומנותית", "כל התמונות באיכות", "קולאז׳ מעוצב", "אלבום דיגיטלי 21/56"],
      featured: true,
    },
    {
      name: "חלום",
      price: "2,350₪",
      lines: ["5 סטים — חוץ + סטודיו", "30 תמונות בעריכה אומנותית", "כל התמונות באיכות", "קולאז׳ מעוצב", "אלבום דיגיטלי 21/56"],
    },
  ],
  addons: "מעבר לחבילות: 300₪ לשעה, ללא עריכת תמונות — בסטודיו או בחוץ.",
};

function priceBlock(list: typeof NEWBORN, t: Theme): string {
  const card = (p: Pkg) => `<td valign="top" width="33%" style="padding:5px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${p.featured ? "#fff8fa" : "#ffffff"};border:${p.featured ? "2px" : "1px"} solid ${p.featured ? t.accent : "#e2cfb6"};border-radius:14px">
      <tr><td style="padding:14px 10px 6px;text-align:center">
        ${p.featured ? `<div style="font-size:11px;color:${t.accent};font-weight:bold;margin-bottom:4px">הכי אהובה 💗</div>` : ""}
        <div style="font-size:16px;font-weight:bold;color:${t.accent}">${esc(p.name)}</div>
        <div style="height:2px;width:36px;background:#a9784f;margin:8px auto"></div>
        ${p.lines.map((l) => `<div style="font-size:13px;color:${t.text};line-height:1.6">${esc(l)}</div>`).join("")}
      </td></tr>
      <tr><td style="padding:8px 10px 14px;text-align:center">
        <span style="display:inline-block;background:#8a6a52;color:#ffffff;font-weight:bold;font-size:15px;padding:5px 16px;border-radius:20px">${esc(p.price)}</span>
      </td></tr>
    </table>
  </td>`;
  return `<div style="margin:22px 0 8px">
    <h3 style="color:${t.accent};font-size:18px;margin:0 0 2px;text-align:center;font-family:${FONT}">${esc(list.title)}</h3>
    <p style="margin:0 0 10px;text-align:center;font-size:13px;color:${t.soft}">${esc(list.note)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${list.pkgs.map(card).join("")}</tr></table>
    <p style="margin:8px 0 0;text-align:center;font-size:12px;color:${t.soft}">${esc(list.addons)}</p>
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

/**
 * Michal's fixed e-mail signature (animated GIF + her three buttons), as one RTL block. Used by the reply drafts
 * AND by the site's automatic mails (reminders etc.) so every mail closes the same way.
 */
export function signatureBlockHtml(): string {
  return `<div style="line-height:0"><img src="${SIGNATURE_GIF_URL}" alt="MICHAL SIBONI · ${SITE_PHONE} · ${SITE_MAIL} · michalsiboni.co.il" width="560" style="width:100%;max-width:560px;height:auto;border:0;display:inline-block"></div>
      <div style="margin-top:14px;line-height:1.4">
        <a href="https://michalsiboni.co.il/" style="display:inline-block;background:${SIG_BROWN};color:${SIG_CREAM};border:1px solid ${SIG_BROWN};font-family:Arial,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;padding:9px 24px;border-radius:18px;white-space:nowrap;margin:4px">לגלריה שלי</a>
        <a href="https://sweetbabyphoto.shop/" style="display:inline-block;background:${SIG_CREAM};color:${SIG_BROWN};border:1px solid ${SIG_BROWN};font-family:Arial,sans-serif;font-size:13px;font-weight:bold;text-decoration:none;padding:8px 18px;border-radius:18px;white-space:nowrap;margin:4px">לאתר הסטודיו</a>
        <a href="mailto:${SITE_MAIL}" style="display:inline-block;background:${SIG_CREAM};color:${SIG_BROWN};border:1px solid ${SIG_BROWN};font-family:Arial,sans-serif;font-size:13px;font-weight:bold;text-decoration:none;padding:8px 18px;border-radius:18px;white-space:nowrap;margin:4px">שליחת מייל</a>
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
  const html = `<div dir="rtl" style="background:${t.pageBg};padding:18px 10px;${rtl}">
  <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:${t.cardBg};border:1px solid ${t.border};border-radius:14px;overflow:hidden;font-family:${FONT};color:${t.text};${rtl}">
    <tr><td align="center" style="padding:30px 28px 6px"><div dir="ltr" style="font-family:Helvetica,Arial,sans-serif;font-size:24px;letter-spacing:9px;margin-right:-9px;color:${SIG_BROWN}">MICHAL SIBONI</div>
      <div style="font-size:12px;letter-spacing:2px;color:${t.soft};margin-top:8px">${esc(opts.tagline ?? "צילומי ניו בורן ומשפחה")}</div></td></tr>
    <tr><td style="padding:6px 28px 0"><div style="border-top:1px solid ${t.soft}55;text-align:center;line-height:0"><span style="position:relative;top:-1px;background:${t.cardBg};padding:0 10px;color:${t.accent};font-size:12px;line-height:1">${heartImg(heartKind, 14)}</span></div></td></tr>
    <tr><td dir="rtl" style="padding:14px 34px 10px;font-size:15px;line-height:1.8;${rtl}">
      <h2 style="margin:0 0 14px;text-align:center;font-size:21px;font-weight:bold;color:${t.accent};font-family:${FONT}">${esc(opts.title)}</h2>
      ${opts.innerHtml}
    </td></tr>
    <tr><td style="padding:14px 28px 26px;font-size:13px;color:${t.soft};text-align:center;line-height:1.6">${signatureBlockHtml()}</td></tr>
  </table>
</div>`;
  return withEmailHearts(html, heartKind, 14);
}

export function buildDraftHtml(opts: {
  brand: DraftBrand;
  body: string;
  priceList?: PriceList;
  photos?: string[];
  bigPhotos?: boolean;
  cta?: { label: string; url: string } | null;
  /** More buttons next to the main one (e.g. gallery + details + chat in the automatic first reply). */
  extraCtas?: Array<{ label: string; url: string }>;
  /**
   * Photographer brand only: close with the signature block shown in the site's footer (animated logo with
   * Michal's heart, tagline, phone, mail). ON by default for every photographer draft / reply (regular,
   * follow-up and automatic); pass `false` to fall back to the small static-logo signature.
   */
  siteSignature?: boolean;
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
      : `<div dir="ltr" style="font-family:Helvetica,Arial,sans-serif;font-size:24px;letter-spacing:9px;margin-right:-9px;color:${SIG_BROWN}">MICHAL SIBONI</div>`
  }
          <div style="font-size:12px;letter-spacing:2px;color:${t.soft};margin-top:8px">${
            look === "studio" ? "סטודיו בוטיק לצילום · בית שמש" : "צילומי ניו בורן ומשפחה"
          }</div></td></tr>`;
  const heart = `<tr><td style="padding:6px 28px 0"><div style="border-top:1px solid ${t.soft}55;text-align:center;line-height:0"><span style="position:relative;top:-1px;background:${t.cardBg};padding:0 10px;color:${t.accent};font-size:12px;line-height:1">${heartImg(heartKind, 14)}</span></div></td></tr>`;
  const lists =
    opts.brand === "photographer" && opts.priceList && opts.priceList !== "none"
      ? (opts.priceList === "newborn" || opts.priceList === "both" ? priceBlock(NEWBORN, t) : "") +
        (opts.priceList === "outdoor" || opts.priceList === "both" ? priceBlock(OUTDOOR, t) : "")
      : "";
  const ctaButtons = [...(opts.cta ? [opts.cta] : []), ...(opts.extraCtas ?? [])];
  const cta = ctaButtons.length
    ? `<div style="text-align:center;margin:20px 0 6px">${ctaButtons
        .map(
          (c) =>
            `<a href="${esc(c.url)}" style="display:inline-block;background:${t.accent};color:#ffffff;padding:11px 26px;border-radius:24px;text-decoration:none;font-weight:bold;margin:4px">${esc(c.label)}</a>`,
        )
        .join("")}</div>`
    : "";
  const photos = opts.brand === "photographer" ? photoStrip(opts.photos ?? [], !!opts.bigPhotos) : "";
  const branded = true;
  const html = `<div dir="rtl" style="background:${t.pageBg};padding:18px 10px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:${t.cardBg};border:1px solid ${t.border};border-radius:14px;overflow:hidden;font-family:${FONT};color:${t.text};direction:rtl;text-align:right">
    ${header}
    <tr><td style="padding:${opts.brand === "general" ? "30px 34px 10px" : "18px 34px 10px"};font-size:15px;line-height:1.8">
      ${photos}
      ${bodyToHtml(opts.body, t)}
      ${lists}
      ${cta}
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
        (opts.priceList === "outdoor" || opts.priceList === "both" ? listText(OUTDOOR) : "")
      : "";
  const body = opts.body.replace(/^##\s+/gm, "").replace(/^>\s?/gm, "").replace(/\*\*/g, "");
  return `${body}\n${lists}${[...(opts.cta ? [opts.cta] : []), ...(opts.extraCtas ?? [])].map((c) => `\n${c.label}: ${c.url}`).join("")}${opts.cta || opts.extraCtas?.length ? "\n" : ""}\n--\n${
    opts.brand !== "studio" && opts.siteSignature !== false
      ? `MICHAL SIBONI\nצילומי ניו בורן | משפחה | מימוש סל לידה | סטודיו סוויט בייבי\n${SITE_PHONE} · ${SITE_MAIL} · michalsiboni.co.il`
      : `${sig.name}\n${sig.lines.join(" · ")}${sig.site ? `\n${sig.site.label}` : ""}`
  }\n`;
}

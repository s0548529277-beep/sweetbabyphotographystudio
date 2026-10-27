/**
 * Designed reply-draft templates for the site's automatic email assistant
 * (email-drafts.server.ts). Replaces the owner's Claude scheduled task
 * "טיוטות תשובה לכל פנייה" (2026-10-27) — same three brands, same price
 * lists, polished layout. Email-safe: tables + inline styles only, RTL.
 * The AI only writes the text (paragraphs / short lists); everything visual
 * is built here, so every draft looks the same and nothing is invented.
 */

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
  photographer: {
    pageBg: "#f6f0e4",
    cardBg: "#ffffff",
    border: "#e8d9c4",
    headerBg: "#f6f0e4",
    wordmark: "#c23b6d",
    accent: "#c23b6d",
    text: "#5a4433",
    soft: "#8a6a52",
    highlight: "#fbeef2",
  },
  studio: {
    pageBg: "#f8ede4",
    cardBg: "#ffffff",
    border: "#e9d8cc",
    headerBg: "#2d3d2b",
    wordmark: "#f8ede4",
    accent: "#2d3d2b",
    text: "#2d3d2b",
    soft: "#5e6b5c",
    highlight: "#f5d5cf",
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
    { name: "חבילה מיני", price: "900₪", lines: ["3 סטים", "8 תמונות ערוכות", "קולאז׳ מעוצב"] },
    {
      name: "חבילה מפנקת",
      price: "1,200₪",
      lines: ["4 סטים", "12 תמונות ערוכות", "סט הורים / אחים", "קולאז׳ מעוצב", "אלבום"],
      featured: true,
    },
    {
      name: "חבילה חלומית",
      price: "1,650₪",
      lines: ["5 סטים", "15 תמונות ערוכות", "סט הורים", "סט אחים", "קולאז׳ מעוצב", "אלבום"],
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

export function buildDraftHtml(opts: {
  brand: DraftBrand;
  body: string;
  priceList?: PriceList;
  photos?: string[];
  bigPhotos?: boolean;
  cta?: { label: string; url: string } | null;
}): string {
  const t = THEMES[opts.brand];
  const sig = SIGNATURES[opts.brand];
  const header =
    opts.brand === "photographer"
      ? `<tr><td style="background:${t.headerBg};padding:26px 28px 18px;text-align:center;border-bottom:1px solid ${t.border}">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:30px;letter-spacing:3px;color:${t.wordmark}">Michal Siboni</div>
          <div style="font-size:12px;letter-spacing:2px;color:${t.soft};margin-top:4px">צילומי ניו בורן ומשפחה</div>
        </td></tr>`
      : opts.brand === "studio"
        ? `<tr><td style="background:${t.headerBg};padding:24px 28px;text-align:center">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:30px;letter-spacing:1px;color:${t.wordmark}">Sweetbaby</div>
          <div style="font-size:12px;letter-spacing:1px;color:#a8c4a2;margin-top:4px">סטודיו בוטיק לצילום · בית שמש</div>
        </td></tr>`
        : "";
  const lists =
    opts.brand === "photographer" && opts.priceList && opts.priceList !== "none"
      ? (opts.priceList === "newborn" || opts.priceList === "both" ? priceBlock(NEWBORN, t) : "") +
        (opts.priceList === "outdoor" || opts.priceList === "both" ? priceBlock(OUTDOOR, t) : "")
      : "";
  const cta = opts.cta
    ? `<div style="text-align:center;margin:20px 0 6px"><a href="${esc(opts.cta.url)}" style="display:inline-block;background:${t.accent};color:#ffffff;padding:11px 26px;border-radius:24px;text-decoration:none;font-weight:bold">${esc(opts.cta.label)}</a></div>`
    : "";
  const photos = opts.brand === "photographer" ? photoStrip(opts.photos ?? [], !!opts.bigPhotos) : "";
  return `<div dir="rtl" style="background:${t.pageBg};padding:24px 8px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:${t.cardBg};border:1px solid ${t.border};border-radius:16px;overflow:hidden;font-family:${FONT};color:${t.text};direction:rtl;text-align:right">
    ${header}
    <tr><td style="padding:24px 28px 8px;font-size:15px;line-height:1.75">
      ${photos}
      ${bodyToHtml(opts.body, t)}
      ${lists}
      ${cta}
    </td></tr>
    <tr><td style="padding:16px 28px 20px;border-top:1px solid ${t.border};font-size:13px;color:${t.soft};text-align:center;line-height:1.6">
      <div style="font-weight:bold;color:${t.accent}">${esc(sig.name)}</div>
      ${sig.lines.map((l) => `<div>${esc(l)}</div>`).join("")}
      ${sig.site ? `<div><a href="${sig.site.url}" style="color:${t.soft}">${esc(sig.site.label)}</a></div>` : ""}
    </td></tr>
  </table>
</div>`;
}

/** Plain-text twin of the draft (for the text/plain part). */
export function buildDraftText(opts: { brand: DraftBrand; body: string; priceList?: PriceList; cta?: { label: string; url: string } | null }): string {
  const sig = SIGNATURES[opts.brand];
  const listText = (l: typeof NEWBORN) =>
    `\n${l.title}\n${l.pkgs.map((p) => `• ${p.name} — ${p.price}: ${p.lines.join(", ")}`).join("\n")}\n${l.addons}\n`;
  const lists =
    opts.brand === "photographer" && opts.priceList && opts.priceList !== "none"
      ? (opts.priceList === "newborn" || opts.priceList === "both" ? listText(NEWBORN) : "") +
        (opts.priceList === "outdoor" || opts.priceList === "both" ? listText(OUTDOOR) : "")
      : "";
  const body = opts.body.replace(/^##\s+/gm, "").replace(/^>\s?/gm, "").replace(/\*\*/g, "");
  return `${body}\n${lists}${opts.cta ? `\n${opts.cta.label}: ${opts.cta.url}\n` : ""}\n--\n${sig.name}\n${sig.lines.join(" · ")}${sig.site ? `\n${sig.site.label}` : ""}\n`;
}

// Detects a draft that holds only the designed "template" (header, signature, buttons and the quoted mail) and no
// text written by a person. Gmail makes such a second draft when a reply is opened from another screen / device
// while a prepared draft already exists, and the owner's Gmail signature is the whole designed card, so the leftover
// looks like a duplicate template. Pure functions, no I/O — used by the draft assistant's cleanup.

/** Words and fragments that belong to the designed card, not to the person's own text. Longest first. */
const CARD_PIECES = [
  "MICHAL SIBONI",
  "צילומי ניו בורן ומשפחה",
  "צילומי ניו בורן",
  "צילומי ניו",
  "צילומי",
  "סטודיו בוטיק לצילום",
  "תלמוד ירושלמי 24, בית שמש",
  "לגלריה שלי",
  "לאתר הסטודיו",
  "ניווט בוויז",
  "שליחת מייל",
  "Sweetbaby",
  "michalsiboni.co.il",
  "m0548529277@gmail.com",
  "053-418-1051",
  "054-8529277",
  "בית שמש",
  "היי",
];

/** Everything from the start of the quoted earlier mail (Hebrew or English attribution line) is dropped. */
function cutQuote(text: string): string {
  const he = text.search(/בתאריך\s.{0,80}?(?:מאת|<)/);
  const en = text.search(/\bOn\s.{0,100}?\bwrote:/);
  const cuts = [he, en].filter((i) => i >= 0);
  return cuts.length ? text.slice(0, Math.min(...cuts)) : text;
}

/** The text a person wrote in a draft, judged from Gmail's snippet (card pieces and the quote removed). */
export function ownDraftText(snippet: string): string {
  let t = cutQuote(snippet.replace(/\s+/g, " ").trim());
  for (const piece of CARD_PIECES) t = t.split(piece).join(" ");
  return t.replace(/[\s·|,.\-–—♥💗:;]+/g, " ").trim();
}

/** True when the draft has nothing of its own — only the card (or nothing at all). */
export function isBlankTemplateDraft(snippet: string): boolean {
  return ownDraftText(snippet) === "";
}

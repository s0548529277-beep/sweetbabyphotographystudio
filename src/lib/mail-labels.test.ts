import test from "node:test";
import assert from "node:assert/strict";
import { SITE_MAIL_LABELS, classifySiteMail } from "./mail-labels";

test("site mail types: every real subject the sites send lands in the right type", () => {
  const cases: Array<[string, ReturnType<typeof classifySiteMail>]> = [
    // studio rental
    ["בקשת שריון #1a2b3c4d · Sweetbaby", "studio"],
    ["אישור הזמנה — השכרת סטודיו #1a2b3c4d · Sweetbaby", "studio"],
    ["Re: בקשת שריון #1a2b3c4d · Sweetbaby", "studio"],
    ["תזכורת לצילומים המתקרבים #1a2b3c4d · Sweetbaby", "studio"],
    ["בקשת שריון טלפונית #1a2b3c4d · Sweetbaby", "studio"],
    ["תזכורת: השלמת תשלום המקדמה · Sweetbaby", "studio"],
    ["ההזמנה עודכנה — השכרת סטודיו #1a2b3c4d · Sweetbaby", "studio"],
    ["⚠️ המחיר שונה (+₪50) — ההזמנה עודכנה — השכרת סטודיו #1a2b3c4d · Sweetbaby", "studio"],
    ["חדר המשפחה נקבע", "studio"],
    // props
    ["בקשת הזמנה #1a2b3c4d · Sweetbaby", "props"],
    ["אישור הזמנה — השכרת אביזרים #1a2b3c4d · Sweetbaby", "props"],
    ["תזכורת: איסוף האביזרים מתקרב #1a2b3c4d · Sweetbaby", "props"],
    ["⚠️ המחיר שונה (-₪20) — ההזמנה עודכנה — השכרת אביזרים #1a2b3c4d · Sweetbaby", "props"],
    // leads
    ["🔥 ליד חם · צילומים עם מיכל · מרים וולמן", "lead_quiz"],
    ["ליד חדש מהשאלון · יהודית בש · חלום", "lead_quiz"],
    ["ליד חדש · השכרת סטודיו · דנה", "lead_quiz"],
    ["💗 חנה אשלג בחרה בחבילה: חבילה מיני (970 ₪)", "lead_quiz"],
    ["הודעה מהצ׳אט באתר — חדוה", "lead_chat"],
    ["💬 הודעה מצ'אט האתר · דנה · 0501234567", "lead_chat"],
    ["✉️ פנייה מטופס יצירת הקשר באתר · יוסף שפיגלר · +972556709134", "lead_form"],
    ["פנייה · צילומים עם מיכל · דנה", "lead_form"],
    ["מעוניינת במימוש סל לידה — דנה", "lead_form"],
    ["📞 הודעה מלקוחה בטלפון · 0556709134", "lead_phone"],
    ["🔥 ליד חם: פריידי", "lead_visitor"],
    ["🔥 חזרה לאתר: תמר דויטש", "lead_visitor"],
    // not one of these
    ["📋 למי לחזור — 19.11", null],
    ["התמונות שלך מחכות לבחירה 📸 · מיכל סיבוני", null],
    ["הפרס שלך מגלגל המתנות", null],
    ["", null],
  ];
  for (const [subject, kind] of cases) assert.equal(classifySiteMail(subject), kind, subject);
});

test("site mail labels: every type has a distinct sub-label of the parent label", () => {
  const names = Object.values(SITE_MAIL_LABELS).map((l) => l.name);
  assert.equal(new Set(names).size, names.length);
  for (const n of names) assert.ok(n.startsWith("הזמנות ולידים/"), n);
});

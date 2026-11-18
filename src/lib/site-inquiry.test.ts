import test from "node:test";
import assert from "node:assert/strict";
import { SITE_INQUIRY_SUBJECT, customerEmailInNotice } from "./site-inquiry";

test("site inquiry subjects: real inquiries match, visitor alerts and other mail do not", () => {
  const yes = [
    "🔥 ליד חם · צילומים עם מיכל · רחל",
    "ליד חדש · השכרת סטודיו · דנה",
    "🔥 ליד חם מהשאלון · רחל · מיני",
    "💗 רחל בחרה בחבילה: מפנקת (1,300 ₪)",
    "הודעה מהצ׳אט באתר — דנה",
    "💬 הודעה מצ'אט האתר · דנה · 0501234567",
    "✉️ פנייה מטופס יצירת הקשר באתר · דנה · 0501234567",
    "פנייה · צילומים עם מיכל · דנה",
    "מעוניינת במימוש סל לידה — דנה",
    "📞 הודעה מלקוחה בטלפון · 0501234567",
  ];
  const no = [
    "🔥 ליד חם: דנה",
    "🔥 חזרה לאתר: דנה",
    "תודה שהיית אצלנו 💗 · Sweetbaby",
    "אישור הזמנה — השכרת אביזרים",
    "📋 למי לחזור — 18.11",
  ];
  for (const s of yes) assert.ok(SITE_INQUIRY_SUBJECT.test(s), s);
  for (const s of no) assert.ok(!SITE_INQUIRY_SUBJECT.test(s), s);
});

test("customerEmailInNotice skips the studio / owner / site addresses and finds the customer's", () => {
  const text = [
    "מאת: Sweetbaby · לידים <m0548529277@gmail.com>",
    "שם: דנה",
    "מייל: Dana.Cohen@Gmail.com.",
    "לכל שאלה: studio@sweetbabyphoto.shop, s0548529277@gmail.com",
  ].join("\n");
  assert.equal(customerEmailInNotice(text), "dana.cohen@gmail.com");
  assert.equal(customerEmailInNotice("מאת: m0548529277@gmail.com\nטלפון: 0501234567"), null);
  assert.equal(customerEmailInNotice("מאת: m0548529277+x@gmail.com\nאימייל: a@b.co.il"), "a@b.co.il");
});

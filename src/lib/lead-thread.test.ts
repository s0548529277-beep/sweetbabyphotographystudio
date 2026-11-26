import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveSubject, encodeLeadSubject, isThreadedLeadSubject, leadThreadSubject } from "./lead-thread";
import { SITE_INQUIRY_SUBJECT } from "./site-inquiry";

test("only automatic lead notices are threaded; messages a customer left stay separate", () => {
  for (const s of ["🔥 ליד חם · השכרת סטודיו · דנה", "ליד חדש מהשאלון · רחל · מיני", "💗 רחל בחרה בחבילה: מפנקת", "🔥 ליד חם: דנה", "🔥 חזרה לאתר: דנה"])
    assert.ok(isThreadedLeadSubject(s), s);
  for (const s of ["הודעה מהצ׳אט באתר — דנה", "✉️ פנייה מטופס יצירת הקשר באתר · דנה", "פנייה · צילומים עם מיכל · דנה", "מעוניינת במימוש סל לידה — דנה", "📞 הודעה מלקוחה בטלפון · 050", "📋 למי לחזור — 25.11", leadThreadSubject()])
    assert.ok(!isThreadedLeadSubject(s), s);
});

test("the original subject survives the header round trip", () => {
  const s = "🔥 ליד חם מהשאלון · רחל · מיני";
  assert.equal(effectiveSubject("🎯 לידים חדשים — 25.11", encodeLeadSubject(s)), s);
  assert.equal(effectiveSubject("רגיל", ""), "רגיל");
  assert.ok(SITE_INQUIRY_SUBJECT.test(effectiveSubject("x", encodeLeadSubject(s))));
});

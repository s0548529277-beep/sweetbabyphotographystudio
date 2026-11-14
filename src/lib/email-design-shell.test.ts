import { test } from "node:test";
import assert from "node:assert/strict";
import { unmarkedMailIsPhotographer } from "./email-design.server";

test("photography subjects get the photographer shell, the rest the studio shell", () => {
  for (const s of ["החוזה נחתם — ניו-בורן", "פרטי אלבום", "הלקוחה סיימה לבחור תמונות", "🔥 ליד חם מהשאלון"]) assert.equal(unmarkedMailIsPhotographer(s), true, s);
  for (const s of ["💬 לקוחה מחכה לך בוואטסאפ", "התאריך 15.11 התפנה בסטודיו", "הזמנה חדשה — השכרת אביזרים", "הודעה חדשה בטלפון"]) assert.equal(unmarkedMailIsPhotographer(s), false, s);
});

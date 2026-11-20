import { test } from "node:test";
import assert from "node:assert/strict";
import { isBlankTemplateDraft, ownDraftText } from "./draft-template";

const QUOTE = "בתאריך יום ד׳, 18 בנוב׳ 2026, 17:07, מאת תפארת שיש <info@tiferetshish.com>: היי מיכל, מה שלומך?";

test("empty snippet is blank", () => {
  assert.equal(isBlankTemplateDraft(""), true);
  assert.equal(isBlankTemplateDraft("   "), true);
});

test("card only + quote (the real duplicate seen on 18.11) is blank", () => {
  const s = `MICHAL SIBONI צילומי ניו לגלריה שלי לאתר הסטודיו שליחת מייל ${QUOTE}`;
  assert.equal(isBlankTemplateDraft(s), true);
});

test("studio card only is blank", () => {
  const s = "Sweetbaby סטודיו בוטיק לצילום · בית שמש ♥ Sweetbaby · תלמוד ירושלמי 24, בית שמש · 054-8529277 לאתר הסטודיו ניווט בוויז שליחת מייל";
  assert.equal(isBlankTemplateDraft(s), true);
});

test("the designed blank template (היי, + signature) is blank", () => {
  assert.equal(isBlankTemplateDraft("MICHAL SIBONI צילומי ניו בורן ומשפחה היי, MICHAL SIBONI 053-418-1051 לגלריה שלי"), true);
});

test("a draft with a person's own words is NOT blank", () => {
  const s = `MICHAL SIBONI צילומי ניו בורן ומשפחה בכל אופן אשמח למשהו הטבה כלשהי לגלריה שלי לאתר הסטודיו שליחת מייל ${QUOTE}`;
  assert.equal(isBlankTemplateDraft(s), false);
  assert.equal(ownDraftText(s), "בכל אופן אשמח למשהו הטבה כלשהי");
});

test("the assistant's written studio draft is NOT blank", () => {
  assert.equal(
    isBlankTemplateDraft("סטודיו בוטיק לצילום · בית שמש היי צפורה, אבדוק במערכת אם ההזמנה שלך ל-27 לחודש נקלטה"),
    false,
  );
});

test("English quote line is cut too", () => {
  assert.equal(isBlankTemplateDraft("MICHAL SIBONI לגלריה שלי On Wed, Nov 18, 2026 01:12 PM, Michal <a@b.com> wrote: hello"), true);
});

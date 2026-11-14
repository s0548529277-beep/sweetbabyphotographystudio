import { test } from "node:test";
import assert from "node:assert/strict";
import { applyContractOverrides, sectionHtmlToText, textToSectionHtml } from "./contract-overrides";

test("override replaces an editable section only", () => {
  const sections = [
    { title: "סטייילינג", html: "<p>old</p>" },
    { title: "מקדמה", html: "<p>300</p>" },
  ];
  const out = applyContractOverrides("outdoor", sections, { סטייילינג: "new line", מקדמה: "hack" });
  assert.match(out[0].html, /new line/);
  assert.equal(out[1].html, "<p>300</p>");
});

test("text <-> html round trip keeps paragraphs and escapes", () => {
  const html = textToSectionHtml("שורה א\nשורה <ב>");
  assert.equal(sectionHtmlToText(html), "שורה א\nשורה <ב>");
});

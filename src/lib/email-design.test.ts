import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_EMAIL_DESIGN, applyEmailDesignToHtml, sanitizeEmailDesign } from "./email-design";

const studioHtml = `<div dir="rtl" data-mail="studio" style="background:#e9dcc8;background-image:linear-gradient(160deg,#dfe8d3 0%,#f3d9d2 55%,#e9d3b9 100%);padding:26px 16px;direction:rtl"><h2 style="color:#2d3d2b">x</h2></div>`;

test("defaults leave the mail unchanged", () => {
  assert.equal(applyEmailDesignToHtml(studioHtml, DEFAULT_EMAIL_DESIGN), studioHtml);
});

test("colours and frame are swapped, only for marked mails", () => {
  const d = sanitizeEmailDesign({ studio: { from: "#112233", accent: "#445566", frame: "thin" } });
  const out = applyEmailDesignToHtml(studioHtml, d);
  assert.ok(out.includes("#112233 0%") && out.includes("color:#445566") && out.includes("padding:12px 8px;"));
  assert.equal(applyEmailDesignToHtml("<p>#2d3d2b</p>", d), "<p>#2d3d2b</p>");
});

test("a new colour equal to another default is not swapped twice", () => {
  const d = sanitizeEmailDesign({ studio: { from: "#f3d9d2", mid: "#dfe8d3" } });
  const out = applyEmailDesignToHtml(studioHtml, d);
  assert.ok(out.includes("#f3d9d2 0%,#dfe8d3 55%"));
});

test("sanitize rejects bad input", () => {
  const d = sanitizeEmailDesign({ studio: { from: "red", frame: "huge" }, cardPhotos: { newborn: ["http://x.com/a.jpg", "https://ok.example/a.jpg", 5] } });
  assert.equal(d.studio.from, DEFAULT_EMAIL_DESIGN.studio.from);
  assert.equal(d.studio.frame, "thick");
  assert.deepEqual(d.cardPhotos.newborn, ["https://ok.example/a.jpg"]);
});

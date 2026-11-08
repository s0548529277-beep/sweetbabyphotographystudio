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

test("plain pill buttons become rotating ones (dark = primary, light = soft), animated GIF links are untouched", async () => {
  const { rotateButtons } = await import("./email-design");
  const html = `<a href="x" style="display:inline-block;background:#2d3d2b;color:#f8ede4;border-radius:999px;padding:10px">A</a><a href="y" style="background:#f8ede4;color:#2d3d2b;border:1px solid #2d3d2b;border-radius:999px;display:inline-block">B</a><a href="z" style="display:inline-block;margin:2px"><img src="g.gif"></a>`;
  const out = rotateButtons(html, "studio");
  assert.match(out, /<a class="rb" href="x" style="background:#2d3d2b;background-image:linear-gradient\(120deg,#3d5a3a/);
  assert.match(out, /<a class="rb2" href="y"/);
  assert.ok(out.includes('<a href="z" style="display:inline-block;margin:2px">'));
  assert.equal(rotateButtons(out, "studio"), out);
});

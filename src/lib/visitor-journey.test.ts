import test from "node:test";
import assert from "node:assert/strict";
import { buildJourney, emailKey, hotRule, pageLabel, phoneKey } from "./visitor-journey";

test("phoneKey: every spelling of the same Israeli mobile matches", () => {
  const spellings = ["054-123-4567", "0541234567", "+972541234567", "972-54-1234567", "00972541234567", " 054 123 4567 "];
  for (const s of spellings) assert.equal(phoneKey(s), "541234567", s);
});

test("phoneKey: junk and too-short values give null", () => {
  assert.equal(phoneKey(""), null);
  assert.equal(phoneKey(null), null);
  assert.equal(phoneKey("12345"), null);
  assert.equal(phoneKey("abc"), null);
});

test("emailKey lowercases and rejects non-emails", () => {
  assert.equal(emailKey("  Dana@Example.COM "), "dana@example.com");
  assert.equal(emailKey("nope"), null);
  assert.equal(emailKey(undefined), null);
});

test("hotRule: three visits is hot", () => {
  const r = hotRule(3, []);
  assert.equal(r.hot, true);
  assert.equal(r.reasons.length, 1);
});

test("hotRule: 60 seconds on a price/booking page is hot, on the home page it is not", () => {
  assert.equal(hotRule(1, [{ path: "/booking", seconds: 60 }]).hot, true);
  assert.equal(hotRule(1, [{ path: "/studio-rental", seconds: 30 }, { path: "/cart", seconds: 31 }]).hot, true);
  assert.equal(hotRule(1, [{ path: "/", seconds: 600 }]).hot, false);
  assert.equal(hotRule(2, [{ path: "/booking", seconds: 59 }]).hot, false);
});

test("buildJourney: counts sessions, sums dwell per page, caps bad values, ignores clicks and other sessions", () => {
  const sessions = [
    { id: "s2", first_seen: "2026-11-02T10:00:00Z", last_seen: "2026-11-02T10:05:00Z", source: "direct" },
    { id: "s1", first_seen: "2026-11-01T09:00:00Z", last_seen: "2026-11-01T09:04:00Z", source: "google" },
  ];
  const events = [
    { session_id: "s1", type: "pageview", path: "/studio-rental", duration_seconds: 40 },
    { session_id: "s2", type: "pageview", path: "/studio-rental", duration_seconds: 30 },
    { session_id: "s2", type: "pageview", path: "/", duration_seconds: null },
    { session_id: "s2", type: "click", path: "/", duration_seconds: 999 },
    { session_id: "s2", type: "pageview", path: "/blog", duration_seconds: 99999 },
    { session_id: "other", type: "pageview", path: "/booking", duration_seconds: 500 },
  ];
  const j = buildJourney(sessions, events);
  assert.equal(j.visits, 2);
  assert.equal(j.source, "google");
  assert.equal(j.firstSeen, "2026-11-01T09:00:00Z");
  assert.equal(j.lastSeen, "2026-11-02T10:05:00Z");
  assert.equal(j.pages[0].path, "/blog");
  assert.equal(j.pages[0].seconds, 1800);
  const studio = j.pages.find((p) => p.path === "/studio-rental")!;
  assert.equal(studio.views, 2);
  assert.equal(studio.seconds, 70);
  assert.equal(studio.label, "השכרת סטודיו");
  assert.equal(j.hot, true);
});

test("buildJourney: empty input is a quiet zero journey", () => {
  const j = buildJourney([], []);
  assert.equal(j.visits, 0);
  assert.equal(j.hot, false);
  assert.equal(j.lastSeen, null);
});

test("pageLabel falls back to prefixes and then to the raw path", () => {
  assert.equal(pageLabel("/items/abc"), "עמוד פריט");
  assert.equal(pageLabel("/deposit/booking/1"), "תשלום מקדמה");
  assert.equal(pageLabel("/something-new"), "/something-new");
});

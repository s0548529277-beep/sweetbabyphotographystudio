import test from "node:test";
import assert from "node:assert/strict";
import {
  hubBalance,
  hubIsPaid,
  hubKind,
  newbornToHub,
  outdoorToHub,
  sortHubRows,
  studioToHub,
} from "./client-hub";

const base = {
  contact_name: "רחל",
  contact_phone: "0501234567",
  contact_email: null,
  session_date: "2026-12-01",
  session_time: "10:30:00",
  total_price: "1200",
  amount_paid: 200,
  notes: null,
  created_at: "2026-11-01T10:00:00Z",
};

test("each kind keeps its own colour scope", () => {
  assert.equal(hubKind("newborn").scope, "kind-newborn");
  assert.equal(hubKind("outdoor").scope, "kind-outdoor");
  assert.equal(hubKind("studio").scope, "kind-studio");
});

test("converters normalise time, numbers and default package names", () => {
  const o = outdoorToHub({ id: "o1", ...base, package_name: null });
  assert.equal(o.kind, "outdoor");
  assert.equal(o.time, "10:30");
  assert.equal(o.total, 1200);
  assert.equal(o.packageName, "צילומי חוץ");
  const s = studioToHub({ id: "s1", ...base });
  assert.equal(s.kind, "studio");
  assert.equal(s.packageName, "סטודיו מותאם אישית");
  assert.equal(s.galleryOpenedAt, null);
  const n = newbornToHub({ id: "n1", ...base, package_id: "unknown_pkg", gallery_opened_at: "2026-11-02T00:00:00Z" });
  assert.equal(n.kind, "newborn");
  assert.equal(n.packageName, "unknown_pkg");
  assert.equal(n.galleryOpenedAt, "2026-11-02T00:00:00Z");
});

test("balance never goes negative and paid means total reached", () => {
  const r = studioToHub({ id: "s1", ...base, amount_paid: 1500 });
  assert.equal(hubBalance(r), 0);
  assert.equal(hubIsPaid(r), true);
  const open = studioToHub({ id: "s2", ...base });
  assert.equal(hubBalance(open), 1000);
  assert.equal(hubIsPaid(open), false);
  const free = studioToHub({ id: "s3", ...base, total_price: 0, amount_paid: 0 });
  assert.equal(hubIsPaid(free), false);
});

test("rows are sorted newest first across kinds", () => {
  const rows = sortHubRows([
    outdoorToHub({ id: "a", ...base, created_at: "2026-11-01T00:00:00Z" }),
    studioToHub({ id: "b", ...base, created_at: "2026-11-03T00:00:00Z" }),
    newbornToHub({ id: "c", ...base, package_id: "x", created_at: "2026-11-02T00:00:00Z" }),
  ]);
  assert.deepEqual(rows.map((r) => r.id), ["b", "c", "a"]);
});

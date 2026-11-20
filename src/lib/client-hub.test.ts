import test from "node:test";
import assert from "node:assert/strict";
import {
  generalToHub,
  hubBalance,
  hubInProgress,
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
  assert.equal(hubKind("general").scope, "kind-general");
});

test("general photo clients are normalised and send-only is flagged", () => {
  const g = generalToHub(
    { id: "g1", contact_name: "דנה", contact_phone: "—", contact_email: "", session_date: "2026-12-02T00:00:00", session_time: "09:15:00", total_price: 450, amount_paid: 150, stage: "proofs_ready", has_package: false, wants_editing: false, created_at: "2026-11-02T10:00:00Z" },
    "שליחת תמונות בלבד",
  );
  assert.equal(g.kind, "general");
  assert.equal(g.phone, "");
  assert.equal(g.email, null);
  assert.equal(g.date, "2026-12-02");
  assert.equal(g.time, "09:15");
  assert.equal(hubBalance(g), 300);
  assert.equal(g.raw.sendOnly, true);
});

test("in-progress rules per kind", () => {
  const today = "2026-11-20";
  const nb = newbornToHub({ id: "n1", ...base, session_date: "2026-11-10", package_id: "mini", delivered_at: null });
  assert.equal(hubInProgress(nb, today), true);
  assert.equal(hubInProgress(newbornToHub({ id: "n2", ...base, session_date: "2026-11-10", package_id: "mini", delivered_at: "2026-11-15" }), today), false);
  assert.equal(hubInProgress(newbornToHub({ id: "n3", ...base, session_date: "2026-12-10", package_id: "mini" }), today), false);
  const g = (stage: string, date: string | null, extra: any = {}) =>
    generalToHub({ id: "g", contact_name: "x", session_date: date, stage, has_package: true, wants_editing: null, ...extra }, "");
  assert.equal(hubInProgress(g("proofs_ready", "2026-12-30"), today), true);
  assert.equal(hubInProgress(g("booked", "2026-11-01"), today), true);
  assert.equal(hubInProgress(g("booked", "2026-12-01"), today), false);
  assert.equal(hubInProgress(g("album_published", "2026-11-01"), today), false);
  assert.equal(hubInProgress(g("album_published", "2026-11-01", { has_package: false, wants_editing: false }), today), false);
  assert.equal(hubInProgress(studioToHub({ id: "s", ...base, session_date: "2026-11-01" }), today), false);
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

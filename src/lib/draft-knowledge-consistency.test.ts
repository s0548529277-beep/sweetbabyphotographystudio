import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findNewbornPackage } from "./newborn-packages";

/* The draft assistant's KNOWLEDGE text and the mail price cards repeat package numbers by hand.
   This keeps them equal to newborn-packages.ts (the single source of truth). */
const knowledge = readFileSync(new URL("./email-drafts.server.ts", import.meta.url), "utf8");
const design = readFileSync(new URL("./email-draft-design.ts", import.meta.url), "utf8");
const fmt = (n: number) => n.toLocaleString("en-US");

test("pampering package numbers match the price card and the knowledge text", () => {
  const p = findNewbornPackage("pampering")!;
  assert.ok(design.includes(`${fmt(p.price)}₪`), "price card price");
  assert.ok(design.includes(`${p.photosToEdit} תמונות מעובדות`), "price card photo count");
  assert.ok(design.includes(`${p.sets} סטים`), "price card sets");
  assert.ok(knowledge.includes(`${fmt(p.price)}₪`), "knowledge price");
});

test("mini and dreamy prices appear in the price card", () => {
  for (const id of ["mini", "dreamy"]) {
    const p = findNewbornPackage(id)!;
    assert.ok(design.includes(`${fmt(p.price)}₪`), id);
    assert.ok(design.includes(`${p.photosToEdit} תמונות מעובדות`), id);
  }
});

test("birth-basket text says 3 sets and 12 photos, not the old numbers", () => {
  assert.ok(knowledge.includes("3 סטים, 12 תמונות ערוכות"));
  assert.ok(!/4 סטים, 12 תמונות/.test(knowledge));
});

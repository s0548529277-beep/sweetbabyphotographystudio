import { describe, test } from "node:test";
import { strictEqual } from "node:assert";
import { rowMatches, parseIgnoreList, inIgnoreList } from "./closed-customer";

describe("closed customer matching", () => {
  test("phone matches by last 9 digits", () => {
    strictEqual(rowMatches({ contact_phone: "+972-58-321-1802" }, "0583211802", null), true);
    strictEqual(rowMatches({ contact_phone: "0583211803" }, "0583211802", null), false);
  });
  test("email matches case-insensitively", () => {
    strictEqual(rowMatches({ contact_email: "A@B.com" }, null, "a@b.com"), true);
  });
  test("ignore list matches phoneKey without leading 0", () => {
    const l = parseIgnoreList('{"phones":["583211802"],"emails":["x@y.com"]}');
    strictEqual(inIgnoreList(l, "058-321-1802", null), true);
    strictEqual(inIgnoreList(l, null, "X@y.com"), true);
    strictEqual(inIgnoreList(l, "0500000000", null), false);
  });
  test("broken JSON is ignored", () => {
    strictEqual(inIgnoreList(parseIgnoreList("{bad"), "0583211802", null), false);
  });
});

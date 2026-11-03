import { describe, test } from "node:test";
import { strictEqual } from "node:assert";
import { isStudioDateQuestion, parseChatDate } from "./chat-prefetch.server";

// Monday 2026-11-02
const TODAY = "2026-11-02";
describe("chat prefetch date parsing", () => {
  test("relative words", () => {
    strictEqual(parseChatDate("פנוי מחר בשעה 10?", TODAY), "2026-11-03");
    strictEqual(parseChatDate("יש מקום היום?", TODAY), "2026-11-02");
    strictEqual(parseChatDate("מחרתיים בבוקר", TODAY), "2026-11-04");
  });
  test("numeric dates", () => {
    strictEqual(parseChatDate("ב-20/11/2026", TODAY), "2026-11-20");
    strictEqual(parseChatDate("ב 5.12", TODAY), "2026-12-05");
    strictEqual(parseChatDate("1-11", TODAY), "2027-11-01"); // already passed this year -> next year
  });
  test("no date / invalid date", () => {
    strictEqual(parseChatDate("מתי הכי קרוב פנוי?", TODAY), null);
    strictEqual(parseChatDate("31/02", TODAY), null);
    strictEqual(parseChatDate("שעה 10:30", TODAY), null);
  });
  test("only studio questions are prefetched", () => {
    strictEqual(isStudioDateQuestion("הסטודיו פנוי מחר?"), true);
    strictEqual(isStudioDateQuestion("יש כיסא עץ פנוי ב-20/11?"), false);
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import { buildConversations, cleanSubject, parseAddressList, replyRecipients, stripQuoted, type ThreadMeta } from "./mailchat";

const meta = (over: Partial<ThreadMeta>): ThreadMeta => ({
  threadId: "t1",
  account: "m@x.com",
  subject: "שלום",
  lastDate: 1,
  snippet: "",
  unread: false,
  participants: [{ name: "דנה", email: "dana@x.com" }],
  lastFromMe: false,
  channel: "personal",
  firstMessageId: "<1@x>",
  hasDraft: false,
  ...over,
});

test("parseAddressList handles names, quotes and commas inside quotes", () => {
  const r = parseAddressList('דנה <Dana@x.com>, "Levi, Avi" <avi@y.com>, plain@z.com');
  assert.deepEqual(
    r.map((a) => a.email),
    ["dana@x.com", "avi@y.com", "plain@z.com"],
  );
  assert.equal(r[1].name, "Levi, Avi");
  assert.equal(r[2].name, "");
  assert.deepEqual(parseAddressList("undisclosed-recipients:;"), []);
});

test("cleanSubject strips stacked prefixes", () => {
  assert.equal(cleanSubject("Re: Fwd: השב: הצעה"), "הצעה");
  assert.equal(cleanSubject(""), "(ללא נושא)");
});

test("stripQuoted cuts the quoted previous mail", () => {
  assert.equal(stripQuoted("תודה רבה\n\nOn Mon, 3 Nov 2026 at 10:00, Dana <d@x.com> wrote:\n> hello"), "תודה רבה");
  assert.equal(stripQuoted("בסדר\n> ציטוט"), "בסדר");
});

test("one-person threads merge into one chat; a draft marks the chat", () => {
  const c = buildConversations([meta({ threadId: "a", lastDate: 5, hasDraft: true }), meta({ threadId: "b", lastDate: 9, snippet: "new" })]);
  assert.equal(c.length, 1);
  assert.equal(c[0].threads.length, 2);
  assert.equal(c[0].snippet, "new");
  assert.equal(c[0].isGroup, false);
  assert.equal(c[0].hasDraft, true);
});

test("multi-recipient thread is a group with reply-all", () => {
  const parts = [
    { name: "דנה", email: "dana@x.com" },
    { name: "אבי", email: "avi@x.com" },
  ];
  const c = buildConversations([meta({ threadId: "g", subject: "Re: מפגש צלמות", participants: parts })]);
  assert.equal(c[0].isGroup, true);
  assert.equal(c[0].title, "מפגש צלמות");
  assert.deepEqual(replyRecipients(parts), ["dana@x.com", "avi@x.com"]);
});

test("chats are sorted newest first", () => {
  const c = buildConversations([
    meta({ participants: [{ name: "א", email: "a@x.com" }], lastDate: 1 }),
    meta({ threadId: "z", participants: [{ name: "ב", email: "b@x.com" }], lastDate: 2 }),
  ]);
  assert.equal(c[0].participants[0].email, "b@x.com");
});

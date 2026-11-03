#!/usr/bin/env node
// Bot smoke test (owner request 2026-11-03): runs 10 fixed questions plus a 3-turn studio-booking conversation
// against the live site chat, ONE AFTER ANOTHER, anonymous, and reports time per question and empty replies.
// It never creates a booking (it stops before confirming). Usage:
//   node scripts/bot-smoke-test.mjs [https://sweetbabyphoto.shop]
// Exit code 1 when any reply is empty or the average tool-turn time is above 15s.
const BASE = (process.argv[2] || "https://sweetbabyphoto.shop").replace(/\/$/, "");
const QUESTIONS = [
  "מה שעות הפעילות והמחיר של הסטודיו?",
  "איך מגיעים אליכם?",
  "יש לכם קופון הנחה?",
  "כמה עולה סשן ניו-בורן?",
  "יש לכם אביזרי חלאקה?",
  "יש כיסא עץ פנוי בעוד שבועיים?",
  "אני מחפשת סמאש קייק לגיל שנה",
  "יש סטודיו פנוי מחר ב-10:00 ל-3 שעות?",
  "יש סטודיו פנוי ב-15 בחודש הבא?",
  "מה התאריך העברי היום וכמה עולה סשן ארוך?",
];
const sessionId = `smoke-${Date.now()}`;

async function ask(messages, extra = {}) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/chat-stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages, sessionId, isAuthenticated: false, cartLines: [], ...extra }),
  });
  const text = await res.text();
  let final = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line);
      if (ev.t === "f") final = ev;
    } catch {}
  }
  return { ms: Date.now() - t0, status: res.status, final };
}

const rows = [];
let empty = 0;
const record = (label, r) => {
  const reply = r.final?.reply ?? "";
  const isEmpty = !reply.trim() || reply.trim() === "…";
  const generic = /מצאתי לך כמה אפשרויות|לא הצלחתי לנסח/.test(reply);
  if (isEmpty || !r.final) empty++;
  rows.push({ label, s: (r.ms / 1000).toFixed(1), http: r.status, empty: isEmpty || !r.final ? "כן" : "", generic: generic ? "כן" : "", wizard: r.final?.ui?.wizard ? "אשף" : "", reply: reply.replace(/\s+/g, " ").slice(0, 70) });
};

for (const q of QUESTIONS) {
  try {
    record(q.slice(0, 28), await ask([{ role: "user", content: q }]));
  } catch (e) {
    empty++;
    rows.push({ label: q.slice(0, 28), s: "-", http: "ERR", empty: "כן", generic: "", wizard: "", reply: String(e).slice(0, 70) });
  }
}

// 3-turn booking conversation (no booking is created: we stop before any confirmation)
const convo = [];
for (const [i, msg] of ["אני רוצה להזמין את הסטודיו מחר ב-10:00 ל-3 שעות", "כן תפתחי לי את ההזמנה", "מיכל בדיקה, 0500000000, test@example.com"].entries()) {
  convo.push({ role: "user", content: msg });
  try {
    const r = await ask(convo.slice());
    record(`הזמנה שלב ${i + 1}`, r);
    convo.push({ role: "assistant", content: r.final?.reply || "…" });
  } catch (e) {
    empty++;
    rows.push({ label: `הזמנה שלב ${i + 1}`, s: "-", http: "ERR", empty: "כן", generic: "", wizard: "", reply: String(e).slice(0, 70) });
  }
}

console.table(rows);
const secs = rows.map((r) => Number(r.s)).filter((n) => !Number.isNaN(n));
const avg = secs.reduce((a, b) => a + b, 0) / (secs.length || 1);
console.log(`ממוצע ${avg.toFixed(1)}ש׳ · מקסימום ${Math.max(...secs).toFixed(1)}ש׳ · תשובות ריקות: ${empty} · כלליות: ${rows.filter((r) => r.generic).length}`);
process.exit(empty > 0 || avg > 15 ? 1 : 0);

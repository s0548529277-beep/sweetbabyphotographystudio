// Pure helpers for the "מייל כוואטסאפ" admin screen (/admin/mail-chat).
// No I/O here so everything can be unit-tested (see mailchat.test.ts).

export type MailAddress = { name: string; email: string };

/** Splits "A <a@x.com>, \"B, C\" <b@x.com>, c@x.com" into addresses (commas inside quotes are kept). */
export function parseAddressList(raw: string | null | undefined): MailAddress[] {
  if (!raw) return [];
  const parts: string[] = [];
  let cur = "";
  let inQuotes = false;
  let inAngle = false;
  for (const ch of raw) {
    if (ch === '"') inQuotes = !inQuotes;
    if (!inQuotes) {
      if (ch === "<") inAngle = true;
      if (ch === ">") inAngle = false;
    }
    if (ch === "," && !inQuotes && !inAngle) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  const out: MailAddress[] = [];
  for (const p of parts) {
    const m = p.match(/<([^>]+)>/);
    const email = (m ? m[1] : p).trim().replace(/^mailto:/i, "").toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    const name = (m ? p.slice(0, p.indexOf("<")) : "").trim().replace(/^"+|"+$/g, "").trim();
    out.push({ name: name && name.toLowerCase() !== email ? name : "", email });
  }
  return out;
}

/** Removes "Re:" / "Fwd:" / "השב:" / "הועבר:" prefixes so the same conversation has one subject. */
export function cleanSubject(subject: string | null | undefined): string {
  let s = (subject ?? "").trim();
  for (let i = 0; i < 5; i++) {
    const next = s.replace(/^\s*(re|fwd?|fw|השב|תגובה|הועבר)\s*:\s*/i, "");
    if (next === s) break;
    s = next;
  }
  return s.trim() || "(ללא נושא)";
}

/** Cuts the quoted previous mail and the signature-ish tail so a message looks like a chat bubble. */
export function stripQuoted(text: string): string {
  const lines = (text ?? "").replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (/^>/.test(t)) break;
    if (/^-{2,}\s*(original message|הודעה מקורית|forwarded message)/i.test(t)) break;
    if (/^(on|בתאריך|ב-?).{5,200}(wrote|כתב|כתבה|כתב\/ה)\s*:?\s*$/i.test(t)) break;
    if (/^(from|מאת)\s*:/i.test(t) && kept.length > 0 && /^(sent|date|נשלח|תאריך)\s*:/i.test((lines[i + 1] ?? "").trim())) break;
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export type ThreadMeta = {
  threadId: string;
  account: string; // linked Gmail account the thread was read from
  subject: string;
  lastDate: number; // ms
  snippet: string;
  unread: boolean;
  participants: MailAddress[]; // everyone except our own addresses
  lastFromMe: boolean;
  channel: "studio" | "personal";
  firstMessageId: string; // Message-ID header of the first mail, used to dedupe across accounts
  hasDraft: boolean; // a reply draft (e.g. from the site's draft assistant) is waiting in this thread
  /** Site-mail types found in the thread (order / lead kinds from `classifySiteMail`), for the permanent mark. */
  kinds?: string[];
};

export type MailConversation = {
  key: string;
  title: string;
  subtitle: string;
  isGroup: boolean;
  participants: MailAddress[];
  channel: "studio" | "personal";
  lastDate: number;
  snippet: string;
  lastFromMe: boolean;
  unread: boolean;
  hasDraft: boolean;
  /** Order / lead kinds of all its threads (empty = an ordinary mail chat). */
  kinds: string[];
  threads: Array<{ threadId: string; account: string }>;
};

/**
 * WhatsApp-style grouping:
 *  - threads with exactly one other person  -> ONE conversation per person (all their threads merged);
 *  - threads with two or more other people  -> a GROUP, one per thread, titled by the subject.
 */
export function buildConversations(metas: ThreadMeta[]): MailConversation[] {
  const byKey = new Map<string, MailConversation>();
  for (const m of metas) {
    const isGroup = m.participants.length >= 2;
    // A group = the same set of people, whatever the thread / subject, so all their mails read as one continuous chat.
    const key = isGroup
      ? `g:${[...new Set(m.participants.map((p) => p.email))].sort().join(",")}`
      : `p:${m.participants[0]?.email ?? `t:${m.threadId}`}`;
    const names = m.participants.map((p) => p.name || p.email.split("@")[0]);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        key,
        // A site notice sent to ourselves has no other person: its subject is its name.
        title: isGroup ? groupTitle(names) : names[0] || m.subject.trim() || "(ללא שולח)",
        subtitle: isGroup ? names.join(", ") : m.participants[0]?.email ?? "",
        isGroup,
        participants: m.participants,
        channel: m.channel,
        lastDate: m.lastDate,
        snippet: m.snippet,
        lastFromMe: m.lastFromMe,
        unread: m.unread,
        hasDraft: m.hasDraft,
        kinds: [...new Set(m.kinds ?? [])],
        threads: [{ threadId: m.threadId, account: m.account }],
      });
      continue;
    }
    existing.threads.push({ threadId: m.threadId, account: m.account });
    existing.unread = existing.unread || m.unread;
    existing.hasDraft = existing.hasDraft || m.hasDraft;
    for (const k of m.kinds ?? []) if (!existing.kinds.includes(k)) existing.kinds.push(k);
    if (m.channel === "studio") existing.channel = "studio";
    if (m.lastDate > existing.lastDate) {
      existing.lastDate = m.lastDate;
      existing.snippet = m.snippet;
      existing.lastFromMe = m.lastFromMe;
    }
  }
  const list = [...byKey.values()];
  // Newest threads first, so a long chat loads its latest mails.
  const dateOf = new Map(metas.map((m) => [`${m.account}:${m.threadId}`, m.lastDate]));
  for (const c of list) c.threads.sort((a, b) => (dateOf.get(`${b.account}:${b.threadId}`) ?? 0) - (dateOf.get(`${a.account}:${a.threadId}`) ?? 0));
  return list.sort((a, b) => b.lastDate - a.lastDate);
}

/** WhatsApp-like group name from its members: "דנה, אבי ועוד 2". */
export function groupTitle(names: string[]): string {
  const n = names.filter(Boolean);
  if (n.length <= 3) return n.join(", ");
  return `${n.slice(0, 2).join(", ")} ועוד ${n.length - 2}`;
}

/** Recipients of a reply: a person -> that person; a group -> everybody (reply-all). */
export function replyRecipients(participants: MailAddress[]): string[] {
  return [...new Set(participants.map((p) => p.email))];
}

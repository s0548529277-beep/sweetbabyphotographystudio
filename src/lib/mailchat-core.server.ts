// Shared server core of the mail chat (/admin/mail-chat): reading Gmail threads, sending replies / new mails,
// and the scheduled-send runner. Used by admin-mailchat.functions.ts and by /api/run-email-drafts (scheduled sends).
import {
  listGmailAccounts,
  resolveGmailAccount,
  gmailApi,
  gmailHeaderValue,
  encodeGmailHeader,
  gmailToBase64Url,
  sendGmailDetailed,
  type GmailAttachment,
} from "@/integrations/google/gmail.server";
import { buildBrandedMailHtml, buildStudioMailHtml, esc } from "@/lib/email-draft-design";
import { isOwnStudioAddress, isStudioChannelAddress } from "@/lib/studio-addresses";
import { LEAD_SUBJECT_HEADER, effectiveSubject } from "@/lib/lead-thread";
import { classifySiteMail, type SiteMailKind } from "@/lib/mail-labels";
import { cleanSubject, parseAddressList, replyRecipients, type MailAddress, type ThreadMeta } from "@/lib/mailchat";

export const META_HEADERS = ["From", "To", "Cc", "Subject", "Date", "Delivered-To", "Message-ID", "List-Id", "List-Unsubscribe", "Auto-Submitted", "Precedence", "X-Auto-Response-Suppress", "X-Site-Lead-Subject"];
export const META_QS = META_HEADERS.map((h) => `metadataHeaders=${h}`).join("&");
export const MAX_ATTACH_BYTES = 18 * 1024 * 1024;
export const SCHEDULED_KEY = "mail_chat_scheduled";

export type Channel = "studio" | "personal";

/** Our own addresses: every linked Gmail account plus the studio mailboxes/domain. */
export function makeIsOwn(accounts: Array<{ email: string }>) {
  const linked = new Set(accounts.map((a) => a.email.toLowerCase()));
  return (email: string) => linked.has(email.toLowerCase()) || isOwnStudioAddress(email) || isStudioChannelAddress(email);
}

export function headersOf(msg: any): any[] {
  return msg?.payload?.headers ?? [];
}

export const isDraftMsg = (m: any) => (m?.labelIds ?? []).includes("DRAFT");

const AUTO_LOCAL =
  /^(?:no[-_.]?reply|do[-_.]?not[-_.]?reply|donotreply|noreply|notifications?|notify|notice|alerts?|mailer[-_.]?daemon|postmaster|bounces?|news(?:letter)?s?|info|updates?|support|billing|invoices?|receipts?|accounts?|account[-_.]?security|security|team|hello|marketing|promo(?:tions?)?|offers?|deals?|sales|service|system|admin|automated|calendar[-_.]?notification|feedback|reply|welcome|members?|community|digest|orders?|shop|store|crm|mail)(?:[-_.+]|$)/i;
const AUTO_DOMAIN =
  /(?:^|\.)(?:google\.com|googlemail\.com|youtube\.com|facebookmail\.com|facebook\.com|meta\.com|instagram\.com|linkedin\.com|github\.com|lovable\.dev|lovable\.app|supabase\.(?:com|io)|vercel\.com|cloudflare\.com|paypal\.com|amazon\.com|aliexpress\.com|temu\.com|shein\.com|apple\.com|icloud\.com|microsoft\.com|zoom\.us|wix\.com|canva\.com|mailchimp\.com|mcsv\.net|sendgrid\.net|hubspot\.com|openai\.com|anthropic\.com|whatsapp\.com|twilio\.com|improvmx\.com|name\.com|rivhit\.co\.il|gov\.il)$/i;

/** A message sent by a machine (shop, newsletter, Google, system) rather than a private person. */
export function isAutomatedMessage(h: any[], from: MailAddress, labelIds: string[]): boolean {
  const v = (n: string) => gmailHeaderValue(h, n).toLowerCase();
  if (v("List-Unsubscribe") || v("List-Id")) return true;
  const auto = v("Auto-Submitted");
  if (auto && auto !== "no") return true;
  if (/^(?:bulk|list|junk)$/.test(v("Precedence").trim())) return true;
  if (v("X-Auto-Response-Suppress")) return true;
  if (labelIds.includes("CATEGORY_PROMOTIONS") || labelIds.includes("CATEGORY_SOCIAL") || labelIds.includes("CATEGORY_FORUMS")) return true;
  const [local, domain = ""] = from.email.toLowerCase().split("@");
  if (AUTO_LOCAL.test(local)) return true;
  if (AUTO_DOMAIN.test(domain)) return true;
  return false;
}

export function metaFromThread(thread: any, account: string, isOwn: (e: string) => boolean): ThreadMeta | null {
  const all: any[] = thread?.messages ?? [];
  const msgs = all.filter((m) => !isDraftMsg(m));
  if (!msgs.length) return null; // a lone new draft is not a conversation yet
  const people = new Map<string, MailAddress>();
  let studio = false;
  for (const m of msgs) {
    const h = headersOf(m);
    for (const name of ["From", "To", "Cc", "Delivered-To"]) {
      for (const a of parseAddressList(gmailHeaderValue(h, name))) {
        if (isStudioChannelAddress(a.email)) studio = true;
        if (name === "Delivered-To" || isOwn(a.email)) continue;
        const prev = people.get(a.email);
        if (!prev || (!prev.name && a.name)) people.set(a.email, a);
      }
    }
  }
  const last = msgs[msgs.length - 1];
  const first = msgs[0];
  // Mailing list / Google Group: the List-Id header ("Name <id>"), else a googlegroups.com address in To / Cc.
  let listId = "";
  let listName = "";
  for (const m of msgs) {
    const raw = gmailHeaderValue(headersOf(m), "List-Id");
    // Only a real group (Google Groups) is a "group"; any other list (newsletters, shops) is an automated mail.
    if (raw && /googlegroups/i.test(raw)) {
      const idm = raw.match(/<([^>]+)>/);
      listId = (idm ? idm[1] : raw).trim().toLowerCase();
      listName = raw.replace(/<[^>]*>/, "").replace(/^["'\s]+|["'\s]+$/g, "").trim();
      break;
    }
  }
  if (!listId) {
    for (const m of msgs) {
      const h = headersOf(m);
      const g = [...parseAddressList(gmailHeaderValue(h, "To")), ...parseAddressList(gmailHeaderValue(h, "Cc"))].find((a) => /@googlegroups\.com$/i.test(a.email));
      if (g) {
        listId = g.email.toLowerCase();
        listName = g.name || "";
        break;
      }
    }
  }
  if (listId && !listName) listName = listId.split(/[@.]/)[0];
  // Automated mail (not from a private person): a shop / newsletter / Google / system notice. The thread counts as
  // automated only when no other person wrote a normal mail in it and it is not a site order / lead.
  let human = false;
  let fromOthers = false;
  for (const m of msgs) {
    const h = headersOf(m);
    const from = parseAddressList(gmailHeaderValue(h, "From"))[0];
    if (!from || isOwn(from.email)) continue;
    fromOthers = true;
    if (!isAutomatedMessage(h, from, m.labelIds ?? [])) human = true;
  }
  // Permanent order / lead mark: the type of every site mail in the thread, judged by its subject.
  const kinds = [...new Set(msgs.map((m) => classifySiteMail(effectiveSubject(gmailHeaderValue(headersOf(m), "Subject"), gmailHeaderValue(headersOf(m), LEAD_SUBJECT_HEADER)))).filter((k): k is SiteMailKind => !!k))];
  const lastFrom = parseAddressList(gmailHeaderValue(headersOf(last), "From"))[0];
  return {
    threadId: thread.id,
    account,
    subject: gmailHeaderValue(headersOf(first), "Subject") || "",
    lastDate: Number(last.internalDate) || Date.parse(gmailHeaderValue(headersOf(last), "Date")) || 0,
    snippet: last.snippet ?? thread.snippet ?? "",
    unread: msgs.some((m) => (m.labelIds ?? []).includes("UNREAD")),
    participants: [...people.values()],
    lastFromMe: !!lastFrom && isOwn(lastFrom.email),
    channel: studio ? "studio" : "personal",
    firstMessageId: gmailHeaderValue(headersOf(first), "Message-ID") || `${account}:${thread.id}`,
    hasDraft: all.length !== msgs.length,
    kinds,
    automated: !listId && fromOthers && !human && !kinds.length,
    ...(listId ? { listId, listName } : {}),
  };
}

export function checkAttachments(list: GmailAttachment[]) {
  const bytes = list.reduce((n, a) => n + Math.floor((a.base64Data.length * 3) / 4), 0);
  if (bytes > MAX_ATTACH_BYTES) throw new Error("הקבצים גדולים מדי (עד 18MB ביחד)");
}

const b64Lines = (b64: string) => b64.replace(/(.{76})/g, "$1\r\n");

/** Plain-text mail (optionally with attachments) as a base64url raw message for the Gmail API. */
export function buildRaw(opts: {
  fromName: string;
  fromEmail: string;
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  inReplyTo?: string;
  attachments?: GmailAttachment[];
}): string {
  const textB64 = gmailToBase64Url(new TextEncoder().encode(opts.text)).replace(/-/g, "+").replace(/_/g, "/");
  const textPart = [
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64Lines(textB64 + "=".repeat((4 - (textB64.length % 4)) % 4)),
  ].join("\r\n");
  const headers = [
    `From: ${encodeGmailHeader(opts.fromName)} <${opts.fromEmail}>`,
    `To: ${opts.to.join(", ")}`,
    ...(opts.cc?.length ? [`Cc: ${opts.cc.join(", ")}`] : []),
    `Subject: ${encodeGmailHeader(opts.subject)}`,
    ...(opts.inReplyTo ? [`In-Reply-To: ${opts.inReplyTo}`, `References: ${opts.inReplyTo}`] : []),
    "MIME-Version: 1.0",
  ];
  const atts = opts.attachments ?? [];
  let mime: string;
  if (!atts.length) {
    mime = `${headers.join("\r\n")}\r\n${textPart}`;
  } else {
    const boundary = `mc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const parts = [
      `--${boundary}\r\n${textPart}`,
      ...atts.map(
        (a) =>
          `--${boundary}\r\nContent-Type: ${a.contentType || "application/octet-stream"}; name="${encodeGmailHeader(a.filename)}"\r\n` +
          `Content-Disposition: attachment; filename="${encodeGmailHeader(a.filename)}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64Lines(a.base64Data)}`,
      ),
      `--${boundary}--`,
    ];
    mime = `${headers.join("\r\n")}\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n${parts.join("\r\n")}`;
  }
  return gmailToBase64Url(new TextEncoder().encode(mime));
}

function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

const senderName = (channel: Channel) => (channel === "studio" ? "Sweetbaby" : "מיכל סיבוני");

/** Designed mail = the brand shell (studio or photographer) around her text; sent through the site's normal sender. */
async function sendDesigned(opts: {
  to: string[];
  subject: string;
  text: string;
  channel: Channel;
  threadId?: string;
  inReplyTo?: string;
  attachments?: GmailAttachment[];
}): Promise<boolean> {
  const inner = textToHtml(opts.text);
  const html = opts.channel === "studio" ? buildStudioMailHtml({ title: "", innerHtml: inner }) : buildBrandedMailHtml({ title: "", innerHtml: inner });
  const r = await sendGmailDetailed({
    to: opts.to.join(", "),
    subject: opts.subject,
    html,
    fromName: senderName(opts.channel),
    threadId: opts.threadId,
    inReplyTo: opts.inReplyTo,
    attachments: opts.attachments,
  });
  return r.ok;
}

export async function deleteDraft(connKey: string, draftId: string) {
  await gmailApi(connKey, `/users/me/drafts/${encodeURIComponent(draftId)}`, { method: "DELETE" });
}

/** Reply inside a Gmail thread. A person -> that person; a group -> everyone (reply-all). */
export async function performReply(opts: {
  threadId: string;
  account: string;
  text: string;
  channel: Channel;
  designed: boolean;
  attachments?: GmailAttachment[];
  replacesDraftId?: string;
  /** Extra people in copy (CC). */
  cc?: string[];
}): Promise<void> {
  const accounts = await listGmailAccounts();
  const acc = accounts.find((a) => a.email === opts.account.toLowerCase());
  if (!acc) throw new Error("חשבון המייל לא מחובר");
  const isOwn = makeIsOwn(accounts);
  const thread = await gmailApi<any>(acc.connKey, `/users/me/threads/${encodeURIComponent(opts.threadId)}?format=metadata&${META_QS}`);
  const meta = thread ? metaFromThread(thread, acc.email, isOwn) : null;
  if (!meta || !meta.participants.length) throw new Error("לא נמצאו נמענים לשרשור הזה");
  const msgs: any[] = (thread.messages ?? []).filter((m: any) => !isDraftMsg(m));
  const lastOther =
    [...msgs].reverse().find((m) => {
      const f = parseAddressList(gmailHeaderValue(headersOf(m), "From"))[0];
      return f && !isOwn(f.email);
    }) ?? msgs[msgs.length - 1];
  const to = replyRecipients(meta.participants);
  const cc = [...new Set((opts.cc ?? []).map((e) => e.toLowerCase()))].filter((e) => !to.some((t) => t.toLowerCase().includes(e)));
  const subject = `Re: ${cleanSubject(meta.subject)}`;
  const inReplyTo = gmailHeaderValue(headersOf(lastOther), "Message-ID") || undefined;
  const attachments = opts.attachments ?? [];

  // The designed sender always goes out from the primary account, so it can only continue that account's threads.
  const primary = await resolveGmailAccount();
  let ok: boolean;
  if (opts.designed && primary?.email === acc.email) {
    // The designed sender has no CC field: people in copy are added as recipients.
    ok = await sendDesigned({ to: [...to, ...cc], subject, text: opts.text, channel: opts.channel, threadId: opts.threadId, inReplyTo, attachments });
  } else {
    const raw = buildRaw({ fromName: senderName(opts.channel), fromEmail: acc.email, to, cc, subject, text: opts.text, inReplyTo, attachments });
    const sent = await gmailApi<{ id?: string }>(acc.connKey, "/users/me/messages/send", { method: "POST", body: { raw, threadId: opts.threadId } });
    ok = !!sent?.id;
  }
  if (!ok) throw new Error("השליחה נכשלה — נסי שוב");
  if (opts.replacesDraftId) await deleteDraft(acc.connKey, opts.replacesDraftId);
}

/** A brand-new mail; several addresses = a new group. */
export async function performStart(opts: {
  to: string[];
  subject: string;
  text: string;
  channel: Channel;
  designed: boolean;
  attachments?: GmailAttachment[];
  cc?: string[];
}): Promise<void> {
  const acc = await resolveGmailAccount();
  if (!acc) throw new Error("חשבון המייל לא מחובר");
  const recipients = [...new Set(opts.to.map((e) => e.toLowerCase()))];
  const cc = [...new Set((opts.cc ?? []).map((e) => e.toLowerCase()))].filter((e) => !recipients.includes(e));
  const attachments = opts.attachments ?? [];
  let ok: boolean;
  if (opts.designed) {
    ok = await sendDesigned({ to: [...recipients, ...cc], subject: opts.subject, text: opts.text, channel: opts.channel, attachments });
  } else {
    const raw = buildRaw({ fromName: senderName(opts.channel), fromEmail: acc.email, to: recipients, cc, subject: opts.subject, text: opts.text, attachments });
    const sent = await gmailApi<{ id?: string }>(acc.connKey, "/users/me/messages/send", { method: "POST", body: { raw } });
    ok = !!sent?.id;
  }
  if (!ok) throw new Error("השליחה נכשלה — נסי שוב");
}

// ── scheduled sends ───────────────────────────────────────────────────────────

export type ScheduledMail = {
  id: string;
  at: number; // ms, when to send
  createdAt: number;
  kind: "reply" | "new";
  chatKey?: string; // to show it inside the right chat
  label: string; // who it goes to, for the list
  text: string;
  channel: Channel;
  designed: boolean;
  threadId?: string;
  account?: string;
  to?: string[];
  cc?: string[];
  subject?: string;
  /** Files of a scheduled mail, kept in the private "items" bucket until it is sent or cancelled. */
  files?: Array<{ path: string; filename: string; contentType: string; size: number }>;
  error?: string;
};

const FILES_BUCKET = "items";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Stores the files of a scheduled mail (they would be far too big for the settings row). */
export async function storeScheduledFiles(db: any, id: string, atts: GmailAttachment[]): Promise<NonNullable<ScheduledMail["files"]>> {
  const out: NonNullable<ScheduledMail["files"]> = [];
  for (const [i, a] of atts.entries()) {
    const bytes = base64ToBytes(a.base64Data);
    const safe = a.filename.replace(/[^\w.\-]+/g, "_").slice(-80) || "file";
    const path = `mail-scheduled/${id}/${i}-${safe}`;
    const { error } = await db.storage.from(FILES_BUCKET).upload(path, bytes, { contentType: a.contentType || "application/octet-stream", upsert: true });
    if (error) {
      await removeScheduledFiles(db, out);
      throw new Error("שמירת הקבצים לתזמון נכשלה");
    }
    out.push({ path, filename: a.filename, contentType: a.contentType || "application/octet-stream", size: bytes.length });
  }
  return out;
}

async function loadScheduledFiles(db: any, files: ScheduledMail["files"]): Promise<GmailAttachment[]> {
  const out: GmailAttachment[] = [];
  for (const f of files ?? []) {
    const { data, error } = await db.storage.from(FILES_BUCKET).download(f.path);
    if (error || !data) throw new Error(`הקובץ ${f.filename} לא נמצא`);
    out.push({ filename: f.filename, contentType: f.contentType, base64Data: bytesToBase64(new Uint8Array(await data.arrayBuffer())) });
  }
  return out;
}

export async function removeScheduledFiles(db: any, files: ScheduledMail["files"]) {
  const paths = (files ?? []).map((f) => f.path);
  if (paths.length) await db.storage.from(FILES_BUCKET).remove(paths).catch(() => undefined);
}

export async function readScheduled(db: any): Promise<ScheduledMail[]> {
  const { data } = await db.from("app_settings").select("value").eq("key", SCHEDULED_KEY).maybeSingle();
  try {
    const list = JSON.parse(data?.value ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function writeScheduled(db: any, list: ScheduledMail[]) {
  const { error } = await db
    .from("app_settings")
    .upsert({ key: SCHEDULED_KEY, value: JSON.stringify(list.slice(-200)), updated_at: new Date().toISOString() });
  if (error) throw new Error("השמירה נכשלה");
}

/**
 * Sends the scheduled mails whose time has come. Each one is taken off the list BEFORE it is sent, so two runs never
 * send it twice; a failed send goes back on the list with its error (shown on the screen) and is not retried.
 * Called every few minutes by /api/run-email-drafts. Like the site's other mail, nothing goes out around Shabbat
 * (isQuietForMail) — a mail due then waits for the next run after it.
 */
export async function runDueScheduledMails(): Promise<{ sent: number; failed: number }> {
  const { isQuietForMail } = await import("@/lib/mail-quiet-hours");
  if (isQuietForMail()) return { sent: 0, failed: 0 };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const list = await readScheduled(db);
  const now = Date.now();
  const due = list.filter((m) => !m.error && m.at <= now);
  if (!due.length) return { sent: 0, failed: 0 };
  const dueIds = new Set(due.map((m) => m.id));
  await writeScheduled(
    db,
    list.filter((m) => !dueIds.has(m.id)),
  );
  let sent = 0;
  const failed: ScheduledMail[] = [];
  for (const m of due) {
    try {
      const attachments = await loadScheduledFiles(db, m.files);
      if (m.kind === "reply" && m.threadId && m.account) {
        await performReply({ threadId: m.threadId, account: m.account, text: m.text, channel: m.channel, designed: m.designed, attachments, cc: m.cc });
      } else if (m.kind === "new" && m.to?.length && m.subject) {
        await performStart({ to: m.to, subject: m.subject, text: m.text, channel: m.channel, designed: m.designed, attachments, cc: m.cc });
      } else throw new Error("חסרים פרטים לשליחה");
      await removeScheduledFiles(db, m.files);
      sent++;
    } catch (e: any) {
      failed.push({ ...m, error: String(e?.message ?? e).slice(0, 200) });
    }
  }
  if (failed.length) await writeScheduled(db, [...(await readScheduled(db)), ...failed]);
  return { sent, failed: failed.length };
}

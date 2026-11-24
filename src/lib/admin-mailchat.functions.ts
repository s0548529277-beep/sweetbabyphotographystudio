import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  listGmailAccounts,
  resolveGmailAccount,
  gmailApi,
  extractGmailPlainText,
  decodeGmailBase64Url,
  gmailHeaderValue,
  encodeGmailHeader,
  gmailToBase64Url,
  sendGmailDetailed,
  type GmailAttachment,
} from "@/integrations/google/gmail.server";
import { buildBrandedMailHtml, buildStudioMailHtml, esc } from "@/lib/email-draft-design";
import { isOwnStudioAddress, isStudioChannelAddress } from "@/lib/studio-addresses";
import {
  buildConversations,
  cleanSubject,
  parseAddressList,
  replyRecipients,
  stripQuoted,
  type MailAddress,
  type ThreadMeta,
} from "@/lib/mailchat";

/**
 * "מיילים כמו וואטסאפ" (/admin/mail-chat). Gmail is the source of truth and is read live, so the screen is
 * always in sync; only the owner's own screen choices (pinned / labels / archived) are kept, in app_settings.
 */

const META_HEADERS = ["From", "To", "Cc", "Subject", "Date", "Delivered-To", "Message-ID"];
const META_QS = META_HEADERS.map((h) => `metadataHeaders=${h}`).join("&");
const PREFS_KEY = "mail_chat_prefs";
const MAX_ATTACH_BYTES = 18 * 1024 * 1024;

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

/** Our own addresses: every linked Gmail account plus the studio mailboxes/domain. */
function makeIsOwn(accounts: Array<{ email: string }>) {
  const linked = new Set(accounts.map((a) => a.email.toLowerCase()));
  return (email: string) => linked.has(email.toLowerCase()) || isOwnStudioAddress(email) || isStudioChannelAddress(email);
}

function headersOf(msg: any): any[] {
  return msg?.payload?.headers ?? [];
}

const isDraftMsg = (m: any) => (m?.labelIds ?? []).includes("DRAFT");

function metaFromThread(thread: any, account: string, isOwn: (e: string) => boolean): ThreadMeta | null {
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
  };
}

const listCache = new Map<string, { at: number; data: any }>();

/** The chat list: recent Gmail threads, grouped like WhatsApp (a person = one chat, several people = a group). */
export const listMailChats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ search: z.string().max(100).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const accounts = await listGmailAccounts();
    if (!accounts.length) return { connected: false, conversations: [] as any[], accounts: [] as string[] };
    const isOwn = makeIsOwn(accounts);
    const search = data.search?.trim() ?? "";
    const q = ["-category:promotions", "-category:social", "-in:spam", "-in:trash", search].filter(Boolean).join(" ");
    const hit = listCache.get(q);
    if (hit && Date.now() - hit.at < 8000) return hit.data;

    const primary = await resolveGmailAccount();
    const metas: ThreadMeta[] = [];
    for (const acc of accounts) {
      const list = await gmailApi<{ threads?: Array<{ id: string }> }>(
        acc.connKey,
        `/users/me/threads?maxResults=${search ? 30 : 50}&q=${encodeURIComponent(q)}`,
      );
      const ids = (list?.threads ?? []).map((t) => t.id);
      const threads = await mapLimit(ids, 8, (id) => gmailApi<any>(acc.connKey, `/users/me/threads/${id}?format=metadata&${META_QS}`));
      for (const t of threads) {
        const m = t ? metaFromThread(t, acc.email, isOwn) : null;
        if (m) metas.push(m);
      }
    }
    // The studio mailbox forwards to the personal one, so the same mail can exist in both: keep one copy (the primary account's).
    const seen = new Set<string>();
    const unique = [...metas]
      .sort((a, b) => Number(b.account === primary?.email) - Number(a.account === primary?.email))
      .filter((m) => (seen.has(m.firstMessageId) ? false : (seen.add(m.firstMessageId), true)));
    const result = { connected: true, conversations: buildConversations(unique), accounts: accounts.map((a) => a.email) };
    listCache.set(q, { at: Date.now(), data: result });
    return result;
  });

type Attachment = { filename: string; mimeType: string; size: number; attachmentId: string; messageId: string };

type ChatMessage = {
  id: string;
  threadId: string;
  account: string;
  at: number;
  fromMe: boolean;
  fromName: string;
  fromEmail: string;
  to: string[];
  subject: string;
  text: string;
  attachments: Attachment[];
  messageIdHeader: string;
};

type ChatDraft = {
  draftId: string;
  messageId: string;
  threadId: string;
  account: string;
  at: number;
  to: string[];
  subject: string;
  text: string; // editable text (design / signature lines removed)
  html: string; // the designed mail exactly as prepared, for the preview
};

function collectAttachments(payload: any, messageId: string, out: Attachment[] = []) {
  if (!payload) return out;
  if (payload.filename && payload.body?.attachmentId) {
    out.push({
      filename: payload.filename,
      mimeType: payload.mimeType ?? "",
      size: payload.body?.size ?? 0,
      attachmentId: payload.body.attachmentId,
      messageId,
    });
  }
  for (const p of payload.parts ?? []) collectAttachments(p, messageId, out);
  return out;
}

function findHtml(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/html" && payload.body?.data) return decodeGmailBase64Url(payload.body.data);
  for (const p of payload.parts ?? []) {
    const h = findHtml(p);
    if (h) return h;
  }
  return "";
}

/** Lines that belong to the designed shell (wordmark, signature, buttons), not to what she wrote. */
const SHELL_LINE =
  /^(MICHAL SIBONI|Sweetbaby|צילומי ניו בורן ומשפחה|סטודיו בוטיק לצילום.*|לגלריה שלי|לאתר הסטודיו|שליחת מייל|ניווט בוויז.*|וויז|לאתר|מייל|05\d[-\s]?\d{3}[-\s]?\d{4}|.*sweetbabyphoto\.shop.*|.*michalsiboni\.co\.il.*|\(https?:\/\/[^)]+\))$/i;

function draftEditableText(raw: string): string {
  return stripQuoted(raw)
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => !SHELL_LINE.test(l.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const draftIdCache = new Map<string, { at: number; map: Map<string, string> }>();

/** messageId -> draftId for one account (the thread API shows the draft message; sending/deleting needs the draft id). */
async function draftIdsFor(connKey: string, email: string): Promise<Map<string, string>> {
  const hit = draftIdCache.get(email);
  if (hit && Date.now() - hit.at < 10_000) return hit.map;
  const map = new Map<string, string>();
  let pageToken = "";
  for (let page = 0; page < 3; page++) {
    const res = await gmailApi<{ drafts?: Array<{ id: string; message?: { id: string } }>; nextPageToken?: string }>(
      connKey,
      `/users/me/drafts?maxResults=100${pageToken ? `&pageToken=${pageToken}` : ""}`,
    );
    for (const d of res?.drafts ?? []) if (d.message?.id) map.set(d.message.id, d.id);
    if (!res?.nextPageToken) break;
    pageToken = res.nextPageToken;
  }
  draftIdCache.set(email, { at: Date.now(), map });
  return map;
}

/** All messages of one chat (its threads merged, oldest first, bubble-ready) plus the drafts waiting in it. */
export const getMailChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ threads: z.array(z.object({ threadId: z.string().min(1), account: z.string().min(3) })).min(1).max(15) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const accounts = await listGmailAccounts();
    const isOwn = makeIsOwn(accounts);
    const messages: ChatMessage[] = [];
    const drafts: ChatDraft[] = [];
    await mapLimit(data.threads, 5, async (t) => {
      const acc = accounts.find((a) => a.email === t.account.toLowerCase());
      if (!acc) return;
      const thread = await gmailApi<any>(acc.connKey, `/users/me/threads/${encodeURIComponent(t.threadId)}?format=full`);
      const all: any[] = thread?.messages ?? [];
      const ids = all.some(isDraftMsg) ? await draftIdsFor(acc.connKey, acc.email) : new Map<string, string>();
      for (const m of all) {
        const h = headersOf(m);
        const raw = extractGmailPlainText(m.payload) || m.snippet || "";
        if (isDraftMsg(m)) {
          const draftId = ids.get(m.id);
          if (!draftId) continue;
          drafts.push({
            draftId,
            messageId: m.id,
            threadId: t.threadId,
            account: acc.email,
            at: Number(m.internalDate) || 0,
            to: parseAddressList(gmailHeaderValue(h, "To")).map((a) => a.name || a.email),
            subject: cleanSubject(gmailHeaderValue(h, "Subject")),
            text: draftEditableText(raw) || (m.snippet ?? ""),
            html: findHtml(m.payload),
          });
          continue;
        }
        const from = parseAddressList(gmailHeaderValue(h, "From"))[0];
        messages.push({
          id: m.id,
          threadId: t.threadId,
          account: acc.email,
          at: Number(m.internalDate) || 0,
          fromMe: !!from && isOwn(from.email),
          fromName: from?.name || from?.email?.split("@")[0] || "",
          fromEmail: from?.email ?? "",
          to: parseAddressList(gmailHeaderValue(h, "To")).map((a) => a.name || a.email),
          subject: cleanSubject(gmailHeaderValue(h, "Subject")),
          text: stripQuoted(raw) || (m.snippet ?? ""),
          attachments: collectAttachments(m.payload, m.id),
          messageIdHeader: gmailHeaderValue(h, "Message-ID") || "",
        });
      }
    });
    messages.sort((a, b) => a.at - b.at);
    drafts.sort((a, b) => b.at - a.at);
    // A mail that exists in both mailboxes (forwarding) should appear once.
    const seen = new Set<string>();
    const unique = messages.filter((m) => {
      const k = m.messageIdHeader || m.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    // Best effort: opening the chat marks it as read, like WhatsApp.
    for (const t of data.threads) {
      const acc = accounts.find((a) => a.email === t.account.toLowerCase());
      if (acc) void gmailApi(acc.connKey, `/users/me/threads/${encodeURIComponent(t.threadId)}/modify`, { method: "POST", body: { removeLabelIds: ["UNREAD"] } });
    }
    listCache.clear();
    return { messages: unique, drafts };
  });

// ── sending ───────────────────────────────────────────────────────────────────

const attachmentSchema = z
  .array(z.object({ filename: z.string().min(1).max(200), contentType: z.string().max(120), base64Data: z.string().min(1) }))
  .max(10)
  .default([]);

function checkAttachments(list: GmailAttachment[]) {
  const bytes = list.reduce((n, a) => n + Math.floor((a.base64Data.length * 3) / 4), 0);
  if (bytes > MAX_ATTACH_BYTES) throw new Error("הקבצים גדולים מדי (עד 18MB ביחד)");
}

function b64Lines(b64: string) {
  return b64.replace(/(.{76})/g, "$1\r\n");
}

function buildRaw(opts: {
  fromName: string;
  fromEmail: string;
  to: string[];
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
    `Subject: ${encodeGmailHeader(opts.subject)}`,
    ...(opts.inReplyTo ? [`In-Reply-To: ${opts.inReplyTo}`, `References: ${opts.inReplyTo}`] : []),
    "MIME-Version: 1.0",
  ];
  let mime: string;
  const atts = opts.attachments ?? [];
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

/** Plain chat text -> safe HTML paragraphs for the designed (logo + signature) mail. */
function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Designed mail = the brand shell (studio or photographer) around her text; sent through the site's normal sender. */
async function sendDesigned(opts: {
  to: string[];
  subject: string;
  text: string;
  channel: "studio" | "personal";
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
    fromName: opts.channel === "studio" ? "Sweetbaby" : "מיכל סיבוני",
    threadId: opts.threadId,
    inReplyTo: opts.inReplyTo,
    attachments: opts.attachments,
  });
  return r.ok;
}

async function deleteDraft(connKey: string, email: string, draftId: string) {
  await gmailApi(connKey, `/users/me/drafts/${encodeURIComponent(draftId)}`, { method: "DELETE" });
  draftIdCache.delete(email);
}

/** Reply inside a chat. A person -> to that person; a group -> reply to everyone, in the same Gmail thread. */
export const replyMailChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        threadId: z.string().min(1),
        account: z.string().min(3),
        text: z.string().min(1).max(20000),
        channel: z.enum(["studio", "personal"]).default("personal"),
        designed: z.boolean().default(false),
        attachments: attachmentSchema,
        /** When she edited a prepared draft and sent her version, the draft is removed after sending. */
        replacesDraftId: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    checkAttachments(data.attachments);
    const accounts = await listGmailAccounts();
    const acc = accounts.find((a) => a.email === data.account.toLowerCase());
    if (!acc) throw new Error("חשבון המייל לא מחובר");
    const isOwn = makeIsOwn(accounts);
    const thread = await gmailApi<any>(acc.connKey, `/users/me/threads/${encodeURIComponent(data.threadId)}?format=metadata&${META_QS}`);
    const meta = thread ? metaFromThread(thread, acc.email, isOwn) : null;
    if (!meta || !meta.participants.length) throw new Error("לא נמצאו נמענים לשרשור הזה");
    const msgs: any[] = (thread.messages ?? []).filter((m: any) => !isDraftMsg(m));
    const lastOther =
      [...msgs].reverse().find((m) => {
        const f = parseAddressList(gmailHeaderValue(headersOf(m), "From"))[0];
        return f && !isOwn(f.email);
      }) ?? msgs[msgs.length - 1];
    const to = replyRecipients(meta.participants);
    const subject = `Re: ${cleanSubject(meta.subject)}`;
    const inReplyTo = gmailHeaderValue(headersOf(lastOther), "Message-ID") || undefined;

    // The designed sender always goes out from the primary account, so it can only continue that account's threads.
    const primary = await resolveGmailAccount();
    let ok: boolean;
    if (data.designed && primary?.email === acc.email) {
      ok = await sendDesigned({ to, subject, text: data.text, channel: data.channel, threadId: data.threadId, inReplyTo, attachments: data.attachments });
    } else {
      const raw = buildRaw({
        fromName: data.channel === "studio" ? "Sweetbaby" : "מיכל סיבוני",
        fromEmail: acc.email,
        to,
        subject,
        text: data.text,
        inReplyTo,
        attachments: data.attachments,
      });
      const sent = await gmailApi<{ id?: string }>(acc.connKey, "/users/me/messages/send", { method: "POST", body: { raw, threadId: data.threadId } });
      ok = !!sent?.id;
    }
    if (!ok) throw new Error("השליחה נכשלה — נסי שוב");
    if (data.replacesDraftId) await deleteDraft(acc.connKey, acc.email, data.replacesDraftId);
    listCache.clear();
    return { ok: true };
  });

/** A brand-new chat: one address = a private chat, several = a new group (a mail to all of them). */
export const startMailChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        to: z.array(z.string().email()).min(1).max(50),
        subject: z.string().min(1).max(200),
        text: z.string().min(1).max(20000),
        channel: z.enum(["studio", "personal"]).default("personal"),
        designed: z.boolean().default(false),
        attachments: attachmentSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    checkAttachments(data.attachments);
    const acc = await resolveGmailAccount();
    if (!acc) throw new Error("חשבון המייל לא מחובר");
    const recipients = [...new Set(data.to.map((e) => e.toLowerCase()))];
    let ok: boolean;
    if (data.designed) {
      ok = await sendDesigned({ to: recipients, subject: data.subject, text: data.text, channel: data.channel, attachments: data.attachments });
    } else {
      const raw = buildRaw({
        fromName: data.channel === "studio" ? "Sweetbaby" : "מיכל סיבוני",
        fromEmail: acc.email,
        to: recipients,
        subject: data.subject,
        text: data.text,
        attachments: data.attachments,
      });
      const sent = await gmailApi<{ id?: string }>(acc.connKey, "/users/me/messages/send", { method: "POST", body: { raw } });
      ok = !!sent?.id;
    }
    if (!ok) throw new Error("השליחה נכשלה — נסי שוב");
    listCache.clear();
    return { ok: true };
  });

// ── drafts ────────────────────────────────────────────────────────────────────

/** Sends a prepared draft exactly as it is (design, price lists, signature). */
export const sendMailDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ account: z.string().min(3), draftId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const acc = (await listGmailAccounts()).find((a) => a.email === data.account.toLowerCase());
    if (!acc) throw new Error("חשבון המייל לא מחובר");
    const sent = await gmailApi<{ id?: string }>(acc.connKey, "/users/me/drafts/send", { method: "POST", body: { id: data.draftId } });
    if (!sent?.id) throw new Error("שליחת הטיוטה נכשלה — אולי כבר נשלחה או נמחקה");
    draftIdCache.delete(acc.email);
    listCache.clear();
    return { ok: true };
  });

export const deleteMailDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ account: z.string().min(3), draftId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const acc = (await listGmailAccounts()).find((a) => a.email === data.account.toLowerCase());
    if (!acc) throw new Error("חשבון המייל לא מחובר");
    await deleteDraft(acc.connKey, acc.email, data.draftId);
    listCache.clear();
    return { ok: true };
  });

// ── attachments ───────────────────────────────────────────────────────────────

/** One attachment of a mail, as base64 (the browser turns it into a file to open / download). Max ~15 MB. */
export const getMailAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ account: z.string().min(3), messageId: z.string().min(1), attachmentId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const acc = (await listGmailAccounts()).find((a) => a.email === data.account.toLowerCase());
    if (!acc) throw new Error("חשבון המייל לא מחובר");
    const att = await gmailApi<{ data?: string; size?: number }>(
      acc.connKey,
      `/users/me/messages/${encodeURIComponent(data.messageId)}/attachments/${encodeURIComponent(data.attachmentId)}`,
    );
    if (!att?.data) throw new Error("לא הצלחתי להוריד את הקובץ");
    if ((att.size ?? 0) > 15 * 1024 * 1024) throw new Error("הקובץ גדול מדי לפתיחה מכאן — פתחי אותו ב-Gmail");
    return { base64: att.data.replace(/-/g, "+").replace(/_/g, "/") };
  });

// ── archive ───────────────────────────────────────────────────────────────────

/** Archive = out of the Gmail inbox (nothing is deleted). The screen also hides the chat until a new mail arrives. */
export const archiveMailChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ threads: z.array(z.object({ threadId: z.string().min(1), account: z.string().min(3) })).min(1).max(30) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const accounts = await listGmailAccounts();
    await mapLimit(data.threads, 5, async (t) => {
      const acc = accounts.find((a) => a.email === t.account.toLowerCase());
      if (acc)
        await gmailApi(acc.connKey, `/users/me/threads/${encodeURIComponent(t.threadId)}/modify`, {
          method: "POST",
          body: { removeLabelIds: ["INBOX", "UNREAD"] },
        });
    });
    listCache.clear();
    return { ok: true };
  });

// ── her screen choices (pinned / labels / archived) ──────────────────────────

const prefsSchema = z.object({
  pinned: z.array(z.string().max(300)).max(50).default([]),
  labels: z.record(z.string().max(300), z.string().max(20)).default({}),
  archived: z.record(z.string().max(300), z.number()).default({}),
});
export type MailChatPrefs = z.infer<typeof prefsSchema>;

export const getMailChatPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MailChatPrefs> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any).from("app_settings").select("value").eq("key", PREFS_KEY).maybeSingle();
    try {
      return prefsSchema.parse(JSON.parse(data?.value ?? "{}"));
    } catch {
      return { pinned: [], labels: {}, archived: {} };
    }
  });

export const setMailChatPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => prefsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Archived entries older than 120 days are dropped so the setting stays small.
    const cutoff = Date.now() - 120 * 86400000;
    const archived = Object.fromEntries(
      Object.entries(data.archived)
        .filter(([, at]) => at > cutoff)
        .slice(-400),
    );
    const value = JSON.stringify({ ...data, archived });
    const { error } = await (supabaseAdmin as any).from("app_settings").upsert({ key: PREFS_KEY, value, updated_at: new Date().toISOString() });
    if (error) throw new Error("השמירה נכשלה");
    return { ok: true };
  });

// ── address book ──────────────────────────────────────────────────────────────

type Contact = { email: string; name: string; phone: string; sources: string[]; lastAt: number };

/**
 * Everyone the site knows with an e-mail — studio bookings, props orders, newborn and outdoor clients, leads and
 * newsletter sign-ups — merged by e-mail (newest name / phone wins). People who exist only in Gmail are added on
 * the screen from the chat list.
 */
export const listMailContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const sources: Array<{ table: string; label: string; email: string; name: string; phone: string | null }> = [
      { table: "bookings", label: "סטודיו", email: "contact_email", name: "contact_name", phone: "contact_phone" },
      { table: "orders", label: "אביזרים", email: "contact_email", name: "contact_name", phone: "contact_phone" },
      { table: "newborn_package_orders", label: "ניו-בורן", email: "contact_email", name: "contact_name", phone: "contact_phone" },
      { table: "outdoor_package_orders", label: "צילומי חוץ", email: "contact_email", name: "contact_name", phone: "contact_phone" },
      { table: "inquiry_leads", label: "ליד", email: "email", name: "name", phone: "phone" },
      { table: "newsletter_signups", label: "ניוזלטר", email: "email", name: "name", phone: null },
    ];
    const byEmail = new Map<string, Contact>();
    await Promise.all(
      sources.map(async (src) => {
        const cols = [src.email, src.name, src.phone, "created_at"].filter(Boolean).join(",");
        const { data, error } = await db.from(src.table).select(cols).not(src.email, "is", null).order("created_at", { ascending: false }).limit(1500);
        if (error) {
          console.warn("[SWEETBABY] mail contacts", src.table, error.message);
          return;
        }
        for (const row of data ?? []) {
          const email = String(row[src.email] ?? "").trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || isOwnStudioAddress(email) || isStudioChannelAddress(email)) continue;
          const at = Date.parse(row.created_at) || 0;
          const name = String(row[src.name] ?? "").trim();
          const phone = src.phone ? String(row[src.phone] ?? "").trim() : "";
          const c = byEmail.get(email);
          if (!c) {
            byEmail.set(email, { email, name, phone, sources: [src.label], lastAt: at });
            continue;
          }
          if (!c.sources.includes(src.label)) c.sources.push(src.label);
          if (at > c.lastAt) {
            c.lastAt = at;
            if (name) c.name = name;
            if (phone) c.phone = phone;
          } else {
            if (!c.name && name) c.name = name;
            if (!c.phone && phone) c.phone = phone;
          }
        }
      }),
    );
    return { contacts: [...byEmail.values()].sort((a, b) => b.lastAt - a.lastAt) };
  });

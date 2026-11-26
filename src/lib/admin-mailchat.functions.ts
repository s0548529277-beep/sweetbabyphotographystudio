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
  type GmailAttachment,
} from "@/integrations/google/gmail.server";
import { isOldStudioMailbox, isOwnStudioAddress, isStudioChannelAddress } from "@/lib/studio-addresses";
import { buildConversations, cleanSubject, parseAddressList, stripQuoted, type ThreadMeta } from "@/lib/mailchat";
import {
  META_QS,
  buildRaw,
  checkAttachments,
  deleteDraft,
  headersOf,
  isDraftMsg,
  makeIsOwn,
  metaFromThread,
  performReply,
  performStart,
  readScheduled,
  removeScheduledFiles,
  storeScheduledFiles,
  writeScheduled,
  type ScheduledMail,
} from "@/lib/mailchat-core.server";

/**
 * "מיילים כמו וואטסאפ" (/admin/mail-chat). Gmail is the source of truth and is read live, so the screen is
 * always in sync; only the owner's own screen choices (pinned / labels / archived) are kept, in app_settings.
 */

const PREFS_KEY = "mail_chat_prefs";

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

const listCache = new Map<string, { at: number; data: any }>();

const MAX_LIST_THREADS = 800;
/** Thread list entries already read, keyed "account|threadId" -> the processed meta at that historyId. */
const threadMetaCache = new Map<string, { historyId: string; meta: ThreadMeta | null }>();

/** The chat list: recent Gmail threads, grouped like WhatsApp (a person = one chat, several people = a group). */
export const listMailChats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ search: z.string().max(800).optional(), box: z.enum(["business", "personal"]).optional(), months: z.number().int().min(1).max(12).optional(), limit: z.number().int().min(10).max(800).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const accounts = await listGmailAccounts();
    if (!accounts.length) {
      // No linked key at all = really not connected; keys exist but Gmail did not answer = a temporary error (retried).
      const hasKeys = Object.entries(process.env).some(([k, v]) => k.startsWith("GOOGLE_MAIL_API_KEY") && !!v);
      if (hasKeys) throw new Error("Gmail לא הגיב כרגע — מנסה שוב בעוד רגע");
      return { connected: false, conversations: [] as any[], accounts: [] as string[] };
    }
    const isOwn = makeIsOwn(accounts);
    const search = data.search?.trim() ?? "";
    // Two boxes (owner, 2026-11-25): עסק = the Sweet Baby studio mailbox, אישי = everything in the personal mailbox.
    // Never shown in either: promotions, social, forums, spam, trash and groups / mailing lists (they break focus).
    const box = data.box ?? "business";
    // קבוצות (owner, 2026-11-25): every kind of group / mailing list from BOTH mailboxes, one continuous chat per group.
    // עדכונים (owner, 2026-11-25): everything NOT from a private person (shops, newsletters, Google, systems), both mailboxes.
    // עסק reads both mailboxes too: every site order / lead / studio mail lands there even when it sits in the personal one.
    // Owner, 2026-11-25: groups and newsletters / automated mail are removed COMPLETELY (no box for them any more).
    // A search looks in BOTH mailboxes at once, whatever box is open.
    const readAccounts = box === "personal" && !search ? accounts.filter((a) => !isOldStudioMailbox(a.email)) : accounts;
    const noGroups = ["-list:googlegroups.com", "-cc:googlegroups.com", "-to:googlegroups.com"];
    const boxQ = ["-category:promotions", "-category:social", "-category:forums", ...noGroups];
    const q = [
      ...boxQ,
      "-in:spam",
      "-in:trash",
      // How far back (owner, 2026-11-25: "load months back"); a search looks at everything.
      search ? "" : `newer_than:${(data.months ?? 1) * 31}d`,
      search,
    ]
      .filter(Boolean)
      .join(" ");
    const threadLimit = search ? 80 : Math.min(MAX_LIST_THREADS, data.limit ?? 40);
    const cacheKey = `${search ? "search" : box}|${q}|${threadLimit}`;
    const hit = listCache.get(cacheKey);
    if (hit && Date.now() - hit.at < 8000) return hit.data;

    const primary = await resolveGmailAccount();
    const metas: ThreadMeta[] = [];
    let hasMore = false;
    for (const acc of readAccounts) {
      // All thread ids in the range (pages of up to 500, at most MAX_LIST_THREADS).
      const refs: Array<{ id: string; historyId?: string }> = [];
      let pageToken = "";
      const cap = threadLimit;
      do {
        const list = await gmailApi<{ threads?: Array<{ id: string; historyId?: string }>; nextPageToken?: string }>(
          acc.connKey,
          `/users/me/threads?maxResults=${Math.min(500, cap - refs.length)}&q=${encodeURIComponent(q)}${pageToken ? `&pageToken=${pageToken}` : ""}`,
        );
        refs.push(...(list?.threads ?? []));
        pageToken = list?.nextPageToken ?? "";
      } while (pageToken && refs.length < cap);
      if (pageToken) hasMore = true;
      // Only threads that are new or changed since the last load are fetched again (cached by historyId).
      const out = await mapLimit(refs, 6, async (r) => {
        const key = `${acc.email}|${r.id}`;
        const c = threadMetaCache.get(key);
        if (c && r.historyId && c.historyId === r.historyId) return c.meta;
        const t = await gmailApi<any>(acc.connKey, `/users/me/threads/${r.id}?format=metadata&${META_QS}`);
        if (!t) return null;
        const meta = metaFromThread(t, acc.email, isOwn);
        if (r.historyId) threadMetaCache.set(key, { historyId: r.historyId, meta });
        return meta;
      });
      // Groups box = only groups; updates = only automated mail; עסק / אישי = only mail from real people.
      const studioBox = isOldStudioMailbox(acc.email);
      for (const m of out) {
        if (!m) continue;
        const site = !!m.kinds?.length; // order / lead / any site mail -> always business
        const studioSide = site || m.channel === "studio";
        const keep = m.listId
          ? false
          : search
            ? site || !m.automated
            : box === "business"
              ? site || (!m.automated && (studioBox || studioSide))
              : !m.automated && !studioSide;
        if (keep) metas.push(m);
      }
    }
    // The studio mailbox forwards to the personal one, so the same mail can exist in both: keep one copy (the primary account's).
    const seen = new Set<string>();
    const unique = [...metas]
      .sort((a, b) => Number(b.account === primary?.email) - Number(a.account === primary?.email))
      .filter((m) => (seen.has(m.firstMessageId) ? false : (seen.add(m.firstMessageId), true)));
    const result = { connected: true, conversations: buildConversations(unique), accounts: readAccounts.map((a) => a.email), hasMore };
    listCache.set(cacheKey, { at: Date.now(), data: result });
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
    z
      .object({
        threads: z.array(z.object({ threadId: z.string().min(1), account: z.string().min(3) })).min(1).max(30),
        // Private chat (owner, 2026-11-25): the list shows one month, opening a chat also loads her OLDER mail.
        people: z.array(z.string().email().max(200)).max(3).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const accounts = await listGmailAccounts();
    const isOwn = makeIsOwn(accounts);
    const messages: ChatMessage[] = [];
    const drafts: ChatDraft[] = [];
    const threads = [...data.threads];
    if (data.people?.length) {
      const who = data.people.map((e) => `from:${e} OR to:${e} OR cc:${e}`).join(" OR ");
      const have = new Set(threads.map((t) => t.threadId));
      for (const acc of accounts) {
        const list = await gmailApi<{ threads?: Array<{ id: string }> }>(
          acc.connKey,
          `/users/me/threads?maxResults=30&q=${encodeURIComponent(`(${who}) -in:spam -in:trash`)}`,
        ).catch(() => null);
        for (const r of list?.threads ?? []) {
          if (have.has(r.id) || threads.length >= 40) continue;
          have.add(r.id);
          threads.push({ threadId: r.id, account: acc.email });
        }
      }
    }
    await mapLimit(threads, 5, async (t) => {
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

async function deleteDraftCached(connKey: string, email: string, draftId: string) {
  await deleteDraft(connKey, draftId);
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
        cc: z.array(z.string().email()).max(20).optional(),
        /** When she edited a prepared draft and sent her version, the draft is removed after sending. */
        replacesDraftId: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    checkAttachments(data.attachments);
    await performReply(data);
    if (data.replacesDraftId) draftIdCache.clear();
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
        cc: z.array(z.string().email()).max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    checkAttachments(data.attachments);
    await performStart(data);
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
    await deleteDraftCached(acc.connKey, acc.email, data.draftId);
    listCache.clear();
    return { ok: true };
  });

// ── how a mail looks ──────────────────────────────────────────────────────────

/** One mail exactly as it arrived (its designed HTML, or its plain text), for the "how it looks in the mail" view. */
export const getMailMessageView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ account: z.string().min(3), messageId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const acc = (await listGmailAccounts()).find((a) => a.email === data.account.toLowerCase());
    if (!acc) throw new Error("חשבון המייל לא מחובר");
    const m = await gmailApi<any>(acc.connKey, `/users/me/messages/${encodeURIComponent(data.messageId)}?format=full`);
    if (!m) throw new Error("המייל לא נמצא");
    const h = headersOf(m);
    const html = findHtml(m.payload);
    const text = html ? "" : extractGmailPlainText(m.payload) || m.snippet || "";
    return {
      html: html.slice(0, 1_500_000),
      text,
      from: gmailHeaderValue(h, "From"),
      to: gmailHeaderValue(h, "To"),
      cc: gmailHeaderValue(h, "Cc"),
      subject: gmailHeaderValue(h, "Subject"),
      date: gmailHeaderValue(h, "Date"),
    };
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
  /** Her own quick replies (editable on the screen); empty = the built-in ones. */
  quickReplies: z.array(z.string().min(1).max(500)).max(30).default([]),
  /** "תזכירי לי לחזור לשיחה" — chat key -> when. */
  reminders: z.record(z.string().max(300), z.number()).default({}),
  /** Her private note per chat (never sent to anyone). */
  notes: z.record(z.string().max(300), z.string().max(2000)).default({}),
  /** WhatsApp: when she last opened each phone's messages (ms), for the unread dot. */
  waSeen: z.record(z.string().max(40), z.number()).default({}),
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
      return { pinned: [], labels: {}, archived: {}, quickReplies: [], reminders: {}, notes: {}, waSeen: {} };
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
    const reminders = Object.fromEntries(Object.entries(data.reminders).slice(-300));
    const notes = Object.fromEntries(Object.entries(data.notes).filter(([, t]) => t.trim()).slice(-400));
    const waSeen = Object.fromEntries(Object.entries(data.waSeen).slice(-500));
    const value = JSON.stringify({ ...data, archived, reminders, notes, waSeen });
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

// ── mark unread ───────────────────────────────────────────────────────────────

/** Back to "unread" (like WhatsApp's mark as unread): the newest thread of the chat gets UNREAD again in Gmail. */
export const markMailChatUnread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ threadId: z.string().min(1), account: z.string().min(3) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const acc = (await listGmailAccounts()).find((a) => a.email === data.account.toLowerCase());
    if (!acc) throw new Error("חשבון המייל לא מחובר");
    await gmailApi(acc.connKey, `/users/me/threads/${encodeURIComponent(data.threadId)}/modify`, {
      method: "POST",
      body: { addLabelIds: ["UNREAD", "INBOX"] },
    });
    listCache.clear();
    return { ok: true };
  });

/** Marks every thread of a chat as read (long-press "mark as read" in the list). */
export const markMailChatRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ threads: z.array(z.object({ threadId: z.string().min(1), account: z.string().min(3) })).min(1).max(30) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const accounts = await listGmailAccounts();
    await mapLimit(data.threads, 6, async (t) => {
      const acc = accounts.find((a) => a.email === t.account.toLowerCase());
      if (acc) await gmailApi(acc.connKey, `/users/me/threads/${encodeURIComponent(t.threadId)}/modify`, { method: "POST", body: { removeLabelIds: ["UNREAD"] } });
    });
    listCache.clear();
    return { ok: true };
  });

// ── forward ───────────────────────────────────────────────────────────────────

function collectAttachmentParts(payload: any, out: Array<{ filename: string; mimeType: string; attachmentId?: string; data?: string; size: number }> = []) {
  if (!payload) return out;
  if (payload.filename && (payload.body?.attachmentId || payload.body?.data))
    out.push({
      filename: payload.filename,
      mimeType: payload.mimeType || "application/octet-stream",
      attachmentId: payload.body?.attachmentId,
      data: payload.body?.data,
      size: payload.body?.size ?? 0,
    });
  for (const p of payload.parts ?? []) collectAttachmentParts(p, out);
  return out;
}

/** Forwards one mail (its text + its files, up to 18 MB) to other addresses, with an optional note on top. */
export const forwardMailMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        account: z.string().min(3),
        messageId: z.string().min(1),
        to: z.array(z.string().email()).min(1).max(20),
        note: z.string().max(5000).default(""),
        channel: z.enum(["studio", "personal"]).default("personal"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const acc = (await listGmailAccounts()).find((a) => a.email === data.account.toLowerCase());
    if (!acc) throw new Error("חשבון המייל לא מחובר");
    const m = await gmailApi<any>(acc.connKey, `/users/me/messages/${encodeURIComponent(data.messageId)}?format=full`);
    if (!m?.payload) throw new Error("המייל לא נמצא");
    const h = headersOf(m);
    const subject = cleanSubject(gmailHeaderValue(h, "Subject"));
    const body = extractGmailPlainText(m.payload) || m.snippet || "";
    const text = [
      data.note.trim(),
      "---------- הודעה שהועברה ----------",
      `מאת: ${gmailHeaderValue(h, "From")}`,
      `תאריך: ${gmailHeaderValue(h, "Date")}`,
      `נושא: ${subject}`,
      `אל: ${gmailHeaderValue(h, "To")}`,
      "",
      body,
    ]
      .filter((x, i) => i > 0 || x)
      .join("\n");
    const parts = collectAttachmentParts(m.payload);
    const attachments: GmailAttachment[] = [];
    let bytes = 0;
    for (const p of parts) {
      if (bytes + p.size > 18 * 1024 * 1024) throw new Error("הקבצים במייל גדולים מדי להעברה מכאן — העבירי מ-Gmail");
      bytes += p.size;
      let b64 = p.data;
      if (!b64 && p.attachmentId) {
        const att = await gmailApi<{ data?: string }>(
          acc.connKey,
          `/users/me/messages/${encodeURIComponent(data.messageId)}/attachments/${encodeURIComponent(p.attachmentId)}`,
        );
        b64 = att?.data;
      }
      if (b64) attachments.push({ filename: p.filename, contentType: p.mimeType, base64Data: b64.replace(/-/g, "+").replace(/_/g, "/") });
    }
    const raw = buildRaw({
      fromName: data.channel === "studio" ? "Sweetbaby" : "מיכל סיבוני",
      fromEmail: acc.email,
      to: [...new Set(data.to.map((e) => e.toLowerCase()))],
      subject: `Fwd: ${subject}`,
      text,
      attachments,
    });
    const sent = await gmailApi<{ id?: string }>(acc.connKey, "/users/me/messages/send", { method: "POST", body: { raw } });
    if (!sent?.id) throw new Error("ההעברה נכשלה — נסי שוב");
    listCache.clear();
    return { ok: true };
  });

// ── AI reply suggestion ───────────────────────────────────────────────────────

/**
 * "הצעת תשובה": the AI writes a reply in her style from the last messages of the chat (sent by the screen, already
 * stripped of quotes). It only suggests text into the composer; nothing is sent.
 */
export const suggestMailReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        channel: z.enum(["studio", "personal"]).default("personal"),
        isGroup: z.boolean().default(false),
        title: z.string().max(200).default(""),
        messages: z
          .array(z.object({ fromMe: z.boolean(), name: z.string().max(120), text: z.string().max(4000), at: z.number() }))
          .min(1)
          .max(14),
        hint: z.string().max(500).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { generateTextResilient } = await import("@/lib/ai-gateway.server");
    const { WRITER_RULES } = await import("@/lib/email-drafts.server");
    const fmt = (t: number) => new Date(t).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" });
    const convo = data.messages.map((m) => `[${fmt(m.at)}] ${m.fromMe ? "מיכל" : m.name}:\n${m.text.trim().slice(0, 1500)}`).join("\n\n");
    const today = new Date().toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "full" });
    const system = [
      WRITER_RULES,
      "",
      "משימה עכשיו: לכתוב רק את גוף התשובה הבאה של מיכל בשיחה הזאת (בלי נושא, בלי חתימה, בלי 'היי' כפול אם כבר יש). טקסט פשוט, בלי HTML ובלי Markdown.",
      data.channel === "studio" ? "ההקשר: סטודיו Sweetbaby (השכרת סטודיו / אביזרים)." : "ההקשר: מיכל סיבוני הצלמת / אישי.",
      data.isGroup ? "זו קבוצה עם כמה נמענים — לכתוב לכולם." : "",
      `היום: ${today}.`,
      "אם חסר מידע שאת לא יודעת בוודאות — כתבי [[מיכל: מה להשלים]] במקום להמציא.",
    ]
      .filter(Boolean)
      .join("\n");
    const prompt = `השיחה${data.title ? ` (${data.title})` : ""}:\n\n${convo}${data.hint ? `\n\nהנחיה של מיכל לתשובה: ${data.hint}` : ""}\n\nכתבי את התשובה של מיכל:`;
    const { text } = await generateTextResilient({ system, prompt }, 40000);
    const clean = String(text ?? "")
      .replace(/^```\w*\n?|```$/g, "")
      .trim();
    if (!clean) throw new Error("לא התקבלה הצעה — נסי שוב");
    return { text: clean };
  });

// ── customer card: her orders ─────────────────────────────────────────────────

type CardOrder = { kind: string; id: string; date: string | null; title: string; status: string; total: number | null; link: string };

/** Everything the site knows about the people of a chat: studio bookings, props orders, newborn and outdoor clients. */
export const getMailContactCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ emails: z.array(z.string().max(200)).max(20).default([]), phones: z.array(z.string().max(30)).max(10).default([]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const emails = [...new Set(data.emails.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@")))];
    const tails = [...new Set(data.phones.map((p) => p.replace(/\D/g, "").slice(-9)).filter((p) => p.length === 9))];
    if (!emails.length && !tails.length) return { orders: [] as CardOrder[], phone: "" };
    const orFilter = (emailCol: string, phoneCol: string) =>
      [...emails.map((e) => `${emailCol}.ilike.${e}`), ...tails.map((t) => `${phoneCol}.ilike.%${t}`)].join(",");
    const out: CardOrder[] = [];
    let phone = "";
    const run = async (table: string, cols: string, map: (r: any) => CardOrder) => {
      const { data: rows, error } = await db.from(table).select(cols).or(orFilter("contact_email", "contact_phone")).order("created_at", { ascending: false }).limit(30);
      if (error) return console.warn("[SWEETBABY] contact card", table, error.message);
      for (const r of rows ?? []) {
        out.push(map(r));
        if (!phone && r.contact_phone) phone = r.contact_phone;
      }
    };
    await Promise.all([
      run("bookings", "id,session_date,start_time,end_time,status,price,package,contact_phone,created_at", (r) => ({
        kind: "סטודיו",
        id: r.id,
        date: r.session_date,
        title: `השכרת סטודיו ${String(r.start_time ?? "").slice(0, 5)}–${String(r.end_time ?? "").slice(0, 5)}`,
        status: r.status,
        total: r.price,
        link: "/admin/orders",
      })),
      run("orders", "id,pickup_at,status,total,contact_phone,created_at", (r) => ({
        kind: "אביזרים",
        id: r.id,
        date: r.pickup_at ? String(r.pickup_at).slice(0, 10) : null,
        title: "השכרת אביזרים",
        status: r.status,
        total: r.total,
        link: "/admin/orders",
      })),
      run("newborn_package_orders", "id,session_date,package_id,total_price,amount_paid,delivered_at,contact_phone,created_at", (r) => ({
        kind: "ניו-בורן",
        id: r.id,
        date: r.session_date,
        title: `חבילת ניו-בורן${r.package_id ? ` · ${r.package_id}` : ""}`,
        status: r.delivered_at ? "נמסר" : (r.amount_paid ?? 0) > 0 ? "שולם חלקית" : "פתוח",
        total: r.total_price,
        link: `/admin/newborn-packages/${r.id}`,
      })),
      run("outdoor_package_orders", "id,session_date,package_name,total_price,amount_paid,delivered_at,contact_phone,created_at", (r) => ({
        kind: "צילומי חוץ",
        id: r.id,
        date: r.session_date,
        title: r.package_name || "צילומי חוץ",
        status: r.delivered_at ? "נמסר" : (r.amount_paid ?? 0) > 0 ? "שולם חלקית" : "פתוח",
        total: r.total_price,
        link: `/admin/outdoor-packages/${r.id}`,
      })),
    ]);
    out.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
    return { orders: out, phone };
  });

// ── scheduled sends ───────────────────────────────────────────────────────────

const scheduleSchema = z.object({
  at: z.number().int(),
  kind: z.enum(["reply", "new"]),
  chatKey: z.string().max(300).optional(),
  label: z.string().max(200),
  text: z.string().min(1).max(20000),
  channel: z.enum(["studio", "personal"]).default("personal"),
  designed: z.boolean().default(false),
  threadId: z.string().optional(),
  account: z.string().optional(),
  to: z.array(z.string().email()).max(50).optional(),
  cc: z.array(z.string().email()).max(20).optional(),
  subject: z.string().max(200).optional(),
  attachments: z
    .array(z.object({ filename: z.string().min(1).max(200), contentType: z.string().max(120), base64Data: z.string().min(1) }))
    .max(10)
    .default([]),
});

/** Saves a mail to be sent later (checked every 5 minutes by the site; files kept in storage until then; held around Shabbat). */
export const scheduleMailChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => scheduleSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.at < Date.now() + 60_000) throw new Error("בחרי זמן עתידי (לפחות דקה מעכשיו)");
    if (data.at > Date.now() + 60 * 86400000) throw new Error("אפשר לתזמן עד 60 יום קדימה");
    if (data.kind === "reply" && (!data.threadId || !data.account)) throw new Error("חסר שרשור לתשובה");
    if (data.kind === "new" && (!data.to?.length || !data.subject)) throw new Error("חסרים נמענים או נושא");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    checkAttachments(data.attachments);
    const { attachments, ...rest } = data;
    const id = crypto.randomUUID();
    const files = attachments.length ? await storeScheduledFiles(db, id, attachments) : undefined;
    const list = await readScheduled(db);
    const item: ScheduledMail = { ...rest, id, createdAt: Date.now(), files };
    await writeScheduled(db, [...list, item]);
    return { ok: true, id };
  });

export const listScheduledMails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const list = await readScheduled(supabaseAdmin as any);
    return { scheduled: list.sort((a, b) => a.at - b.at) };
  });

export const cancelScheduledMail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const list = await readScheduled(db);
    const gone = list.find((m) => m.id === data.id);
    await writeScheduled(
      db,
      list.filter((m) => m.id !== data.id),
    );
    if (gone) await removeScheduledFiles(db, gone.files);
    return { ok: true };
  });

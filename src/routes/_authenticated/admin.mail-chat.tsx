import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  EllipsisVertical,
  Bell,
  BookUser,
  Check,
  AlarmClock,
  CheckCheck,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Forward,
  Image as ImageIcon,
  Loader2,
  Mail,
  MailOpen,
  MessageCircle,
  MessageSquarePlus,
  Palette,
  Paperclip,
  PenLine,
  Phone,
  Pin,
  PinOff,
  RefreshCw,
  Reply,
  Search,
  Send,
  Sparkles,
  Tag,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  archiveMailChat,
  cancelScheduledMail,
  deleteMailDraft,
  forwardMailMessage,
  getMailContactCard,
  getMailAttachment,
  getMailChat,
  getMailChatPrefs,
  getMailMessageView,
  listMailChats,
  listMailContacts,
  listScheduledMails,
  markMailChatUnread,
  replyMailChat,
  scheduleMailChat,
  sendMailDraft,
  setMailChatPrefs,
  startMailChat,
  suggestMailReply,
  type MailChatPrefs,
} from "@/lib/admin-mailchat.functions";
import { listWhatsAppConversations, listWhatsAppThread, sendWhatsAppMediaAdmin, sendWhatsAppMessageAdmin } from "@/lib/admin-whatsapp.functions";
import { uploadMediaToStorage } from "@/lib/whatsapp-upload";
import { WhatsAppMedia } from "@/components/WhatsAppMedia";
import type { MailConversation } from "@/lib/mailchat";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/mail-chat")({
  component: MailChatAdmin,
});

// ── look & feel ───────────────────────────────────────────────────────────────
const WA = {
  green: "#00a884",
  greenDark: "#008069",
  bubbleOut: "#d9fdd3",
  bubbleIn: "#ffffff",
  wallpaper: "#efeae2",
  panel: "#f0f2f5",
  line: "#e9edef",
  muted: "#667781",
  ink: "#111b21",
  unread: "#25d366",
  draft: "#fff6d6",
  draftInk: "#8a6d00",
};
const NAME_COLORS = ["#d62976", "#00a884", "#7c4dff", "#e67e22", "#1e88e5", "#c0392b", "#16a085", "#8e44ad", "#b7791f", "#2c7a7b"];
const AVATAR_BG = ["#f8d7da", "#d1f2eb", "#e3dcff", "#fde2c8", "#d6eaff", "#f9d5d3", "#cdeee6", "#ead7f3", "#f6e7c1", "#cfe9e9"];
const LABELS: Array<{ id: string; color: string; bg: string }> = [
  { id: "ליד", color: "#b45309", bg: "#fef3c7" },
  { id: "לקוחה", color: "#047857", bg: "#d1fae5" },
  { id: "חשוב", color: "#b91c1c", bg: "#fee2e2" },
  { id: "קולגה", color: "#6d28d9", bg: "#ede9fe" },
  { id: "ספק", color: "#1d4ed8", bg: "#dbeafe" },
];
const labelStyle = (id?: string) => LABELS.find((l) => l.id === id);
const MAX_ATTACH = 18 * 1024 * 1024;

function hashIdx(s: string, n: number) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % n;
}

function initials(name: string) {
  const parts = name.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function Avatar({ name, seed, group, size = 44 }: { name: string; seed: string; group?: boolean; size?: number }) {
  const i = hashIdx(seed, AVATAR_BG.length);
  return (
    <div
      className="shrink-0 rounded-full flex items-center justify-center font-semibold select-none"
      style={{ width: size, height: size, background: AVATAR_BG[i], color: NAME_COLORS[i], fontSize: size * 0.36 }}
      aria-hidden
    >
      {group ? <Users style={{ width: size * 0.48, height: size * 0.48 }} /> : initials(name)}
    </div>
  );
}

const dayKey = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

function listTime(ms: number) {
  if (!ms) return "";
  const d = new Date(ms);
  const now = new Date();
  if (dayKey(d) === dayKey(now)) return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
  if (dayKey(d) === dayKey(new Date(now.getTime() - 86400000))) return "אתמול";
  if (now.getTime() - ms < 6 * 86400000) return d.toLocaleDateString("he-IL", { weekday: "long", timeZone: "Asia/Jerusalem" });
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Asia/Jerusalem" });
}

function dayLabel(ms: number) {
  const d = new Date(ms);
  const now = new Date();
  if (dayKey(d) === dayKey(now)) return "היום";
  if (dayKey(d) === dayKey(new Date(now.getTime() - 86400000))) return "אתמול";
  return d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jerusalem" });
}

const bubbleTime = (ms: number) => new Date(ms).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });

function fileSize(n: number) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const URL_RE = /(https?:\/\/[^\s<>"')]+)/;
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"')]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        URL_RE.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" dir="ltr" className="underline break-all" style={{ color: "#027eb5" }}>
            {p.length > 60 ? `${p.slice(0, 57)}…` : p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/** Israeli phone -> international digits for a wa.me link. */
function waPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("972")) return d;
  if (d.startsWith("0")) return `972${d.slice(1)}`;
  return d;
}

type OutFile = { filename: string; contentType: string; base64Data: string; size: number };

function readFiles(list: FileList | null): Promise<OutFile[]> {
  return Promise.all(
    Array.from(list ?? []).map(
      (f) =>
        new Promise<OutFile>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve({ filename: f.name, contentType: f.type || "application/octet-stream", base64Data: String(r.result).split(",")[1] ?? "", size: f.size });
          r.onerror = () => reject(new Error(`לא הצלחתי לקרוא את ${f.name}`));
          r.readAsDataURL(f);
        }),
    ),
  );
}

function FileChips({ files, onRemove }: { files: OutFile[]; onRemove: (i: number) => void }) {
  if (!files.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {files.map((f, i) => (
        <span key={`${f.filename}-${i}`} className="flex items-center gap-1 h-7 pr-2 pl-1 rounded-full text-xs bg-white border" style={{ borderColor: WA.line, color: WA.ink }}>
          <Paperclip className="h-3 w-3" style={{ color: WA.muted }} />
          <span className="max-w-[160px] truncate" dir="auto">
            {f.filename}
          </span>
          <span style={{ color: WA.muted }}>{fileSize(f.size)}</span>
          <button type="button" aria-label="הסרת קובץ" onClick={() => onRemove(i)} className="p-0.5">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

type ChatMsg = {
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
  attachments: Array<{ filename: string; mimeType: string; size: number; attachmentId: string; messageId: string }>;
  pending?: boolean;
  /** A WhatsApp message shown inside the same chat (unified inbox). */
  wa?: boolean;
  media?: { url: string; type: string; filename: string | null; mime: string | null };
  waFailed?: string;
};

/** A chat in the list: a mail conversation, optionally merged with the same person's WhatsApp (by phone). */
type Conv = MailConversation & { waPhone?: string; waOnly?: boolean };

const tail9 = (phone: string) => phone.replace(/\D/g, "").slice(-9);

function quoteBlock(m: ChatMsg): string {
  const when = new Date(m.at).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" });
  const who = m.fromMe ? "אני" : m.fromName || m.fromEmail;
  const body = m.text.trim().slice(0, 1200).split("\n").map((l) => `> ${l}`).join("\n");
  return `ב-${when}, ${who} כתב/ה:\n${body}`;
}

type ChatDraft = { draftId: string; messageId: string; threadId: string; account: string; at: number; to: string[]; subject: string; text: string; html: string };

type Contact = { email: string; name: string; phone: string; sources: string[]; lastAt: number };

function outFileToFile(f: OutFile): File {
  const bin = atob(f.base64Data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], f.filename, { type: f.contentType || "application/octet-stream" });
}

const DEFAULT_QUICK_REPLIES = [
  "תודה רבה! 💗",
  "קיבלתי, בודקת וחוזרת אלייך בהקדם.",
  "אשמח לדבר — אפשר להתקשר אליי ל-054-8529277.",
  "אפשר להזמין ישירות באתר: https://sweetbabyphoto.shop",
];
const quickLabel = (t: string) => (t.length > 22 ? `${t.slice(0, 20)}…` : t);

type Filter = "all" | "unread" | "waiting" | "reminders" | "drafts" | "studio" | "personal" | "groups" | "whatsapp" | "archived" | `label:${string}`;
const BASE_FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "הכל" },
  { id: "unread", label: "לא נקראו" },
  { id: "waiting", label: "ממתינות לתשובה" },
  { id: "drafts", label: "✍️ טיוטות" },
  { id: "groups", label: "קבוצות" },
  { id: "whatsapp", label: "🟢 וואטסאפ" },
];

const EMPTY_PREFS: MailChatPrefs = { pinned: [], labels: {}, archived: {}, quickReplies: [], reminders: {}, notes: {}, waSeen: {} };

// ── page ──────────────────────────────────────────────────────────────────────
function MailChatAdmin() {
  const qc = useQueryClient();
  const fetchChats = useServerFn(listMailChats);
  const fetchChat = useServerFn(getMailChat);
  const fetchContacts = useServerFn(listMailContacts);
  const fetchPrefs = useServerFn(getMailChatPrefs);
  const savePrefsFn = useServerFn(setMailChatPrefs);
  const doReply = useServerFn(replyMailChat);
  const doStart = useServerFn(startMailChat);
  const doSendDraft = useServerFn(sendMailDraft);
  const doDeleteDraft = useServerFn(deleteMailDraft);
  const doArchive = useServerFn(archiveMailChat);
  const fetchAttachment = useServerFn(getMailAttachment);
  const doUnread = useServerFn(markMailChatUnread);
  const doForward = useServerFn(forwardMailMessage);
  const doSuggest = useServerFn(suggestMailReply);
  const fetchCard = useServerFn(getMailContactCard);
  const doSchedule = useServerFn(scheduleMailChat);
  const fetchScheduled = useServerFn(listScheduledMails);
  const doCancelScheduled = useServerFn(cancelScheduledMail);
  const fetchWaConvs = useServerFn(listWhatsAppConversations);
  const fetchWaThread = useServerFn(listWhatsAppThread);
  const doSendWa = useServerFn(sendWhatsAppMessageAdmin);
  const doSendWaMedia = useServerFn(sendWhatsAppMediaAdmin);

  const [tab, setTab] = useState<"chats" | "contacts">("chats");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [serverSearch, setServerSearch] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [showThread, setShowThread] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<OutFile[]>([]);
  const [designed, setDesigned] = useState(false);
  const [editingDraft, setEditingDraft] = useState<ChatDraft | null>(null);
  const [sending, setSending] = useState(false);
  const [busyDraft, setBusyDraft] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [pending, setPending] = useState<ChatMsg[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState<Contact[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Record<string, Contact>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [prefs, setPrefs] = useState<MailChatPrefs>(EMPTY_PREFS);
  const [quote, setQuote] = useState<ChatMsg | null>(null);
  const [forwardMsg, setForwardMsg] = useState<ChatMsg | null>(null);
  const [chatSearch, setChatSearch] = useState("");
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [replyVia, setReplyVia] = useState<"mail" | "wa">("mail");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledOpen, setScheduledOpen] = useState(false);
  const [quickEditOpen, setQuickEditOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [headerMenu, setHeaderMenu] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [box, setBox] = useState<"business" | "personal">("business");
  const [viewMsg, setViewMsg] = useState<ChatMsg | null>(null);
  const [ccList, setCcList] = useState<string[]>([]);
  const [ccOpen, setCcOpen] = useState(false);
  const [labelSheet, setLabelSheet] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const fileInput = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Full-text search in Gmail (debounced) once she typed 3+ letters.
  useEffect(() => {
    const t = setTimeout(() => setServerSearch(search.trim().length >= 3 ? search.trim() : ""), 500);
    return () => clearTimeout(t);
  }, [search]);

  const chats = useQuery({
    queryKey: ["mail-chats", serverSearch, box],
    queryFn: () => fetchChats({ data: { ...(serverSearch ? { search: serverSearch } : {}), box } }),
    refetchInterval: serverSearch ? false : 20000,
    refetchOnWindowFocus: true,
  });
  const contactsQ = useQuery({ queryKey: ["mail-contacts"], queryFn: () => fetchContacts({}), staleTime: 5 * 60_000 });
  const prefsQ = useQuery({ queryKey: ["mail-chat-prefs"], queryFn: () => fetchPrefs({}), staleTime: Infinity });
  useEffect(() => {
    if (prefsQ.data) setPrefs(prefsQ.data);
  }, [prefsQ.data]);

  function updatePrefs(next: MailChatPrefs) {
    setPrefs(next);
    savePrefsFn({ data: next }).catch(() => toast.error("לא הצלחתי לשמור את השינוי"));
  }

  // WhatsApp unread: the first time the screen loads, everything older counts as read (start point "_init").
  useEffect(() => {
    if (prefsQ.data && !prefsQ.data.waSeen?._init) updatePrefs({ ...prefsQ.data, waSeen: { ...(prefsQ.data.waSeen ?? {}), _init: Date.now() } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsQ.data]);

  const mailConversations: MailConversation[] = (chats.data?.conversations ?? []) as MailConversation[];
  const waConvsQ = useQuery({
    queryKey: ["mail-wa-convs"],
    queryFn: () => fetchWaConvs({}),
    refetchInterval: 20000,
    retry: false,
  });
  const scheduledQ = useQuery({ queryKey: ["mail-scheduled"], queryFn: () => fetchScheduled({}), refetchInterval: 60000 });
  const scheduled = (scheduledQ.data?.scheduled ?? []) as Array<{ id: string; at: number; chatKey?: string; label: string; text: string; error?: string; kind: string }>;
  const quickReplies = prefs.quickReplies?.length ? prefs.quickReplies : DEFAULT_QUICK_REPLIES;

  // Address book = the site's customers + everyone in the mail chats.
  const allContacts: Contact[] = useMemo(() => {
    const map = new Map<string, Contact>();
    for (const c of (contactsQ.data?.contacts ?? []) as Contact[]) map.set(c.email, { ...c, sources: [...c.sources] });
    for (const conv of mailConversations) {
      for (const p of conv.participants) {
        const c = map.get(p.email);
        if (!c) map.set(p.email, { email: p.email, name: p.name, phone: "", sources: ["מייל"], lastAt: conv.lastDate });
        else {
          if (!c.sources.includes("מייל")) c.sources.push("מייל");
          if (!c.name && p.name) c.name = p.name;
          c.lastAt = Math.max(c.lastAt, conv.lastDate);
        }
      }
    }
    return [...map.values()].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, "he"));
  }, [contactsQ.data, mailConversations]);
  const contactByEmail = useMemo(() => new Map(allContacts.map((c) => [c.email, c])), [allContacts]);

  // One inbox: a WhatsApp conversation joins the private mail chat of the same person (matched by the phone the site
  // knows for her e-mail); a WhatsApp number with no mail chat becomes its own chat.
  const waSeenBase = prefs.waSeen?._init ?? 0;
  const conversations: Conv[] = useMemo(() => {
    const byTail = new Map<string, Contact>();
    for (const c of allContacts) if (c.phone && tail9(c.phone).length === 9 && !byTail.has(tail9(c.phone))) byTail.set(tail9(c.phone), c);
    const list: Conv[] = mailConversations.map((c) => ({ ...c }));
    const byKey = new Map(list.map((c) => [c.key, c]));
    for (const r of (box === "business" ? ((waConvsQ.data ?? []) as any[]) : [])) {
      const contact = byTail.get(tail9(String(r.phone ?? "")));
      const at = Date.parse(r.created_at) || 0;
      const snippet = `🟢 ${r.body || (r.media_type ? `[${r.media_filename || r.media_type}]` : "")}`;
      const conv = contact ? byKey.get(`p:${contact.email}`) : undefined;
      // WhatsApp unread = her newest message came in after the last time this phone's chat was opened here.
      const waUnread = !!waSeenBase && r.direction === "in" && at > Math.max(prefs.waSeen?.[r.phone] ?? 0, waSeenBase);
      if (conv && !conv.isGroup) {
        conv.waPhone = r.phone;
        if (waUnread) conv.unread = true;
        if (at > conv.lastDate) {
          conv.lastDate = at;
          conv.snippet = snippet;
          conv.lastFromMe = r.direction === "out";
        }
        continue;
      }
      const name = r.contact_name || contact?.name || "";
      const w: Conv = {
        key: `w:${r.phone}`,
        title: name || `+${r.phone}`,
        subtitle: `+${r.phone}`,
        isGroup: false,
        participants: contact ? [{ email: contact.email, name: contact.name }] : [],
        channel: "studio",
        lastDate: at,
        snippet,
        lastFromMe: r.direction === "out",
        unread: waUnread,
        hasDraft: false,
        threads: [],
        waPhone: r.phone,
        waOnly: true,
      };
      list.push(w);
      byKey.set(w.key, w);
    }
    return list;
  }, [mailConversations, waConvsQ.data, allContacts, prefs.waSeen, waSeenBase, box]);
  const active = conversations.find((c) => c.key === activeKey) ?? null;
  useEffect(() => {
    const phone = active?.waPhone;
    if (!phone || !prefsQ.data) return;
    const row = ((waConvsQ.data ?? []) as any[]).find((r) => r.phone === phone);
    const at = row ? Date.parse(row.created_at) || 0 : 0;
    if (at > (prefs.waSeen?.[phone] ?? 0)) updatePrefs({ ...prefs, waSeen: { ...(prefs.waSeen ?? {}), [phone]: Date.now() } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.waPhone, waConvsQ.data, prefsQ.data]);
  const isArchived = (c: MailConversation) => (prefs.archived[c.key] ?? 0) >= c.lastDate;

  const thread = useQuery({
    queryKey: ["mail-chat", activeKey, active?.threads.map((t) => t.threadId).join(",")],
    queryFn: () => fetchChat({ data: { threads: active!.threads.slice(0, 30) } }),
    enabled: !!active && active.threads.length > 0,
    refetchInterval: active ? 15000 : false,
  });
  const waThread = useQuery({
    queryKey: ["mail-wa-thread", active?.waPhone],
    queryFn: () => fetchWaThread({ data: { phone: active!.waPhone! } }),
    enabled: !!active?.waPhone,
    refetchInterval: active?.waPhone ? 15000 : false,
  });
  const card = useQuery({
    queryKey: ["mail-card", activeKey],
    queryFn: () =>
      fetchCard({
        data: {
          emails: (active?.participants ?? []).map((p) => p.email).slice(0, 20),
          phones: [active?.waPhone, contactByEmail.get(active?.participants[0]?.email ?? "")?.phone].filter(Boolean) as string[],
        },
      }),
    enabled: showCard && !!active,
    staleTime: 60000,
  });

  const q = search.trim().toLowerCase();
  const visibleChats = useMemo(() => {
    const list = conversations.filter((c) => {
      const archived = isArchived(c);
      if (filter === "archived") return archived;
      if (archived && !serverSearch) return false;
      if (filter === "unread" && !c.unread) return false;
      if (filter === "waiting" && c.lastFromMe) return false;
      if (filter === "reminders" && !(prefs.reminders?.[c.key] && prefs.reminders[c.key] <= now)) return false;
      if (filter === "drafts" && !c.hasDraft) return false;
      if (filter === "studio" && c.channel !== "studio") return false;
      if (filter === "personal" && c.channel !== "personal") return false;
      if (filter === "groups" && !c.isGroup) return false;
      if (filter === "whatsapp" && !(c as Conv).waPhone) return false;
      if (filter.startsWith("label:") && prefs.labels[c.key] !== filter.slice(6)) return false;
      if (!q || serverSearch) return true;
      return [c.title, c.subtitle, c.snippet, ...c.participants.map((p) => `${p.name} ${p.email}`)].join(" ").toLowerCase().includes(q);
    });
    const pinned = new Set(prefs.pinned);
    const due = (k: string) => Number(!!prefs.reminders?.[k] && prefs.reminders[k] <= now);
    return list.sort((a, b) => due(b.key) - due(a.key) || Number(pinned.has(b.key)) - Number(pinned.has(a.key)) || b.lastDate - a.lastDate);
  }, [conversations, filter, q, serverSearch, prefs, now]);

  const visibleContacts = useMemo(() => allContacts.filter((c) => !q || `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(q)), [allContacts, q]);
  const inbox = conversations.filter((c) => !isArchived(c));
  const unreadCount = inbox.filter((c) => c.unread).length;
  const draftCount = inbox.filter((c) => c.hasDraft).length;
  const waitingCount = inbox.filter((c) => !c.lastFromMe).length;
  const dueReminders = conversations.filter((c) => prefs.reminders?.[c.key] && prefs.reminders[c.key] <= now);
  const archivedCount = conversations.filter(isArchived).length;
  const usedLabels = LABELS.filter((l) => Object.values(prefs.labels).includes(l.id));

  // ── tab title + browser notification for a new incoming mail ──
  const lastSeen = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    const base = "מיילים · Sweetbaby";
    document.title = unreadCount ? `(${unreadCount}) ${base}` : base;
    return () => {
      document.title = "Sweetbaby";
    };
  }, [unreadCount]);
  useEffect(() => {
    if (serverSearch || !chats.data) return;
    const now = new Map(conversations.map((c) => [c.key, c.lastDate]));
    if (lastSeen.current && typeof Notification !== "undefined" && Notification.permission === "granted") {
      for (const c of conversations) {
        const before = lastSeen.current.get(c.key) ?? 0;
        if (c.lastDate > before && c.unread && !c.lastFromMe && c.key !== activeKey) {
          try {
            new Notification(`✉️ ${c.title}`, { body: c.snippet.slice(0, 140), tag: c.key });
          } catch {
            // some browsers only allow notifications from a service worker
          }
        }
      }
    }
    lastSeen.current = now;
  }, [chats.data]);

  const notifiedReminders = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const c of dueReminders) {
      const id = `${c.key}:${prefs.reminders[c.key]}`;
      if (notifiedReminders.current.has(id)) continue;
      notifiedReminders.current.add(id);
      toast(`⏰ תזכורת: לחזור אל ${c.title}`, { action: { label: "פתיחה", onClick: () => openChat(c.key) } });
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification(`⏰ לחזור אל ${c.title}`, { body: c.snippet.slice(0, 140), tag: `rem-${c.key}` });
        } catch {
          // some browsers only allow notifications from a service worker
        }
      }
    }
  }, [dueReminders.map((c) => c.key).join(",")]);

  function setReminder(key: string, at: number | null) {
    const reminders = { ...(prefs.reminders ?? {}) };
    if (at) reminders[key] = at;
    else delete reminders[key];
    updatePrefs({ ...prefs, reminders });
  }

  const allMessages: ChatMsg[] = useMemo(() => {
    const real = active?.threads.length ? ((thread.data?.messages ?? []) as ChatMsg[]) : [];
    const mine = pending.filter((p) => (p.wa ? p.threadId === `wa:${active?.waPhone}` : active?.threads.some((t) => t.threadId === p.threadId)));
    const wa: ChatMsg[] = active?.waPhone
      ? ((waThread.data ?? []) as any[]).map((r) => ({
          id: `wa-${r.id}`,
          threadId: `wa:${r.phone}`,
          account: "",
          at: Date.parse(r.created_at) || 0,
          fromMe: r.direction === "out",
          fromName: r.contact_name || active.title,
          fromEmail: "",
          to: [],
          subject: "",
          text: r.body ?? "",
          attachments: [],
          wa: true,
          media: r.media_url ? { url: r.media_url, type: r.media_type ?? "document", filename: r.media_filename, mime: r.media_mime } : undefined,
          waFailed: r.status === "failed" ? r.error || "לא נשלחה" : undefined,
        }))
      : [];
    return [...real, ...wa, ...mine].sort((a, b) => a.at - b.at);
  }, [thread.data, waThread.data, pending, active]);
  // Search inside the open chat.
  const cq = chatSearch.trim().toLowerCase();
  const messages = useMemo(
    () => (cq ? allMessages.filter((m) => `${m.text} ${m.fromName} ${m.subject} ${m.attachments.map((a) => a.filename).join(" ")}`.toLowerCase().includes(cq)) : allMessages),
    [allMessages, cq],
  );
  // The subject chip shows where a new mail subject starts (WhatsApp messages do not break it).
  const subjectChips = useMemo(() => {
    const ids = new Set<string>();
    let last = "";
    for (const m of messages) {
      if (m.wa || !m.subject) continue;
      if (m.subject !== last) ids.add(m.id);
      last = m.subject;
    }
    return ids;
  }, [messages]);
  const drafts: ChatDraft[] = (thread.data?.drafts ?? []) as ChatDraft[];
  const topDraft = drafts[0] ?? null;

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, activeKey, showThread, topDraft?.draftId]);

  useEffect(() => {
    if (thread.data || waThread.data) setPending([]);
  }, [thread.data, waThread.data]);

  useEffect(() => {
    setDraft("");
    setFiles([]);
    setExpanded({});
    setEditingDraft(null);
    setDesigned(false);
    setShowCard(false);
    setDraftOpen(false);
    setQuote(null);
    setChatSearch("");
    setChatSearchOpen(false);
    setReplyVia(active?.waOnly ? "wa" : "mail");
    setCcList([]);
    setCcOpen(false);
  }, [activeKey]);

  // Phone: the device "back" button closes the open chat and returns to the list (like WhatsApp) instead of leaving the page.
  useEffect(() => {
    if (!showThread || typeof window === "undefined" || window.matchMedia("(min-width: 768px)").matches) return;
    window.history.pushState({ mailChat: true }, "");
    const onPop = () => setShowThread(false);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [showThread]);

  function closeThread() {
    if (typeof window !== "undefined" && window.history.state?.mailChat) window.history.back();
    else setShowThread(false);
  }

  function openChat(key: string) {
    setActiveKey(key);
    setShowThread(true);
    setTab("chats");
  }

  function openContact(c: Contact) {
    const conv = conversations.find((x) => !x.isGroup && x.participants[0]?.email === c.email);
    if (conv) openChat(conv.key);
    else {
      setComposeTo([c]);
      setComposeOpen(true);
    }
  }

  async function addFiles(list: FileList | null) {
    try {
      const add = await readFiles(list);
      const total = [...files, ...add].reduce((n, f) => n + f.size, 0);
      if (total > MAX_ATTACH) {
        toast.error("עד 18MB של קבצים ביחד");
        return;
      }
      setFiles((f) => [...f, ...add].slice(0, 10));
    } catch (e: any) {
      toast.error(e?.message ?? "לא הצלחתי לצרף");
    }
  }

  const refreshAll = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["mail-chat"] }),
      qc.invalidateQueries({ queryKey: ["mail-chats"] }),
      qc.invalidateQueries({ queryKey: ["mail-wa-thread"] }),
      qc.invalidateQueries({ queryKey: ["mail-wa-convs"] }),
    ]);

  /** The mail thread a reply goes to: the edited draft's, the quoted mail's, else the newest mail of the chat. */
  function replyTarget(): { threadId: string; account: string } | null {
    if (!active) return null;
    if (editingDraft) return { threadId: editingDraft.threadId, account: editingDraft.account };
    if (quote && !quote.wa && quote.account) return { threadId: quote.threadId, account: quote.account };
    const last = [...allMessages].reverse().find((m) => !m.pending && !m.wa) ?? null;
    if (last) return { threadId: last.threadId, account: last.account };
    return active.threads[0] ?? null;
  }

  async function sendWhatsApp(text: string) {
    if (!active?.waPhone) return;
    const phone = active.waPhone;
    const sentFiles = files;
    const temp: ChatMsg = {
      id: `tmp-${Date.now()}`,
      threadId: `wa:${phone}`,
      account: "",
      at: Date.now(),
      fromMe: true,
      fromName: "",
      fromEmail: "",
      to: [],
      subject: "",
      text,
      attachments: sentFiles.map((f, i) => ({ filename: f.filename, mimeType: f.contentType, size: f.size, attachmentId: `tmp${i}`, messageId: "" })),
      wa: true,
      pending: true,
    };
    setSending(true);
    setPending((p) => [...p, temp]);
    setDraft("");
    setFiles([]);
    setQuote(null);
    try {
      if (sentFiles.length) {
        // Each file goes as its own WhatsApp message; the text rides as the caption of the first one that can carry it.
        let captionUsed = !text;
        for (const f of sentFiles) {
          const { url, type } = await uploadMediaToStorage(outFileToFile(f));
          const canCaption = type === "image" || type === "video" || type === "document";
          await doSendWaMedia({ data: { phone, mediaUrl: url, mediaType: type, caption: !captionUsed && canCaption ? text : undefined } });
          if (!captionUsed && canCaption) captionUsed = true;
        }
        if (!captionUsed) await doSendWa({ data: { phone, body: text } });
      } else {
        await doSendWa({ data: { phone, body: text } });
      }
      await refreshAll();
    } catch (e: any) {
      setPending((p) => p.filter((m) => m.id !== temp.id));
      setDraft(text);
      setFiles(sentFiles);
      toast.error(e?.message ?? "שליחת הוואטסאפ נכשלה");
    } finally {
      setSending(false);
    }
  }

  async function sendReply() {
    const typed = draft.trim();
    if ((!typed && !(replyVia === "wa" && files.length)) || !active || sending) return;
    if (replyVia === "wa") return sendWhatsApp(typed);
    const target = replyTarget();
    if (!target) {
      // A WhatsApp-only chat with no mail yet: start a new mail to her instead.
      const c = active.participants[0] ? contactByEmail.get(active.participants[0].email) : undefined;
      if (!c) return toast.error("אין כתובת מייל לאדם הזה — אפשר לענות בוואטסאפ");
      setComposeTo([c]);
      setComposeOpen(true);
      return;
    }
    const text = quote && !quote.wa ? `${typed}\n\n${quoteBlock(quote)}` : typed;
    const last = [...allMessages].reverse().find((m) => !m.pending && !m.wa) ?? null;
    setSending(true);
    const temp: ChatMsg = {
      id: `tmp-${Date.now()}`,
      threadId: target.threadId,
      account: target.account,
      at: Date.now(),
      fromMe: true,
      fromName: "",
      fromEmail: "",
      to: [],
      subject: last?.subject ?? "",
      text: typed,
      attachments: files.map((f, i) => ({ filename: f.filename, mimeType: f.contentType, size: f.size, attachmentId: `tmp${i}`, messageId: "" })),
      pending: true,
    };
    setPending((p) => [...p, temp]);
    const sentFiles = files;
    const replaced = editingDraft;
    const quoted = quote;
    setDraft("");
    setFiles([]);
    setEditingDraft(null);
    setQuote(null);
    try {
      if (prefs.reminders?.[active.key] && prefs.reminders[active.key] <= Date.now()) setReminder(active.key, null);
      await doReply({
        data: {
          threadId: target.threadId,
          account: target.account,
          text,
          channel: active.channel,
          designed,
          attachments: sentFiles.map(({ filename, contentType, base64Data }) => ({ filename, contentType, base64Data })),
          replacesDraftId: replaced?.draftId,
          ...(ccList.length ? { cc: ccList } : {}),
        },
      });
      await refreshAll();
    } catch (e: any) {
      setPending((p) => p.filter((m) => m.id !== temp.id));
      setDraft(typed);
      setFiles(sentFiles);
      setEditingDraft(replaced);
      setQuote(quoted);
      toast.error(e?.message ?? "השליחה נכשלה");
    } finally {
      setSending(false);
    }
  }

  async function suggestReply() {
    if (!active || suggesting) return;
    const recent = allMessages.filter((m) => !m.pending && m.text.trim()).slice(-12);
    if (!recent.length) return toast.error("אין עדיין הודעות לענות עליהן");
    setSuggesting(true);
    try {
      const { text } = await doSuggest({
        data: {
          channel: active.channel,
          isGroup: active.isGroup,
          title: active.title.slice(0, 200),
          messages: recent.map((m) => ({ fromMe: m.fromMe, name: (m.fromName || m.fromEmail || "").slice(0, 120), text: m.text.slice(0, 4000), at: m.at })),
          hint: draft.trim().slice(0, 500),
        },
      });
      setDraft(text);
      setTimeout(() => textRef.current?.focus(), 50);
      toast.success("הצעה מוכנה — אפשר לערוך לפני השליחה");
    } catch (e: any) {
      toast.error(e?.message ?? "לא הצלחתי להציע תשובה");
    } finally {
      setSuggesting(false);
    }
  }

  async function scheduleReply(at: number) {
    if (!active) return;
    const text = draft.trim();
    if (!text) return toast.error("כתבי קודם את ההודעה");
    const target = replyTarget();
    if (!target) return toast.error("אין מייל בשיחה הזאת לתזמן אליו");
    try {
      await doSchedule({
        data: {
          at,
          kind: "reply",
          chatKey: active.key,
          label: active.title.slice(0, 200),
          text: quote && !quote.wa ? `${text}\n\n${quoteBlock(quote)}` : text,
          channel: active.channel,
          designed,
          threadId: target.threadId,
          account: target.account,
          attachments: files.map(({ filename, contentType, base64Data }) => ({ filename, contentType, base64Data })),
          ...(ccList.length ? { cc: ccList } : {}),
        },
      });
      setDraft("");
      setFiles([]);
      setQuote(null);
      setEditingDraft(null);
      setScheduleOpen(false);
      toast.success(`המייל יישלח ב-${new Date(at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}`);
      await qc.invalidateQueries({ queryKey: ["mail-scheduled"] });
    } catch (e: any) {
      toast.error(e?.message ?? "התזמון נכשל");
    }
  }

  async function cancelScheduled(id: string) {
    try {
      await doCancelScheduled({ data: { id } });
      toast.success("התזמון בוטל");
      await qc.invalidateQueries({ queryKey: ["mail-scheduled"] });
    } catch (e: any) {
      toast.error(e?.message ?? "הביטול נכשל");
    }
  }

  async function markUnread() {
    if (!active?.threads.length) return;
    const newest = active.threads[0];
    try {
      await doUnread({ data: { threadId: newest.threadId, account: newest.account } });
      setActiveKey(null);
      closeThread();
      toast.success("סומן כלא נקרא");
      await qc.invalidateQueries({ queryKey: ["mail-chats"] });
    } catch (e: any) {
      toast.error(e?.message ?? "לא הצלחתי לסמן");
    }
  }

  async function sendDraftAsIs(d: ChatDraft) {
    if (!confirm("לשלוח את הטיוטה בדיוק כמו שהוכנה (עם העיצוב)?")) return;
    setBusyDraft(d.draftId);
    try {
      await doSendDraft({ data: { account: d.account, draftId: d.draftId } });
      toast.success("הטיוטה נשלחה");
      await refreshAll();
    } catch (e: any) {
      toast.error(e?.message ?? "שליחת הטיוטה נכשלה");
    } finally {
      setBusyDraft(null);
    }
  }

  async function removeDraft(d: ChatDraft) {
    if (!confirm("למחוק את הטיוטה?")) return;
    setBusyDraft(d.draftId);
    try {
      await doDeleteDraft({ data: { account: d.account, draftId: d.draftId } });
      if (editingDraft?.draftId === d.draftId) setEditingDraft(null);
      toast.success("הטיוטה נמחקה");
      await refreshAll();
    } catch (e: any) {
      toast.error(e?.message ?? "המחיקה נכשלה");
    } finally {
      setBusyDraft(null);
    }
  }

  function editDraft(d: ChatDraft) {
    setEditingDraft(d);
    setDraft(d.text);
    setDesigned(true);
    setTimeout(() => textRef.current?.focus(), 50);
  }

  async function archiveActive() {
    if (!active) return;
    const key = active.key;
    updatePrefs({ ...prefs, archived: { ...prefs.archived, [key]: Date.now() }, pinned: prefs.pinned.filter((k) => k !== key) });
    setActiveKey(null);
    setShowThread(false);
    toast.success("השיחה הועברה לארכיון", {
      action: {
        label: "ביטול",
        onClick: () => {
          const { [key]: _drop, ...rest } = prefs.archived;
          updatePrefs({ ...prefs, archived: rest });
        },
      },
    });
    if (active.threads.length) doArchive({ data: { threads: active.threads.slice(0, 30) } }).catch(() => undefined);
  }

  function unarchive(key: string) {
    const { [key]: _drop, ...rest } = prefs.archived;
    updatePrefs({ ...prefs, archived: rest });
  }

  function togglePin(key: string) {
    const pinned = prefs.pinned.includes(key) ? prefs.pinned.filter((k) => k !== key) : [key, ...prefs.pinned].slice(0, 50);
    updatePrefs({ ...prefs, pinned });
  }

  function setLabel(key: string, label: string | null) {
    const labels = { ...prefs.labels };
    if (label) labels[key] = label;
    else delete labels[key];
    updatePrefs({ ...prefs, labels });
  }

  async function openAttachment(m: ChatMsg, a: ChatMsg["attachments"][number]) {
    if (!a.messageId) return;
    const t = toast.loading(`פותחת את ${a.filename}…`);
    try {
      const { base64 } = await fetchAttachment({ data: { account: m.account, messageId: a.messageId, attachmentId: a.attachmentId } });
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: a.mimeType || "application/octet-stream" }));
      const link = document.createElement("a");
      link.href = url;
      if (/^(image\/|application\/pdf|text\/)/.test(a.mimeType)) link.target = "_blank";
      else link.download = a.filename;
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.dismiss(t);
    } catch (e: any) {
      toast.error(e?.message ?? "לא הצלחתי לפתוח את הקובץ", { id: t });
    }
  }

  const syncedAgo = chats.dataUpdatedAt ? Math.max(0, Math.round((Date.now() - chats.dataUpdatedAt) / 1000)) : null;
  const activeContact = active && !active.isGroup ? contactByEmail.get(active.participants[0]?.email ?? "") : undefined;
  const activeLabel = active ? prefs.labels[active.key] : undefined;
  const notifyState = typeof Notification === "undefined" ? "unsupported" : Notification.permission;

  const filters: Array<{ id: Filter; label: string; count?: number }> = [
    ...(dueReminders.length ? [{ id: "reminders" as Filter, label: "⏰ לחזור אליהן", count: dueReminders.length }] : []),
    ...BASE_FILTERS.map((f) => ({ ...f, count: f.id === "unread" ? unreadCount : f.id === "drafts" ? draftCount : f.id === "waiting" ? waitingCount : undefined })),
    ...usedLabels.map((l) => ({ id: `label:${l.id}` as Filter, label: `🏷 ${l.id}` })),
    ...(archivedCount ? [{ id: "archived" as Filter, label: "ארכיון", count: archivedCount }] : []),
  ];

  // ── render ──
  return (
    <div
      dir="rtl"
      className="md:space-y-4 md:rounded-2xl md:p-4 md:pb-5 md:bg-[linear-gradient(#00a884_0,#00a884_128px,#d1d7db_128px)] max-md:fixed max-md:inset-0 max-md:z-50 max-md:flex max-md:flex-col max-md:bg-white max-md:pt-[env(safe-area-inset-top)]"
    >
      {/* On a phone the page title hides while a chat is open, so the chat gets the whole screen (like WhatsApp). */}
      <div className="hidden md:flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="h-9 w-9 md:h-10 md:w-10 shrink-0 rounded-full flex items-center justify-center bg-white" style={{ color: WA.green }}>
            <Mail className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-xl md:text-2xl text-white truncate">מיילים כמו וואטסאפ</h2>
            <p className="hidden sm:block text-sm text-white/85">כל המיילים של הסטודיו והאישי במקום אחד, מסונכרנים אוטומטית מ-Gmail — עונים ישר מכאן</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
          {notifyState === "default" && (
            <Button
              variant="ghost"
              aria-label="הפעלת התראות"
              className="rounded-full gap-2 px-2.5 md:px-4 text-white hover:bg-white/15 hover:text-white"
              onClick={() => Notification.requestPermission().then((p) => p === "granted" && toast.success("התראות הופעלו"))}
            >
              <Bell className="h-4 w-4" /> <span className="hidden md:inline">הפעלת התראות</span>
            </Button>
          )}
          <Button
            aria-label="מייל חדש"
            className="rounded-full gap-2 px-3 md:px-4 bg-white hover:bg-white/90 shadow-sm"
            style={{ color: WA.greenDark }}
            onClick={() => {
              setComposeTo([]);
              setComposeOpen(true);
            }}
          >
            <MessageSquarePlus className="h-4 w-4" /> <span className="hidden sm:inline">מייל חדש</span>
          </Button>
        </div>
      </div>

      {chats.data && !chats.data.connected && (
        <div className="bg-amber-50 border border-amber-200 md:rounded-2xl p-4 text-sm text-amber-900">חשבון ה-Gmail לא מחובר לאתר, ולכן אין מה להציג. יש לחבר אותו בהגדרות הפרויקט.</div>
      )}

      <div
        className="grid md:grid-cols-[370px_1fr] overflow-hidden max-md:flex-1 max-md:min-h-0 md:rounded-lg md:shadow-[0_6px_18px_rgba(11,20,26,0.18)] md:h-[calc(100dvh-14rem)] md:min-h-[620px]"
        style={{ borderColor: WA.line, background: "#fff" }}
      >
        {/* ── side panel ── */}
        <aside className={`relative min-h-0 flex-col border-l ${showThread ? "hidden md:flex" : "flex"}`} style={{ borderColor: WA.line }}>
          {/* Phone: an app bar like WhatsApp (title + back to the admin + notifications). */}
          <div className="md:hidden shrink-0 h-14 px-2 flex items-center gap-1 text-white" style={{ background: WA.greenDark }}>
            <a href="/admin" aria-label="חזרה לניהול" className="h-10 w-10 rounded-full flex items-center justify-center active:bg-white/15">
              <ArrowRight className="h-5 w-5" />
            </a>
            <div className="flex-1 min-w-0 text-lg font-semibold truncate">מיילים</div>
            {notifyState === "default" && (
              <button
                type="button"
                aria-label="הפעלת התראות"
                onClick={() => Notification.requestPermission().then((p) => p === "granted" && toast.success("התראות הופעלו"))}
                className="h-10 w-10 rounded-full flex items-center justify-center active:bg-white/15"
              >
                <Bell className="h-5 w-5" />
              </button>
            )}
            {tab === "contacts" && (
              <button
                type="button"
                onClick={() => {
                  setSelectMode((v) => !v);
                  setSelected({});
                }}
                className="h-9 px-3 rounded-full text-sm font-medium flex items-center gap-1 active:bg-white/15"
              >
                <Users className="h-4 w-4" /> {selectMode ? "ביטול" : "קבוצה"}
              </button>
            )}
          </div>
          <div className="shrink-0 px-3 pt-2 md:pt-3 pb-2 space-y-2 bg-white">
            <div className="hidden md:flex rounded-full p-1" style={{ background: WA.panel }}>
              {(
                [
                  { id: "chats", label: "שיחות", icon: Mail, badge: unreadCount },
                  { id: "contacts", label: "אנשי קשר", icon: BookUser, badge: 0 },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className="flex-1 h-9 rounded-full text-sm font-medium flex items-center justify-center gap-1.5 transition"
                  style={tab === t.id ? { background: "#fff", color: WA.greenDark, boxShadow: "0 1px 2px rgba(0,0,0,.08)" } : { color: WA.muted }}
                >
                  <t.icon className="h-4 w-4" /> {t.label}
                  {t.badge > 0 && (
                    <span className="min-w-5 h-5 px-1.5 rounded-full text-[11px] text-white flex items-center justify-center" style={{ background: WA.unread }}>
                      {t.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: WA.muted }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tab === "chats" ? "חיפוש בכל המיילים — שם, מייל או מילה" : "חיפוש איש קשר"}
                className="w-full h-10 rounded-lg pr-9 pl-8 text-base md:text-sm outline-none"
                style={{ background: WA.panel, color: WA.ink }}
              />
              {search && (
                <button type="button" aria-label="ניקוי חיפוש" onClick={() => setSearch("")} className="absolute left-2 top-1/2 -translate-y-1/2 p-1">
                  <X className="h-4 w-4" style={{ color: WA.muted }} />
                </button>
              )}
            </div>
            {tab === "chats" && (
              <div className="grid grid-cols-2 gap-1 rounded-full p-1" style={{ background: WA.panel }}>
                {(
                  [
                    { id: "business", label: "💼 עסק · סוויט בייבי" },
                    { id: "personal", label: "🏠 אישי" },
                  ] as const
                ).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBox(b.id)}
                    className="h-9 rounded-full text-sm font-semibold transition"
                    style={box === b.id ? { background: "#fff", color: WA.greenDark, boxShadow: "0 1px 3px rgba(0,0,0,.12)" } : { color: WA.muted }}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            )}
            {tab === "chats" ? (
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {filters.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    className="shrink-0 h-8 px-3 rounded-full text-xs font-medium transition whitespace-nowrap flex items-center gap-1"
                    style={filter === f.id ? { background: "#d9fdd3", color: WA.greenDark } : { background: WA.panel, color: WA.muted }}
                  >
                    {f.label}
                    {!!f.count && <span className="opacity-70">{f.count}</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 text-xs" style={{ color: WA.muted }}>
                <span>{allContacts.length} אנשי קשר · מהאתר ומהמיילים</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectMode((v) => !v);
                    setSelected({});
                  }}
                  className="hidden md:flex h-8 px-3 rounded-full font-medium items-center gap-1"
                  style={selectMode ? { background: "#d9fdd3", color: WA.greenDark } : { background: WA.panel, color: WA.ink }}
                >
                  <Users className="h-3.5 w-3.5" /> {selectMode ? "ביטול בחירה" : "קבוצה חדשה"}
                </button>
              </div>
            )}
            {tab === "chats" && scheduled.length > 0 && (
              <button type="button" onClick={() => setScheduledOpen(true)} className="text-[12px] flex items-center gap-1 font-medium" style={{ color: "#1e6fbf" }}>
                <Clock className="h-3.5 w-3.5" /> {scheduled.length} מיילים מתוזמנים
                {scheduled.some((x) => x.error) && <span style={{ color: "#b3261e" }}>· יש שנכשל</span>}
              </button>
            )}
            {tab === "chats" && serverSearch && (
              <div className="text-[11px] flex items-center gap-1" style={{ color: WA.muted }}>
                {chats.isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                {chats.isFetching ? "מחפשת בכל תוכן המיילים…" : `תוצאות מכל תוכן המיילים עבור "${serverSearch}"`}
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "chats" ? (
              chats.isLoading ? (
                <ListSkeleton />
              ) : visibleChats.length === 0 ? (
                <EmptyNote text={q || filter !== "all" ? "אין שיחות שמתאימות" : "אין עדיין שיחות"} />
              ) : (
                visibleChats.map((c) => {
                  const lab = labelStyle(prefs.labels[c.key]);
                  const pinned = prefs.pinned.includes(c.key);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => openChat(c.key)}
                      className="w-full text-right flex items-center gap-3 px-3 py-2.5 transition hover:bg-[#f5f6f6]"
                      style={activeKey === c.key ? { background: WA.panel } : undefined}
                    >
                      <Avatar name={c.title} seed={c.key} group={c.isGroup} />
                      <div className="min-w-0 flex-1 border-b py-1" style={{ borderColor: "#f0f2f5" }}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[15px]" style={{ color: WA.ink, fontWeight: c.unread ? 700 : 500 }}>
                            {c.title}
                          </span>
                          <span className="shrink-0 text-[11px]" style={{ color: c.unread ? WA.unread : WA.muted, fontWeight: c.unread ? 600 : 400 }}>
                            {listTime(c.lastDate)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <span className="truncate text-[13px] flex items-center gap-1" style={{ color: WA.muted }}>
                            {c.hasDraft ? (
                              <>
                                <span className="shrink-0 font-semibold" style={{ color: "#d97706" }}>
                                  ✍️ טיוטה מוכנה:
                                </span>
                                <span className="truncate">{c.snippet}</span>
                              </>
                            ) : (
                              <>
                                {c.lastFromMe && <CheckCheck className="h-3.5 w-3.5 shrink-0" style={{ color: "#53bdeb" }} />}
                                {c.isGroup && !c.lastFromMe && <span className="shrink-0">{c.participants.length} משתתפים ·</span>}
                                <span className="truncate">{c.snippet}</span>
                              </>
                            )}
                          </span>
                          <span className="shrink-0 flex items-center gap-1">
                            {lab && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: lab.bg, color: lab.color }}>
                                {lab.id}
                              </span>
                            )}
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full"
                              style={c.channel === "studio" ? { background: "#fde8ec", color: "#b0365d" } : { background: "#eef1f3", color: WA.muted }}
                            >
                              {c.channel === "studio" ? "סטודיו" : "אישי"}
                            </span>
                            {prefs.reminders?.[c.key] && prefs.reminders[c.key] <= now && <AlarmClock className="h-3.5 w-3.5" style={{ color: "#d97706" }} aria-label="לחזור" />}
                            {prefs.notes?.[c.key] && <span title={prefs.notes[c.key]} className="text-[11px]">📝</span>}
                            {pinned && <Pin className="h-3.5 w-3.5 rotate-45" style={{ color: WA.muted }} aria-label="מוצמד" />}
                            {c.unread && <span className="h-2.5 w-2.5 rounded-full" style={{ background: WA.unread }} aria-label="לא נקרא" />}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )
            ) : contactsQ.isLoading && !conversations.length ? (
              <ListSkeleton />
            ) : visibleContacts.length === 0 ? (
              <EmptyNote text="לא נמצאו אנשי קשר" />
            ) : (
              <ContactList
                contacts={visibleContacts}
                selectMode={selectMode}
                selected={selected}
                onToggle={(c) =>
                  setSelected((s) => {
                    const n = { ...s };
                    if (n[c.email]) delete n[c.email];
                    else n[c.email] = c;
                    return n;
                  })
                }
                onOpen={openContact}
              />
            )}
          </div>

          {tab === "contacts" && selectMode && Object.keys(selected).length > 0 && (
            <div className="shrink-0 p-3 border-t flex items-center justify-between gap-2" style={{ borderColor: WA.line }}>
              <span className="text-sm" style={{ color: WA.ink }}>
                נבחרו {Object.keys(selected).length}
              </span>
              <Button
                className="rounded-full gap-2 text-white"
                style={{ background: WA.green }}
                onClick={() => {
                  setComposeTo(Object.values(selected));
                  setComposeOpen(true);
                }}
              >
                <Users className="h-4 w-4" /> פתיחת קבוצה
              </Button>
            </div>
          )}

          {/* Phone: floating "new mail" button, like WhatsApp's new-chat button. */}
          {tab === "chats" && (
            <button
              type="button"
              aria-label="מייל חדש"
              onClick={() => {
                setComposeTo([]);
                setComposeOpen(true);
              }}
              className="md:hidden absolute left-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 h-14 w-14 rounded-2xl shadow-lg flex items-center justify-center text-white active:scale-95 transition"
              style={{ background: WA.green }}
            >
              <MessageSquarePlus className="h-6 w-6" />
            </button>
          )}
          <div className="hidden md:flex shrink-0 px-3 py-2 text-[11px] items-center justify-between border-t" style={{ borderColor: WA.line, color: WA.muted }}>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: chats.isError ? "#e53935" : WA.unread }} />
              {chats.isError ? "שגיאת סנכרון" : syncedAgo === null ? "מסנכרן…" : `מסונכרן עם Gmail · לפני ${syncedAgo} שנ׳`}
            </span>
            <button
              type="button"
              aria-label="רענון"
              onClick={() => {
                void chats.refetch();
                void thread.refetch();
              }}
              className="p-1 rounded hover:bg-[#f0f2f5]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${chats.isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
          {/* Phone: bottom tabs like the WhatsApp app. */}
          <nav className="md:hidden shrink-0 grid grid-cols-2 border-t bg-white pb-[env(safe-area-inset-bottom)]" style={{ borderColor: WA.line }}>
            {(
              [
                { id: "chats", label: "שיחות", icon: Mail, badge: unreadCount },
                { id: "contacts", label: "אנשי קשר", icon: BookUser, badge: 0 },
              ] as const
            ).map((t) => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} className="h-14 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium" style={{ color: tab === t.id ? WA.greenDark : WA.muted }}>
                <span className="relative h-7 px-4 rounded-full flex items-center justify-center" style={tab === t.id ? { background: "#d9fdd3" } : undefined}>
                  <t.icon className="h-5 w-5" />
                  {t.badge > 0 && (
                    <span className="absolute -top-1 -left-1 min-w-4 h-4 px-1 rounded-full text-[10px] text-white flex items-center justify-center" style={{ background: WA.unread }}>
                      {t.badge}
                    </span>
                  )}
                </span>
                {t.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* ── chat pane ── */}
        <section className={`min-h-0 flex-col ${showThread ? "flex" : "hidden md:flex"}`}>
          {!active ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-8" style={{ background: "#f8f9fa", color: WA.muted }}>
              <div className="h-20 w-20 rounded-full flex items-center justify-center" style={{ background: "#e7f8f2" }}>
                <Mail className="h-9 w-9" style={{ color: WA.green }} />
              </div>
              <div className="text-xl font-light" style={{ color: WA.ink }}>
                המיילים שלך, בשיחה אחת
              </div>
              <p className="text-sm max-w-sm leading-relaxed">
                בחרי שיחה מהרשימה. כל אדם הוא צ'אט אחד (כל המיילים איתו יחד), ומייל עם כמה נמענים מוצג כקבוצה. טיוטות שהאתר הכין מסומנות ב-✍️ ומחכות לך בתוך השיחה.
              </p>
              {draftCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilter("drafts")}
                  className="mt-2 h-9 px-4 rounded-full text-sm font-medium"
                  style={{ background: WA.draft, color: WA.draftInk }}
                >
                  ✍️ {draftCount} טיוטות מחכות לך
                </button>
              )}
            </div>
          ) : (
            <>
              <header
                className="relative shrink-0 h-14 md:h-[60px] px-1.5 md:px-3 flex items-center gap-1 md:gap-2 border-b max-md:text-white max-md:border-0"
                style={{ background: WA.panel, borderColor: WA.line }}
              >
                <span aria-hidden className="md:hidden absolute inset-0 -z-0" style={{ background: WA.greenDark }} />
                <button
                  type="button"
                  aria-label="חזרה לרשימה"
                  onClick={closeThread}
                  className="relative md:hidden h-10 w-10 shrink-0 rounded-full flex items-center justify-center active:bg-white/15"
                >
                  <ArrowRight className="h-5 w-5 text-white" />
                </button>
                <button type="button" onClick={() => setShowCard((v) => !v)} className="relative min-w-0 flex-1 flex items-center gap-2.5 md:gap-3 text-right" aria-label="פרטי השיחה">
                  <Avatar name={active.title} seed={active.key} group={active.isGroup} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-[15px] flex items-center gap-1.5 md:text-[#111b21]">
                      {active.title}
                      {activeLabel && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-normal" style={{ background: labelStyle(activeLabel)?.bg, color: labelStyle(activeLabel)?.color }}>
                          {activeLabel}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs max-md:text-white/80 md:text-[#667781]" dir={active.isGroup ? "rtl" : "ltr"}>
                      {active.isGroup ? active.participants.map((p) => p.name || p.email).join(", ") : active.subtitle}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  aria-label="עוד פעולות"
                  onClick={() => setHeaderMenu((v) => !v)}
                  className="relative md:hidden h-10 w-10 shrink-0 rounded-full flex items-center justify-center active:bg-white/15"
                >
                  <EllipsisVertical className="h-5 w-5 text-white" />
                </button>
                {headerMenu && (
                  <>
                    <button type="button" aria-label="סגירה" className="md:hidden fixed inset-0 z-40 cursor-default" onClick={() => setHeaderMenu(false)} />
                    <div className="md:hidden absolute left-2 top-12 z-50 w-56 rounded-xl bg-white shadow-xl border py-1 text-[15px]" style={{ borderColor: WA.line, color: WA.ink }}>
                      {(
                        [
                          { label: "פרטי השיחה וההזמנות", icon: UserRound, run: () => setShowCard(true) },
                          { label: "חיפוש בשיחה", icon: Search, run: () => (setChatSearchOpen(true), setChatSearch("")) },
                          { label: prefs.reminders?.[active.key] ? "שינוי התזכורת" : "תזכירי לי לחזור", icon: AlarmClock, run: () => setRemindOpen(true) },
                          { label: prefs.pinned.includes(active.key) ? "ביטול הצמדה" : "הצמדה למעלה", icon: Pin, run: () => togglePin(active.key) },
                          { label: activeLabel ? `תווית: ${activeLabel}` : "תווית לשיחה", icon: Tag, run: () => setLabelSheet(true) },
                          ...(active.threads.length ? [{ label: "סימון כלא נקרא", icon: MailOpen, run: markUnread }] : []),
                          isArchived(active)
                            ? { label: "החזרה מהארכיון", icon: ArchiveRestore, run: () => unarchive(active.key) }
                            : { label: "העברה לארכיון", icon: Archive, run: archiveActive },
                          ...(active.threads.length
                            ? [{ label: "פתיחה ב-Gmail", icon: ExternalLink, run: () => window.open(`https://mail.google.com/mail/u/0/#all/${active.threads[0]?.threadId}`, "_blank") }]
                            : []),
                        ] as Array<{ label: string; icon: any; run: () => void }>
                      ).map((it) => (
                        <button
                          key={it.label}
                          type="button"
                          onClick={() => {
                            setHeaderMenu(false);
                            it.run();
                          }}
                          className="w-full h-12 px-4 flex items-center gap-3 text-right active:bg-[#f0f2f5]"
                        >
                          <it.icon className="h-5 w-5 shrink-0" style={{ color: WA.muted }} /> {it.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <span className="hidden md:contents">
                <IconBtn
                  label="חיפוש בשיחה"
                  onClick={() => {
                    setChatSearchOpen((v) => !v);
                    setChatSearch("");
                  }}
                >
                  <Search className="h-4 w-4" />
                </IconBtn>
                {active.threads.length > 0 && (
                  <span className="hidden sm:flex">
                    <IconBtn label="סימון כלא נקרא" onClick={markUnread}>
                      <MailOpen className="h-4 w-4" />
                    </IconBtn>
                  </span>
                )}
                <IconBtn label="תזכירי לי לחזור לשיחה" onClick={() => setRemindOpen(true)}>
                  <AlarmClock className="h-4 w-4" style={prefs.reminders?.[active.key] ? { color: "#d97706" } : undefined} />
                </IconBtn>
                <IconBtn label={prefs.pinned.includes(active.key) ? "ביטול הצמדה" : "הצמדה למעלה"} onClick={() => togglePin(active.key)}>
                  {prefs.pinned.includes(active.key) ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </IconBtn>
                <LabelMenu value={activeLabel} onChange={(l) => setLabel(active.key, l)} />
                {isArchived(active) ? (
                  <IconBtn label="החזרה מהארכיון" onClick={() => unarchive(active.key)}>
                    <ArchiveRestore className="h-4 w-4" />
                  </IconBtn>
                ) : (
                  <IconBtn label="העברה לארכיון" onClick={archiveActive}>
                    <Archive className="h-4 w-4" />
                  </IconBtn>
                )}
                {active.threads.length > 0 && <a
                  href={`https://mail.google.com/mail/u/0/#all/${active.threads[0]?.threadId}`}
                  target="_blank"
                  rel="noreferrer"
                  title="פתיחה ב-Gmail"
                  aria-label="פתיחה ב-Gmail"
                  className="hidden sm:flex h-9 w-9 rounded-full items-center justify-center hover:bg-black/5"
                  style={{ color: WA.muted }}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>}
                </span>
              </header>

              {prefs.reminders?.[active.key] && (
                <div className="shrink-0 px-3 py-1.5 border-b flex items-center gap-2 text-xs" style={{ background: "#fff7e6", borderColor: "#f3d9a4", color: "#8a5a00" }}>
                  <AlarmClock className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1">
                    {prefs.reminders[active.key] <= now ? "הגיע הזמן לחזור לשיחה הזאת" : "תזכורת לחזור לשיחה"} ·{" "}
                    {new Date(prefs.reminders[active.key]).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" })}
                  </span>
                  <button type="button" onClick={() => setReminder(active.key, null)} className="underline font-medium">
                    {prefs.reminders[active.key] <= now ? "טופל ✓" : "ביטול"}
                  </button>
                </div>
              )}

              {chatSearchOpen && (
                <div className="shrink-0 px-3 py-2 border-b flex items-center gap-2 bg-white" style={{ borderColor: WA.line }}>
                  <Search className="h-4 w-4 shrink-0" style={{ color: WA.muted }} />
                  <input
                    autoFocus
                    value={chatSearch}
                    onChange={(e) => setChatSearch(e.target.value)}
                    placeholder="חיפוש בתוך השיחה הזאת"
                    className="flex-1 min-w-0 h-9 rounded-lg px-3 text-base md:text-sm outline-none"
                    style={{ background: WA.panel, color: WA.ink }}
                  />
                  {cq && (
                    <span className="text-xs shrink-0" style={{ color: WA.muted }}>
                      {messages.length} מתוך {allMessages.length}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label="סגירת החיפוש"
                    onClick={() => {
                      setChatSearchOpen(false);
                      setChatSearch("");
                    }}
                    className="p-1"
                  >
                    <X className="h-4 w-4" style={{ color: WA.muted }} />
                  </button>
                </div>
              )}

              {showCard && (
                <div className="shrink-0 border-b px-4 py-3 space-y-2 bg-white" style={{ borderColor: WA.line }}>
                  {active.isGroup ? (
                    <>
                      <div className="text-xs font-semibold" style={{ color: WA.muted }}>
                        {active.participants.length} משתתפים בקבוצה
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {active.participants.map((p) => {
                          const c = contactByEmail.get(p.email);
                          return (
                            <span key={p.email} className="flex items-center gap-1.5 h-8 pr-1 pl-3 rounded-full text-xs" style={{ background: WA.panel, color: WA.ink }}>
                              <Avatar name={p.name || p.email} seed={`p:${p.email}`} size={24} />
                              <span className="max-w-[180px] truncate">{p.name || p.email}</span>
                              {c?.sources.filter((s) => s !== "מייל").slice(0, 1).map((s) => (
                                <span key={s} style={{ color: WA.muted }}>
                                  · {s}
                                </span>
                              ))}
                            </span>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <UserRound className="h-4 w-4" style={{ color: WA.muted }} />
                      <span className="text-sm font-medium" style={{ color: WA.ink }}>
                        {activeContact?.name || active.title}
                      </span>
                      {(activeContact?.sources ?? []).map((s) => (
                        <span key={s} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "#e7f8f2", color: WA.greenDark }}>
                          {s}
                        </span>
                      ))}
                      <span className="flex-1" />
                      <CardAction
                        label="העתקת מייל"
                        onClick={() => {
                          void navigator.clipboard.writeText(active.participants[0]?.email ?? "");
                          toast.success("המייל הועתק");
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </CardAction>
                      {active.threads.length > 0 && (
                        <span className="sm:hidden">
                          <CardAction label="סימון כלא נקרא" onClick={markUnread}>
                            <MailOpen className="h-3.5 w-3.5" />
                          </CardAction>
                        </span>
                      )}
                      {(activeContact?.phone || card.data?.phone || active.waPhone) && (() => {
                        const phone = activeContact?.phone || card.data?.phone || `+${active.waPhone}`;
                        return (
                        <>
                          <a href={`tel:${phone}`} className="h-8 px-3 rounded-full text-xs flex items-center gap-1" style={{ background: WA.panel, color: WA.ink }}>
                            <Phone className="h-3.5 w-3.5" /> <span dir="ltr">{phone}</span>
                          </a>
                          <a
                            href={`https://wa.me/${waPhone(phone)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="h-8 px-3 rounded-full text-xs flex items-center gap-1 text-white"
                            style={{ background: WA.unread }}
                          >
                            <MessageCircle className="h-3.5 w-3.5" /> וואטסאפ
                          </a>
                        </>
                        );
                      })()}
                    </div>
                  )}
                  <ChatNote
                    key={active.key}
                    value={prefs.notes?.[active.key] ?? ""}
                    onSave={(t) => {
                      const notes = { ...(prefs.notes ?? {}) };
                      if (t.trim()) notes[active.key] = t.trim();
                      else delete notes[active.key];
                      updatePrefs({ ...prefs, notes });
                    }}
                  />
                  <div className="pt-1">
                    <div className="text-xs font-semibold mb-1.5" style={{ color: WA.muted }}>
                      הזמנות ולקוחות באתר
                    </div>
                    {card.isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" style={{ color: WA.muted }} />
                    ) : (card.data?.orders ?? []).length === 0 ? (
                      <div className="text-xs" style={{ color: WA.muted }}>
                        לא נמצאו הזמנות לפי המייל / הטלפון
                      </div>
                    ) : (
                      <div className="max-h-44 overflow-y-auto space-y-1">
                        {(card.data?.orders ?? []).slice(0, 15).map((o: any) => (
                          <a
                            key={`${o.kind}-${o.id}`}
                            href={o.link}
                            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs hover:brightness-95"
                            style={{ background: WA.panel, color: WA.ink }}
                          >
                            <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px]" style={{ background: "#e7f8f2", color: WA.greenDark }}>
                              {o.kind}
                            </span>
                            <span className="truncate flex-1">{o.title}</span>
                            {o.date && <span className="shrink-0" dir="ltr">{String(o.date).split("-").reverse().join(".")}</span>}
                            {o.total != null && <span className="shrink-0">₪{Number(o.total).toLocaleString("he-IL")}</span>}
                            <span className="shrink-0" style={{ color: WA.muted }}>
                              {o.status}
                            </span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 md:px-[6%] py-3"
                style={{ background: WA.wallpaper, backgroundImage: "radial-gradient(rgba(0,0,0,0.035) 1px, transparent 1px)", backgroundSize: "18px 18px" }}
              >
                {thread.isLoading && (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin" style={{ color: WA.muted }} />
                  </div>
                )}
                {messages.map((m, idx) => {
                  const prev = messages[idx - 1];
                  const newDay = !prev || dayLabel(prev.at) !== dayLabel(m.at);
                  const newSubject = subjectChips.has(m.id);
                  const firstOfRun = newDay || newSubject || !prev || prev.fromMe !== m.fromMe || prev.fromEmail !== m.fromEmail || !!prev.wa !== !!m.wa;
                  const long = m.text.length > 1400 && !expanded[m.id];
                  const nameColor = NAME_COLORS[hashIdx(m.fromEmail || m.fromName, NAME_COLORS.length)];
                  return (
                    <div key={m.id}>
                      {newDay && (
                        <div className="flex justify-center my-3">
                          <span className="text-[12px] px-3 py-1 rounded-lg shadow-sm bg-white" style={{ color: WA.muted }}>
                            {dayLabel(m.at)}
                          </span>
                        </div>
                      )}
                      {newSubject && (
                        <div className="flex justify-center my-2">
                          <span className="text-[11px] px-3 py-1 rounded-lg max-w-[85%] truncate" style={{ background: "#fff8c5", color: "#54656f" }}>
                            ✉️ {m.subject}
                          </span>
                        </div>
                      )}
                      <div className={`flex ${m.fromMe ? "justify-start" : "justify-end"} ${firstOfRun ? "mt-2" : "mt-0.5"}`}>
                        <div
                          className="relative max-w-[88%] md:max-w-[70%] rounded-lg px-2.5 pt-1.5 pb-1 shadow-[0_1px_0.5px_rgba(11,20,26,.13)]"
                          style={{
                            background: m.fromMe ? WA.bubbleOut : WA.bubbleIn,
                            color: WA.ink,
                            opacity: m.pending ? 0.75 : 1,
                            borderTopRightRadius: firstOfRun && m.fromMe ? 0 : undefined,
                            borderTopLeftRadius: firstOfRun && !m.fromMe ? 0 : undefined,
                          }}
                        >
                          {firstOfRun && (
                            <span
                              aria-hidden
                              className="absolute top-0 w-2 h-3"
                              style={
                                m.fromMe
                                  ? { right: -8, background: WA.bubbleOut, clipPath: "polygon(0 0, 100% 0, 0 100%)" }
                                  : { left: -8, background: WA.bubbleIn, clipPath: "polygon(0 0, 100% 0, 100% 100%)" }
                              }
                            />
                          )}
                          {active.isGroup && !m.fromMe && firstOfRun && (
                            <div className="text-[13px] font-semibold mb-0.5" style={{ color: nameColor }}>
                              {m.fromName}
                            </div>
                          )}
                          {m.wa && firstOfRun && (
                            <div className="text-[11px] font-semibold mb-0.5 flex items-center gap-1" style={{ color: WA.unread }}>
                              <MessageCircle className="h-3 w-3" /> וואטסאפ
                            </div>
                          )}
                          {m.media && (
                            <div className="mb-1 max-w-full overflow-hidden rounded-md">
                              <WhatsAppMedia url={m.media.url} type={m.media.type as any} filename={m.media.filename} mime={m.media.mime} />
                            </div>
                          )}
                          {m.attachments.length > 0 && (
                            <div className="space-y-1 mb-1">
                              {m.attachments.map((a) => (
                                <button
                                  key={a.attachmentId}
                                  type="button"
                                  onClick={() => openAttachment(m, a)}
                                  className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-right transition hover:brightness-95"
                                  style={{ background: m.fromMe ? "#c6f0bd" : "#f5f6f6" }}
                                >
                                  <span className="h-9 w-9 shrink-0 rounded flex items-center justify-center bg-white">
                                    {a.mimeType.startsWith("image/") ? (
                                      <ImageIcon className="h-5 w-5" style={{ color: "#7c4dff" }} />
                                    ) : a.mimeType === "application/pdf" ? (
                                      <FileText className="h-5 w-5" style={{ color: "#e53935" }} />
                                    ) : (
                                      <Paperclip className="h-5 w-5" style={{ color: WA.muted }} />
                                    )}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13px]" dir="auto">
                                      {a.filename}
                                    </span>
                                    <span className="block text-[11px]" style={{ color: WA.muted }}>
                                      {fileSize(a.size)}
                                      {a.messageId ? " · לחצי לפתיחה" : ""}
                                    </span>
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                          {m.text && (
                            <div className="text-[14.2px] leading-[1.45] whitespace-pre-wrap break-words" dir="auto">
                              <Linkified text={long ? `${m.text.slice(0, 1400)}…` : m.text} />
                              {m.text.length > 1400 && (
                                <button
                                  type="button"
                                  onClick={() => setExpanded((x) => ({ ...x, [m.id]: !x[m.id] }))}
                                  className="block mt-1 text-[13px] font-medium"
                                  style={{ color: "#027eb5" }}
                                >
                                  {long ? "קראי עוד" : "הצג פחות"}
                                </button>
                              )}
                            </div>
                          )}
                          {m.waFailed && (
                            <div className="text-[11px] mt-1 rounded px-1.5 py-1" style={{ background: "#fdecea", color: "#b3261e" }}>
                              ⚠️ לא נשלחה: {m.waFailed}
                            </div>
                          )}
                          <div className="flex items-center justify-end gap-1 mt-0.5 text-[11px] leading-none" style={{ color: WA.muted }}>
                            {!m.pending && (
                              <span className="flex items-center gap-0.5 ml-auto opacity-60 hover:opacity-100">
                                <button
                                  type="button"
                                  title="תשובה להודעה הזאת"
                                  aria-label="תשובה להודעה הזאת"
                                  onClick={() => {
                                    setQuote(m);
                                    if (m.wa) setReplyVia("wa");
                                    else if (!active.waOnly) setReplyVia("mail");
                                    setTimeout(() => textRef.current?.focus(), 50);
                                  }}
                                  className="p-1 rounded hover:bg-black/5"
                                >
                                  <Reply className="h-3.5 w-3.5" />
                                </button>
                                {!m.wa && (
                                  <button type="button" title="העברה" aria-label="העברה" onClick={() => setForwardMsg(m)} className="p-1 rounded hover:bg-black/5">
                                    <Forward className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </span>
                            )}
                            {bubbleTime(m.at)}
                            {!m.wa && !m.pending && m.account && (
                              <button
                                type="button"
                                title="איך זה נראה במייל"
                                aria-label="איך זה נראה במייל"
                                onClick={() => setViewMsg(m)}
                                className="p-0.5 -my-0.5 rounded hover:bg-black/5"
                                style={{ color: WA.muted }}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {m.fromMe && (m.pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" style={{ color: "#53bdeb" }} aria-label="נשלח" />)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* prepared draft = a yellow "waiting" bubble at the end of the chat */}
                {topDraft && editingDraft?.draftId !== topDraft.draftId && (
                  <div className="flex justify-start mt-4">
                    <div className="w-full max-w-[88%] md:max-w-[70%] rounded-xl border shadow-sm overflow-hidden" style={{ background: WA.draft, borderColor: "#f1d98a" }}>
                      <div className="px-3 py-2 flex items-center justify-between gap-2 border-b" style={{ borderColor: "#f1d98a" }}>
                        <span className="text-[13px] font-semibold" style={{ color: WA.draftInk }}>
                          ✍️ טיוטה מוכנה {drafts.length > 1 ? `(${drafts.length})` : ""}
                        </span>
                        <span className="text-[11px]" style={{ color: WA.draftInk }}>
                          {listTime(topDraft.at)}
                        </span>
                      </div>
                      <div className="px-3 py-2 text-[14px] leading-[1.5] whitespace-pre-wrap break-words" style={{ color: WA.ink }} dir="auto">
                        <Linkified text={draftOpen || topDraft.text.length <= 500 ? topDraft.text : `${topDraft.text.slice(0, 500)}…`} />
                        {topDraft.text.length > 500 && (
                          <button type="button" onClick={() => setDraftOpen((v) => !v)} className="block mt-1 text-[13px] font-medium" style={{ color: "#027eb5" }}>
                            {draftOpen ? "הצג פחות" : "קראי את כל הטיוטה"}
                          </button>
                        )}
                      </div>
                      <div className="px-2 pb-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={busyDraft === topDraft.draftId}
                          onClick={() => sendDraftAsIs(topDraft)}
                          className="h-9 px-4 rounded-full text-sm font-medium text-white flex items-center gap-1.5 disabled:opacity-50"
                          style={{ background: WA.green }}
                        >
                          {busyDraft === topDraft.draftId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 -scale-x-100" />}
                          שליחה כמו שהיא
                        </button>
                        <DraftBtn onClick={() => editDraft(topDraft)}>
                          <PenLine className="h-4 w-4" /> עריכה
                        </DraftBtn>
                        {topDraft.html && (
                          <DraftBtn onClick={() => setPreviewHtml(topDraft.html)}>
                            <Eye className="h-4 w-4" /> איך זה ייראה
                          </DraftBtn>
                        )}
                        <DraftBtn onClick={() => removeDraft(topDraft)} danger>
                          <Trash2 className="h-4 w-4" /> מחיקה
                        </DraftBtn>
                      </div>
                    </div>
                  </div>
                )}
                {scheduled
                  .filter((x) => x.chatKey === active.key)
                  .map((x) => (
                    <div key={x.id} className="flex justify-start mt-3">
                      <div className="max-w-[88%] md:max-w-[70%] rounded-lg px-3 py-2 border border-dashed" style={{ background: "#f0f7ff", borderColor: "#9cc3ef", color: WA.ink }}>
                        <div className="text-[12px] font-semibold flex items-center gap-1 mb-1" style={{ color: x.error ? "#b3261e" : "#1e6fbf" }}>
                          <Clock className="h-3.5 w-3.5" />
                          {x.error ? `התזמון נכשל: ${x.error}` : `מתוזמן ל-${new Date(x.at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" })}`}
                        </div>
                        <div className="text-[14px] whitespace-pre-wrap break-words" dir="auto">
                          {x.text.length > 400 ? `${x.text.slice(0, 400)}…` : x.text}
                        </div>
                        <button type="button" onClick={() => cancelScheduled(x.id)} className="mt-1 text-[12px] underline" style={{ color: "#b3261e" }}>
                          {x.error ? "הסרה" : "ביטול התזמון"}
                        </button>
                      </div>
                    </div>
                  ))}
                {cq && messages.length === 0 && <EmptyNote text="אין הודעות שמתאימות לחיפוש" />}
                <div ref={bottomRef} />
              </div>

              <footer className="shrink-0 border-t" style={{ background: WA.panel, borderColor: WA.line }}>
                {quote && (
                  <div className="mx-3 mt-2 rounded-lg bg-white border-r-4 px-3 py-1.5 flex items-start gap-2" style={{ borderColor: WA.green }}>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold" style={{ color: WA.greenDark }}>
                        בתשובה ל{quote.fromMe ? "הודעה שלי" : `-${quote.fromName || quote.fromEmail}`}
                      </div>
                      <div className="text-[12px] truncate" style={{ color: WA.muted }} dir="auto">
                        {quote.text.slice(0, 160)}
                      </div>
                    </div>
                    <button type="button" aria-label="ביטול הציטוט" onClick={() => setQuote(null)} className="p-0.5">
                      <X className="h-4 w-4" style={{ color: WA.muted }} />
                    </button>
                  </div>
                )}
                {active.waPhone && !active.waOnly && (
                  <div className="px-3 pt-2 flex items-center gap-1.5 text-xs">
                    <span style={{ color: WA.muted }}>לענות ב:</span>
                    {(
                      [
                        { id: "mail", label: "✉️ מייל" },
                        { id: "wa", label: "🟢 וואטסאפ" },
                      ] as const
                    ).map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setReplyVia(o.id)}
                        className="h-7 px-3 rounded-full font-medium"
                        style={replyVia === o.id ? { background: WA.green, color: "#fff" } : { background: "#fff", color: WA.muted }}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
                {editingDraft && (
                  <div className="px-3 pt-2 flex items-center justify-between gap-2 text-xs" style={{ color: WA.draftInk }}>
                    <span className="flex items-center gap-1">
                      <PenLine className="h-3.5 w-3.5" /> עורכת את הטיוטה — אחרי השליחה הטיוטה הישנה תימחק
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDraft(null);
                        setDraft("");
                      }}
                      className="underline"
                    >
                      ביטול העריכה
                    </button>
                  </div>
                )}
                <div className={`${toolsOpen ? "flex" : "hidden"} md:flex gap-1.5 overflow-x-auto px-3 pt-2 items-center`}>
                  <button
                    type="button"
                    onClick={() => void suggestReply()}
                    disabled={suggesting}
                    title={draft.trim() ? "הצעת תשובה לפי מה שכתבת כהנחיה" : "הצעת תשובה מלאה לפי השיחה"}
                    className="shrink-0 h-7 px-3 rounded-full text-xs whitespace-nowrap flex items-center gap-1 font-medium disabled:opacity-60"
                    style={{ background: "#efe7ff", color: "#6b3fd4" }}
                  >
                    {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} הצעת תשובה
                  </button>
                  {quickReplies.map((r, i) => (
                    <button
                      key={`${i}-${r}`}
                      type="button"
                      title={r}
                      onClick={() => setDraft((d) => (d ? `${d}\n${r}` : r))}
                      className="shrink-0 h-7 px-3 rounded-full text-xs bg-white hover:bg-[#f5f6f6] whitespace-nowrap"
                      style={{ color: WA.greenDark }}
                    >
                      {quickLabel(r)}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-label="עריכת התשובות המהירות"
                    title="עריכת התשובות המהירות"
                    onClick={() => setQuickEditOpen(true)}
                    className="shrink-0 h-7 w-7 rounded-full bg-white flex items-center justify-center"
                    style={{ color: WA.muted }}
                  >
                    <PenLine className="h-3.5 w-3.5" />
                  </button>
                  {replyVia === "mail" && <button
                    type="button"
                    onClick={() => setDesigned((v) => !v)}
                    title="שליחה בעיצוב המותג (לוגו + חתימה)"
                    className="shrink-0 h-7 px-3 rounded-full text-xs whitespace-nowrap flex items-center gap-1 mr-auto"
                    style={designed ? { background: WA.green, color: "#fff" } : { background: "#fff", color: WA.muted }}
                  >
                    <Palette className="h-3.5 w-3.5" /> {designed ? "מעוצב ✓" : "מעוצב"}
                  </button>}
                  {replyVia === "mail" && (
                    <button
                      type="button"
                      onClick={() => setCcOpen((v) => !v)}
                      title="להוסיף אנשים בעותק (CC)"
                      className="shrink-0 h-7 px-3 rounded-full text-xs whitespace-nowrap font-medium"
                      style={ccOpen || ccList.length ? { background: WA.green, color: "#fff" } : { background: "#fff", color: WA.muted }}
                    >
                      עותק (CC){ccList.length ? ` · ${ccList.length}` : ""}
                    </button>
                  )}
                </div>
                {replyVia === "mail" && (ccOpen || ccList.length > 0) && (
                  <div className="px-3 pt-2">
                    <CcInput value={ccList} onChange={setCcList} contacts={allContacts} />
                  </div>
                )}
                {files.length > 0 && (
                  <div className="px-3 pt-2">
                    <FileChips files={files} onRemove={(i) => setFiles((f) => f.filter((_, j) => j !== i))} />
                  </div>
                )}
                <div className="flex items-end gap-2 p-2.5 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    aria-label={toolsOpen ? "הסתרת הכלים" : "כלים: הצעת תשובה, תשובות מהירות, עיצוב"}
                    onClick={() => setToolsOpen((v) => !v)}
                    className="md:hidden h-11 w-9 shrink-0 rounded-full flex items-center justify-center"
                    style={{ color: toolsOpen ? WA.green : WA.muted }}
                  >
                    {toolsOpen ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
                  </button>
                  <button
                    type="button"
                    aria-label="צירוף קובץ"
                    title="צירוף קובץ או תמונה"
                    onClick={() => fileInput.current?.click()}
                    className="h-11 w-11 shrink-0 rounded-full flex items-center justify-center hover:bg-black/5"
                    style={{ color: WA.muted }}
                  >
                    <Paperclip className="h-5 w-5" />
                  </button>
                  <textarea
                    ref={textRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      const isPhone = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !isPhone) {
                        e.preventDefault();
                        void sendReply();
                      }
                    }}
                    onPaste={(e) => {
                      if (e.clipboardData.files.length) {
                        e.preventDefault();
                        void addFiles(e.clipboardData.files);
                      }
                    }}
                    rows={1}
                    placeholder={replyVia === "wa" ? "הודעת וואטסאפ" : active.isGroup ? `תשובה לכל הקבוצה (${active.participants.length})` : "כתבי הודעה"}
                    className="flex-1 min-w-0 resize-none rounded-lg px-3 py-2.5 text-base md:text-[15px] outline-none bg-white max-h-48"
                    style={{ color: WA.ink, fieldSizing: "content" } as any}
                    dir="auto"
                  />
                  {replyVia === "mail" && (
                    <button
                      type="button"
                      aria-label="תזמון שליחה"
                      title="תזמון שליחה למועד אחר"
                      onClick={() => (draft.trim() ? setScheduleOpen(true) : toast.error("כתבי קודם את ההודעה"))}
                      className="h-11 w-9 shrink-0 rounded-full flex items-center justify-center hover:bg-black/5"
                      style={{ color: WA.muted }}
                    >
                      <Clock className="h-5 w-5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void sendReply()}
                    disabled={(!draft.trim() && !(replyVia === "wa" && files.length > 0)) || sending}
                    aria-label="שליחה"
                    className="h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-white transition disabled:opacity-40"
                    style={{ background: WA.green }}
                  >
                    {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 -scale-x-100" />}
                  </button>
                </div>
                <div className="hidden md:block px-3 pb-2 -mt-1 text-[11px]" style={{ color: WA.muted }}>
                  Enter לשליחה · Shift+Enter לשורה חדשה ·{" "}
                  {replyVia === "wa"
                    ? "נשלח בוואטסאפ של הסטודיו (מחוץ ל-24 שעות מההודעה האחרונה שלה צריך תבנית מאושרת)"
                    : `${active.channel === "studio" ? "נשלח בשם Sweetbaby" : "נשלח בשם מיכל סיבוני"}${designed ? " · עם לוגו וחתימה" : ""}`}
                </div>
              </footer>
            </>
          )}
        </section>
      </div>

      <Dialog open={!!previewHtml} onOpenChange={(o) => !o && setPreviewHtml(null)}>
        <DialogContent dir="rtl" className="max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle>כך הטיוטה תיראה אצל הלקוחה</DialogTitle>
          </DialogHeader>
          {previewHtml && <iframe title="תצוגה מקדימה" sandbox="" srcDoc={previewHtml} className="w-full h-[70vh] border-0 bg-white" />}
        </DialogContent>
      </Dialog>

      <ForwardDialog
        msg={forwardMsg}
        contacts={allContacts}
        onClose={() => setForwardMsg(null)}
        onSend={async (to, note) => {
          if (!forwardMsg) return;
          await doForward({ data: { account: forwardMsg.account, messageId: forwardMsg.id, to, note, channel: active?.channel ?? "personal" } });
          toast.success("המייל הועבר");
          setForwardMsg(null);
          await qc.invalidateQueries({ queryKey: ["mail-chats"] });
        }}
      />

      <ScheduleDialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} onPick={(at) => void scheduleReply(at)} />
      <ScheduleDialog
        open={remindOpen}
        onClose={() => setRemindOpen(false)}
        title="מתי להזכיר לך לחזור לשיחה?"
        note="בזמן הזה השיחה תקפוץ לראש הרשימה עם ⏰, ותקבלי התראה כשהמסך פתוח. שום דבר לא נשלח ללקוחה."
        action="הזכירי לי"
        onPick={(at) => {
          if (active) setReminder(active.key, at);
          setRemindOpen(false);
          toast.success(`אזכיר לך ב-${new Date(at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" })}`);
        }}
      />

      <Dialog open={quickEditOpen} onOpenChange={setQuickEditOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>התשובות המהירות שלך</DialogTitle>
          </DialogHeader>
          <QuickRepliesEditor
            initial={quickReplies}
            onSave={(list) => {
              updatePrefs({ ...prefs, quickReplies: list });
              setQuickEditOpen(false);
              toast.success("נשמר");
            }}
            onReset={() => {
              updatePrefs({ ...prefs, quickReplies: [] });
              setQuickEditOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={scheduledOpen} onOpenChange={setScheduledOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>מיילים מתוזמנים</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {scheduled.length === 0 && <EmptyNote text="אין מיילים מתוזמנים" />}
            {scheduled.map((x) => (
              <div key={x.id} className="rounded-xl border p-3 text-sm space-y-1" style={{ borderColor: x.error ? "#f3b3ad" : WA.line }}>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="font-semibold truncate text-right"
                    onClick={() => {
                      if (x.chatKey) {
                        setScheduledOpen(false);
                        openChat(x.chatKey);
                      }
                    }}
                  >
                    {x.label}
                  </button>
                  <span className="text-xs shrink-0" style={{ color: x.error ? "#b3261e" : WA.muted }}>
                    {x.error ? "נכשל" : new Date(x.at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" })}
                  </span>
                </div>
                <div className="text-xs line-clamp-2" style={{ color: WA.muted }}>
                  {x.error ? `${x.error} · ` : ""}
                  {x.text}
                </div>
                <button type="button" onClick={() => cancelScheduled(x.id)} className="text-xs underline" style={{ color: "#b3261e" }}>
                  {x.error ? "הסרה" : "ביטול התזמון"}
                </button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <MailViewDialog msg={viewMsg} onClose={() => setViewMsg(null)} />

      {labelSheet && active && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center" dir="rtl">
          <button type="button" aria-label="סגירה" className="absolute inset-0 bg-black/40" onClick={() => setLabelSheet(false)} />
          <div className="relative w-full md:max-w-sm bg-white rounded-t-2xl md:rounded-2xl p-3 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-1">
            <div className="mx-auto h-1 w-10 rounded-full bg-black/15 mb-2 md:hidden" />
            <div className="px-2 pb-1 text-sm font-semibold" style={{ color: WA.ink }}>
              תווית לשיחה עם {active.title}
            </div>
            {LABELS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  setLabel(active.key, activeLabel === l.id ? null : l.id);
                  setLabelSheet(false);
                }}
                className="w-full h-12 px-3 rounded-xl flex items-center justify-between text-[15px] active:bg-[#f0f2f5]"
              >
                <span className="flex items-center gap-3">
                  <span className="h-3.5 w-3.5 rounded-full" style={{ background: l.color }} />
                  {l.id}
                </span>
                {activeLabel === l.id && <Check className="h-5 w-5" style={{ color: WA.green }} />}
              </button>
            ))}
            {activeLabel && (
              <button
                type="button"
                onClick={() => {
                  setLabel(active.key, null);
                  setLabelSheet(false);
                }}
                className="w-full h-12 px-3 rounded-xl text-right text-[15px]"
                style={{ color: "#b3261e" }}
              >
                הסרת התווית
              </button>
            )}
          </div>
        </div>
      )}

      <ComposeDialog
        open={composeOpen}
        onOpenChange={(o) => {
          setComposeOpen(o);
          if (!o) setComposeTo([]);
        }}
        initialTo={composeTo}
        contacts={allContacts}
        onSchedule={async (payload, at) => {
          await doSchedule({
            data: {
              ...payload,
              at,
              kind: "new",
              label: (payload.to.length > 1 ? `קבוצה: ${payload.subject}` : payload.to[0]).slice(0, 200),
            },
          });
          toast.success(`המייל יישלח ב-${new Date(at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" })}`);
          setSelectMode(false);
          setSelected({});
          await qc.invalidateQueries({ queryKey: ["mail-scheduled"] });
        }}
        onSend={async (payload) => {
          await doStart({ data: payload });
          toast.success(payload.to.length > 1 ? "הקבוצה נפתחה והמייל נשלח" : "המייל נשלח");
          setSelectMode(false);
          setSelected({});
          await qc.invalidateQueries({ queryKey: ["mail-chats"] });
        }}
      />
    </div>
  );
}

// ── small pieces ──────────────────────────────────────────────────────────────
function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className="h-9 w-8 md:w-9 shrink-0 rounded-full flex items-center justify-center hover:bg-black/5" style={{ color: WA.muted }}>
      {children}
    </button>
  );
}

function CardAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className="h-8 px-3 rounded-full text-xs flex items-center gap-1" style={{ background: WA.panel, color: WA.ink }}>
      {children} {label}
    </button>
  );
}

function DraftBtn({ onClick, children, danger }: { onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-9 px-3 rounded-full text-sm flex items-center gap-1.5 bg-white border hover:brightness-95"
      style={{ borderColor: "#f1d98a", color: danger ? "#b91c1c" : WA.ink }}
    >
      {children}
    </button>
  );
}

/** One mail exactly as it arrived / went out — the design, the signature, the price lists — in a safe frame. */
function MailViewDialog({ msg, onClose }: { msg: ChatMsg | null; onClose: () => void }) {
  const fetchView = useServerFn(getMailMessageView);
  const q = useQuery({
    queryKey: ["mail-view", msg?.account, msg?.id],
    queryFn: () => fetchView({ data: { account: msg!.account, messageId: msg!.id } }),
    enabled: !!msg,
    staleTime: Infinity,
  });
  const d = q.data;
  return (
    <Dialog open={!!msg} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-3xl w-[calc(100vw-1rem)] p-0 overflow-hidden gap-0">
        <div className="px-4 py-3 border-b space-y-0.5 text-[13px]" style={{ background: WA.panel, borderColor: WA.line, color: WA.ink }}>
          <div className="font-semibold text-[15px] pl-8" dir="auto">
            {d?.subject || msg?.subject || "(ללא נושא)"}
          </div>
          {d && (
            <>
              <div className="truncate" style={{ color: WA.muted }} dir="auto">
                מאת: {d.from}
              </div>
              <div className="truncate" style={{ color: WA.muted }} dir="auto">
                אל: {d.to}
                {d.cc ? ` · עותק: ${d.cc}` : ""}
              </div>
              <div style={{ color: WA.muted }}>{msg ? new Date(msg.at).toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jerusalem" }) : ""}</div>
            </>
          )}
        </div>
        {q.isLoading && (
          <div className="h-[60vh] flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: WA.muted }} />
          </div>
        )}
        {q.isError && <div className="p-6 text-sm text-center" style={{ color: "#b3261e" }}>לא הצלחתי לטעון את המייל</div>}
        {d &&
          (d.html ? (
            <iframe title="המייל כפי שנראה" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={`<base target="_blank">${d.html}`} className="w-full h-[70vh] border-0 bg-white" />
          ) : (
            <div className="h-[70vh] overflow-y-auto p-4 text-[14px] leading-relaxed whitespace-pre-wrap break-words bg-white" dir="auto" style={{ color: WA.ink }}>
              {d.text}
            </div>
          ))}
        {msg && (
          <div className="px-4 py-2 border-t flex justify-end" style={{ borderColor: WA.line }}>
            <a href={`https://mail.google.com/mail/u/0/#all/${msg.threadId}`} target="_blank" rel="noreferrer" className="text-xs flex items-center gap-1" style={{ color: "#027eb5" }}>
              <ExternalLink className="h-3.5 w-3.5" /> פתיחה ב-Gmail
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** People in copy (CC): chips + an address box with suggestions from the address book. */
function CcInput({ value, onChange, contacts }: { value: string[]; onChange: (v: string[]) => void; contacts: Contact[] }) {
  const [text, setText] = useState("");
  const listId = useMemo(() => `cc-${Math.random().toString(36).slice(2)}`, []);
  function add(raw: string) {
    const parts = raw
      .split(/[\s,;]+/)
      .map((x) => x.trim().toLowerCase())
      .filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
    if (!parts.length) return false;
    onChange([...new Set([...value, ...parts])].slice(0, 20));
    setText("");
    return true;
  }
  return (
    <div className="rounded-lg bg-white px-2 py-1.5 flex flex-wrap items-center gap-1.5 text-[13px]">
      <span className="text-xs font-medium" style={{ color: WA.muted }}>
        עותק:
      </span>
      {value.map((e) => (
        <span key={e} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: "#e7f6ee", color: WA.greenDark }} dir="ltr">
          {e}
          <button type="button" aria-label={`הסרת ${e}`} onClick={() => onChange(value.filter((x) => x !== e))}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        list={listId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === "," || e.key === " ") && text.trim()) {
            e.preventDefault();
            if (!add(text)) toast.error("כתובת מייל לא תקינה");
          }
        }}
        onBlur={() => text.trim() && add(text)}
        placeholder="כתובת מייל ו-Enter"
        className="flex-1 min-w-[160px] outline-none bg-transparent text-base md:text-[13px]"
        dir="ltr"
      />
      <datalist id={listId}>
        {contacts.slice(0, 400).map((c) => (
          <option key={c.email} value={c.email}>
            {c.name}
          </option>
        ))}
      </datalist>
    </div>
  );
}

function LabelMenu({ value, onChange }: { value?: string; onChange: (l: string | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <IconBtn label="תווית לשיחה" onClick={() => setOpen((v) => !v)}>
        <Tag className="h-4 w-4" />
      </IconBtn>
      {open && (
        <>
          <button type="button" aria-label="סגירה" className="fixed inset-0 z-20 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-10 z-30 w-40 rounded-xl border bg-white shadow-lg p-1" style={{ borderColor: WA.line }}>
            {LABELS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  onChange(value === l.id ? null : l.id);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-sm hover:bg-[#f5f6f6]"
              >
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
                  {l.id}
                </span>
                {value === l.id && <Check className="h-4 w-4" style={{ color: WA.green }} />}
              </button>
            ))}
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="w-full px-2.5 py-2 rounded-lg text-sm text-right hover:bg-[#f5f6f6]"
                style={{ color: WA.muted }}
              >
                הסרת תווית
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── contacts list (grouped by first letter, like a phone book) ───────────────
function ContactList({
  contacts,
  selectMode,
  selected,
  onToggle,
  onOpen,
}: {
  contacts: Contact[];
  selectMode: boolean;
  selected: Record<string, Contact>;
  onToggle: (c: Contact) => void;
  onOpen: (c: Contact) => void;
}) {
  const [limit, setLimit] = useState(150);
  let lastLetter = "";
  return (
    <div>
      {contacts.slice(0, limit).map((c) => {
        const label = c.name || c.email;
        const letter = (label[0] ?? "#").toUpperCase();
        const header = letter !== lastLetter;
        lastLetter = letter;
        const isSel = !!selected[c.email];
        return (
          <div key={c.email}>
            {header && (
              <div className="px-4 pt-3 pb-1 text-xs font-semibold" style={{ color: WA.green }}>
                {letter}
              </div>
            )}
            <button type="button" onClick={() => (selectMode ? onToggle(c) : onOpen(c))} className="w-full text-right flex items-center gap-3 px-3 py-2 hover:bg-[#f5f6f6]">
              <div className="relative">
                <Avatar name={label} seed={`p:${c.email}`} size={40} />
                {selectMode && (
                  <span
                    className="absolute -bottom-0.5 -left-0.5 h-5 w-5 rounded-full border-2 border-white flex items-center justify-center"
                    style={{ background: isSel ? WA.green : "#d1d7db" }}
                  >
                    {isSel && <Check className="h-3 w-3 text-white" />}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px]" style={{ color: WA.ink }}>
                  {c.name || c.email.split("@")[0]}
                </div>
                <div className="flex items-center gap-1.5 text-xs" style={{ color: WA.muted }}>
                  <span className="truncate" dir="ltr">
                    {c.email}
                  </span>
                  {c.phone && (
                    <span className="shrink-0" dir="ltr">
                      · {c.phone}
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 flex flex-wrap gap-1 justify-end max-w-[40%]">
                {c.sources.slice(0, 3).map((s) => (
                  <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "#eef1f3", color: WA.muted }}>
                    {s}
                  </span>
                ))}
              </div>
            </button>
          </div>
        );
      })}
      {contacts.length > limit && (
        <button type="button" onClick={() => setLimit((l) => l + 150)} className="w-full py-3 text-sm font-medium" style={{ color: WA.greenDark }}>
          הצגת עוד ({contacts.length - limit})
        </button>
      )}
    </div>
  );
}

// ── compose: new chat (one address) or new group (several) ───────────────────
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ComposeDialog({
  open,
  onOpenChange,
  initialTo,
  contacts,
  onSend,
  onSchedule,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialTo: Contact[];
  contacts: Contact[];
  onSchedule: (p: ComposePayload, at: number) => Promise<void>;
  onSend: (p: {
    to: string[];
    subject: string;
    text: string;
    channel: "studio" | "personal";
    designed: boolean;
    attachments: Array<{ filename: string; contentType: string; base64Data: string }>;
    cc?: string[];
  }) => Promise<void>;
}) {
  const [to, setTo] = useState<Contact[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [channel, setChannel] = useState<"studio" | "personal">("studio");
  const [designed, setDesigned] = useState(true);
  const [files, setFiles] = useState<OutFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [pickTime, setPickTime] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPickTime(false);
      setTo(initialTo);
      setQuery("");
      setSubject("");
      setText("");
      setFiles([]);
      setCc([]);
      setBusy(false);
    }
  }, [open, initialTo]);

  const suggestions = useMemo(() => {
    const qq = query.trim().toLowerCase();
    if (!qq) return [];
    return contacts.filter((c) => !to.some((t) => t.email === c.email) && `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(qq)).slice(0, 6);
  }, [query, contacts, to]);

  function addFromQuery(): Contact[] | null {
    const e = query.trim().replace(/[,;]$/, "").toLowerCase();
    if (!EMAIL_OK.test(e)) return null;
    const next = to.some((t) => t.email === e) ? to : [...to, { email: e, name: "", phone: "", sources: [], lastAt: 0 }];
    setTo(next);
    setQuery("");
    return next;
  }

  const isGroup = to.length > 1;

  function payload(): ComposePayload | null {
    const recipients = query.trim() ? (addFromQuery() ?? to) : to;
    if (!recipients.length) return toast.error("הוסיפי לפחות נמען אחד"), null;
    if (!subject.trim()) return toast.error("חסר נושא"), null;
    if (!text.trim()) return toast.error("חסר תוכן"), null;
    return {
      to: recipients.map((t) => t.email),
      subject: subject.trim(),
      text: text.trim(),
      channel,
      designed,
      attachments: files.map(({ filename, contentType, base64Data }) => ({ filename, contentType, base64Data })),
      ...(cc.length ? { cc } : {}),
    };
  }

  async function schedule(at: number) {
    const p = payload();
    setPickTime(false);
    if (!p) return;
    setBusy(true);
    try {
      await onSchedule(p, at);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "התזמון נכשל");
      setBusy(false);
    }
  }

  async function submit() {
    const p = payload();
    if (!p) return;
    setBusy(true);
    try {
      await onSend(p);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "השליחה נכשלה");
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isGroup ? <Users className="h-5 w-5" style={{ color: WA.green }} /> : <Mail className="h-5 w-5" style={{ color: WA.green }} />}
            {isGroup ? `קבוצה חדשה (${to.length})` : "מייל חדש"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium" style={{ color: WA.muted }}>
              אל
            </label>
            <div className="relative mt-1">
              <div className="min-h-11 rounded-xl border border-input bg-background px-2 py-1.5 flex flex-wrap gap-1.5 items-center">
                {to.map((t) => (
                  <span key={t.email} className="flex items-center gap-1 h-7 pr-1 pl-2 rounded-full text-xs" style={{ background: "#e7f8f2", color: WA.greenDark }}>
                    <Avatar name={t.name || t.email} seed={`p:${t.email}`} size={20} />
                    <span className="max-w-[160px] truncate">{t.name || t.email}</span>
                    <button type="button" aria-label="הסרה" onClick={() => setTo((x) => x.filter((y) => y.email !== t.email))}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === "," || e.key === "Tab") && query.trim()) {
                      if (suggestions[0] && !EMAIL_OK.test(query.trim())) {
                        e.preventDefault();
                        setTo((x) => [...x, suggestions[0]]);
                        setQuery("");
                      } else if (addFromQuery()) e.preventDefault();
                    }
                    if (e.key === "Backspace" && !query && to.length) setTo((x) => x.slice(0, -1));
                  }}
                  placeholder={to.length ? "הוספת עוד…" : "שם או כתובת מייל"}
                  className="flex-1 min-w-[140px] h-7 bg-transparent outline-none text-base md:text-sm"
                />
              </div>
              {suggestions.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-xl border bg-white shadow-lg overflow-hidden">
                  {suggestions.map((c) => (
                    <button
                      key={c.email}
                      type="button"
                      onClick={() => {
                        setTo((x) => [...x, c]);
                        setQuery("");
                      }}
                      className="w-full text-right flex items-center gap-2 px-3 py-2 hover:bg-[#f5f6f6]"
                    >
                      <Avatar name={c.name || c.email} seed={`p:${c.email}`} size={30} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{c.name || c.email.split("@")[0]}</span>
                        <span className="block truncate text-xs" style={{ color: WA.muted }} dir="ltr">
                          {c.email}
                        </span>
                      </span>
                      <span className="text-[10px]" style={{ color: WA.muted }}>
                        {c.sources.slice(0, 2).join(" · ")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <CcInput value={cc} onChange={setCc} contacts={contacts} />

          <div>
            <label className="text-xs font-medium" style={{ color: WA.muted }}>
              {isGroup ? "שם הקבוצה (נושא המייל)" : "נושא"}
            </label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full h-11 rounded-xl border border-input bg-background px-3 text-base md:text-sm"
              placeholder={isGroup ? "למשל: מפגש צלמות — דצמבר" : "על מה המייל?"}
            />
          </div>

          <div>
            <label className="text-xs font-medium" style={{ color: WA.muted }}>
              הודעה
            </label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-base md:text-sm resize-y" dir="auto" />
          </div>

          <div className="space-y-2">
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={async (e) => {
                try {
                  const add = await readFiles(e.target.files);
                  if ([...files, ...add].reduce((n, f) => n + f.size, 0) > MAX_ATTACH) toast.error("עד 18MB של קבצים ביחד");
                  else setFiles((f) => [...f, ...add].slice(0, 10));
                } catch (err: any) {
                  toast.error(err?.message ?? "לא הצלחתי לצרף");
                }
                e.target.value = "";
              }}
            />
            <button type="button" onClick={() => fileInput.current?.click()} className="h-8 px-3 rounded-full text-xs flex items-center gap-1" style={{ background: WA.panel, color: WA.ink }}>
              <Paperclip className="h-3.5 w-3.5" /> צירוף קבצים
            </button>
            <FileChips files={files} onRemove={(i) => setFiles((f) => f.filter((_, j) => j !== i))} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full p-0.5" style={{ background: WA.panel }}>
              {(
                [
                  { id: "studio", label: "בשם Sweetbaby" },
                  { id: "personal", label: "בשם מיכל" },
                ] as const
              ).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setChannel(o.id)}
                  className="h-8 px-3 rounded-full text-xs font-medium"
                  style={channel === o.id ? { background: "#fff", color: WA.greenDark, boxShadow: "0 1px 2px rgba(0,0,0,.08)" } : { color: WA.muted }}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setDesigned((v) => !v)}
              className="h-8 px-3 rounded-full text-xs font-medium flex items-center gap-1"
              style={designed ? { background: WA.green, color: "#fff" } : { background: WA.panel, color: WA.muted }}
            >
              <Palette className="h-3.5 w-3.5" /> {designed ? "מעוצב עם לוגו וחתימה ✓" : "טקסט פשוט"}
            </button>
          </div>
          {isGroup && (
            <p className="text-xs leading-relaxed" style={{ color: WA.muted }}>
              המייל יישלח לכל {to.length} הנמענים יחד, וכל תשובה של מישהו מהם תופיע בקבוצה הזאת.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button variant="outline" className="rounded-full gap-2" disabled={busy} onClick={() => setPickTime(true)}>
            <Clock className="h-4 w-4" /> שליחה מתוזמנת
          </Button>
          <Button onClick={submit} disabled={busy} className="rounded-full gap-2 text-white" style={{ background: WA.green }}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 -scale-x-100" />}
            {isGroup ? "פתיחת קבוצה ושליחה" : "שליחה"}
          </Button>
        </DialogFooter>
        <ScheduleDialog open={pickTime} onClose={() => setPickTime(false)} onPick={(at) => void schedule(at)} />
      </DialogContent>
    </Dialog>
  );
}

type ComposePayload = {
  to: string[];
  subject: string;
  text: string;
  channel: "studio" | "personal";
  designed: boolean;
  attachments: Array<{ filename: string; contentType: string; base64Data: string }>;
  cc?: string[];
};

function ChatNote({ value, onSave }: { value: string; onSave: (t: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <div className="pt-1">
      <div className="text-xs font-semibold mb-1" style={{ color: WA.muted }}>
        📝 פתק פנימי (רק את רואה)
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== value && onSave(text)}
        rows={2}
        maxLength={2000}
        placeholder="למשל: מעדיפה בוקר, אחות של לקוחה קודמת, לשלוח מחירון אחרי החגים…"
        className="w-full rounded-lg border px-2.5 py-1.5 text-base md:text-sm outline-none resize-y"
        style={{ borderColor: WA.line, background: "#fffdf5" }}
        dir="auto"
      />
    </div>
  );
}

function ForwardDialog({
  msg,
  contacts,
  onClose,
  onSend,
}: {
  msg: ChatMsg | null;
  contacts: Contact[];
  onClose: () => void;
  onSend: (to: string[], note: string) => Promise<void>;
}) {
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setTo("");
    setNote("");
  }, [msg?.id]);
  const list = to
    .split(/[\s,;]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const bad = list.filter((x) => !EMAIL_OK.test(x));
  return (
    <Dialog open={!!msg} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>העברת מייל</DialogTitle>
        </DialogHeader>
        {msg && (
          <div className="space-y-3">
            <div className="rounded-lg p-2.5 text-xs" style={{ background: WA.panel, color: WA.muted }}>
              <div className="font-semibold" style={{ color: WA.ink }}>
                {msg.subject || "(ללא נושא)"}
              </div>
              <div className="line-clamp-3 mt-0.5" dir="auto">
                {msg.text}
              </div>
              {msg.attachments.length > 0 && <div className="mt-1">📎 {msg.attachments.length} קבצים יועברו איתו</div>}
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: WA.muted }}>
                אל (כמה כתובות — מופרדות בפסיק)
              </label>
              <input
                list="fwd-contacts"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                dir="ltr"
                className="w-full h-10 rounded-lg border px-3 text-base md:text-sm outline-none mt-1"
                style={{ borderColor: WA.line }}
              />
              <datalist id="fwd-contacts">
                {contacts.slice(0, 400).map((c) => (
                  <option key={c.email} value={c.email}>
                    {c.name}
                  </option>
                ))}
              </datalist>
              {bad.length > 0 && <div className="text-xs mt-1 text-red-600">כתובת לא תקינה: {bad.join(", ")}</div>}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="הודעה קצרה מעל המייל (לא חובה)"
              rows={3}
              className="w-full rounded-lg border px-3 py-2 text-base md:text-sm outline-none"
              style={{ borderColor: WA.line }}
              dir="auto"
            />
          </div>
        )}
        <DialogFooter>
          <Button
            disabled={busy || !list.length || bad.length > 0}
            className="rounded-full gap-2 text-white"
            style={{ background: WA.green }}
            onClick={async () => {
              setBusy(true);
              try {
                await onSend([...new Set(list)], note);
              } catch (e: any) {
                toast.error(e?.message ?? "ההעברה נכשלה");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Forward className="h-4 w-4" />} העברה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Israel-time "YYYY-MM-DDTHH:mm" for a datetime-local field. */
function localInput(ms: number) {
  const d = new Date(ms);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

/** The same moment at a given Israel wall-clock time, n days from today. */
function israelAt(daysAhead: number, hh: number, mm: number) {
  const now = Date.now();
  const [date] = localInput(now + daysAhead * 86400000).split("T");
  const guess = Date.parse(`${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`);
  // shift by the Israel offset at that moment (2 or 3 hours)
  const off = Date.parse(`${localInput(guess)}:00Z`) - guess;
  return guess - off;
}

function ScheduleDialog({
  open,
  onClose,
  onPick,
  title = "מתי לשלוח?",
  note,
  action = "תזמון",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (at: number) => void;
  title?: string;
  note?: string;
  action?: string;
}) {
  const [value, setValue] = useState("");
  useEffect(() => {
    if (open) setValue(localInput(Date.now() + 3600000));
  }, [open]);
  const presets = [
    { label: "בעוד שעה", at: () => Date.now() + 3600000 },
    { label: "הערב 20:30", at: () => israelAt(0, 20, 30) },
    { label: "מחר 08:30", at: () => israelAt(1, 8, 30) },
    { label: "מחר 13:00", at: () => israelAt(1, 13, 0) },
  ].filter((p) => p.at() > Date.now() + 60000);
  const parsed = value ? Date.parse(`${value}:00Z`) - (Date.parse(`${localInput(Date.parse(`${value}:00Z`))}:00Z`) - Date.parse(`${value}:00Z`)) : NaN;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button key={p.label} type="button" onClick={() => onPick(p.at())} className="h-9 px-3 rounded-full text-sm" style={{ background: WA.panel, color: WA.ink }}>
              {p.label}
            </button>
          ))}
        </div>
        <label className="text-xs font-medium" style={{ color: WA.muted }}>
          או תאריך ושעה (שעון ישראל)
        </label>
        <input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} className="h-10 rounded-lg border px-3 text-base" style={{ borderColor: WA.line }} />
        <p className="text-[11px]" style={{ color: WA.muted }}>
          {note ?? "האתר בודק כל 5 דקות ושולח. בשבת ובערב שבת מ-14:00 המייל מחכה ויוצא במוצאי שבת. קבצים מצורפים נשמרים ונשלחים איתו."}
        </p>
        <DialogFooter>
          <Button disabled={!Number.isFinite(parsed)} className="rounded-full gap-2 text-white" style={{ background: WA.green }} onClick={() => onPick(parsed)}>
            <Clock className="h-4 w-4" /> {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuickRepliesEditor({ initial, onSave, onReset }: { initial: string[]; onSave: (l: string[]) => void; onReset: () => void }) {
  const [text, setText] = useState(initial.join("\n"));
  const list = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 30);
  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: WA.muted }}>
        כל שורה = תשובה מהירה אחת (עד 30). לחיצה עליה בשיחה מוסיפה אותה להודעה.
      </p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className="w-full rounded-lg border px-3 py-2 text-base md:text-sm outline-none" style={{ borderColor: WA.line }} dir="auto" />
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onReset} className="text-xs underline" style={{ color: WA.muted }}>
          חזרה לברירת המחדל
        </button>
        <Button disabled={!list.length || list.some((l) => l.length > 500)} className="rounded-full text-white" style={{ background: WA.green }} onClick={() => onSave(list)}>
          שמירה
        </Button>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="p-3 space-y-3">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 animate-pulse">
          <div className="h-11 w-11 rounded-full" style={{ background: WA.panel }} />
          <div className="flex-1 space-y-2">
            <div className="h-3 rounded w-2/3" style={{ background: WA.panel }} />
            <div className="h-3 rounded w-1/2" style={{ background: WA.panel }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <div className="p-8 text-center text-sm" style={{ color: WA.muted }}>
      {text}
    </div>
  );
}

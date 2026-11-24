import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  Bell,
  BookUser,
  Check,
  CheckCheck,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquarePlus,
  Palette,
  Paperclip,
  PenLine,
  Phone,
  Pin,
  PinOff,
  RefreshCw,
  Search,
  Send,
  Tag,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  archiveMailChat,
  deleteMailDraft,
  getMailAttachment,
  getMailChat,
  getMailChatPrefs,
  listMailChats,
  listMailContacts,
  replyMailChat,
  sendMailDraft,
  setMailChatPrefs,
  startMailChat,
  type MailChatPrefs,
} from "@/lib/admin-mailchat.functions";
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
};

type ChatDraft = { draftId: string; messageId: string; threadId: string; account: string; at: number; to: string[]; subject: string; text: string; html: string };

type Contact = { email: string; name: string; phone: string; sources: string[]; lastAt: number };

const QUICK_REPLIES = [
  { label: "תודה", text: "תודה רבה! 💗" },
  { label: "חוזרת אלייך", text: "קיבלתי, בודקת וחוזרת אלייך בהקדם." },
  { label: "התקשרי", text: "אשמח לדבר — אפשר להתקשר אליי ל-054-8529277." },
  { label: "הזמנה באתר", text: "אפשר להזמין ישירות באתר: https://sweetbabyphoto.shop" },
];

type Filter = "all" | "unread" | "drafts" | "studio" | "personal" | "groups" | "archived" | `label:${string}`;
const BASE_FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "הכל" },
  { id: "unread", label: "לא נקראו" },
  { id: "drafts", label: "✍️ טיוטות" },
  { id: "studio", label: "סטודיו" },
  { id: "personal", label: "אישי" },
  { id: "groups", label: "קבוצות" },
];

const EMPTY_PREFS: MailChatPrefs = { pinned: [], labels: {}, archived: {} };

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
  const fileInput = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Full-text search in Gmail (debounced) once she typed 3+ letters.
  useEffect(() => {
    const t = setTimeout(() => setServerSearch(search.trim().length >= 3 ? search.trim() : ""), 500);
    return () => clearTimeout(t);
  }, [search]);

  const chats = useQuery({
    queryKey: ["mail-chats", serverSearch],
    queryFn: () => fetchChats({ data: serverSearch ? { search: serverSearch } : {} }),
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

  const conversations: MailConversation[] = (chats.data?.conversations ?? []) as MailConversation[];
  const active = conversations.find((c) => c.key === activeKey) ?? null;
  const isArchived = (c: MailConversation) => (prefs.archived[c.key] ?? 0) >= c.lastDate;

  const thread = useQuery({
    queryKey: ["mail-chat", activeKey, active?.threads.map((t) => t.threadId).join(",")],
    queryFn: () => fetchChat({ data: { threads: active!.threads.slice(0, 15) } }),
    enabled: !!active,
    refetchInterval: active ? 15000 : false,
  });

  // Address book = the site's customers + everyone in the mail chats.
  const allContacts: Contact[] = useMemo(() => {
    const map = new Map<string, Contact>();
    for (const c of (contactsQ.data?.contacts ?? []) as Contact[]) map.set(c.email, { ...c, sources: [...c.sources] });
    for (const conv of conversations) {
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
  }, [contactsQ.data, conversations]);
  const contactByEmail = useMemo(() => new Map(allContacts.map((c) => [c.email, c])), [allContacts]);

  const q = search.trim().toLowerCase();
  const visibleChats = useMemo(() => {
    const list = conversations.filter((c) => {
      const archived = isArchived(c);
      if (filter === "archived") return archived;
      if (archived && !serverSearch) return false;
      if (filter === "unread" && !c.unread) return false;
      if (filter === "drafts" && !c.hasDraft) return false;
      if (filter === "studio" && c.channel !== "studio") return false;
      if (filter === "personal" && c.channel !== "personal") return false;
      if (filter === "groups" && !c.isGroup) return false;
      if (filter.startsWith("label:") && prefs.labels[c.key] !== filter.slice(6)) return false;
      if (!q || serverSearch) return true;
      return [c.title, c.subtitle, c.snippet, ...c.participants.map((p) => `${p.name} ${p.email}`)].join(" ").toLowerCase().includes(q);
    });
    const pinned = new Set(prefs.pinned);
    return list.sort((a, b) => Number(pinned.has(b.key)) - Number(pinned.has(a.key)) || b.lastDate - a.lastDate);
  }, [conversations, filter, q, serverSearch, prefs]);

  const visibleContacts = useMemo(() => allContacts.filter((c) => !q || `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(q)), [allContacts, q]);
  const inbox = conversations.filter((c) => !isArchived(c));
  const unreadCount = inbox.filter((c) => c.unread).length;
  const draftCount = inbox.filter((c) => c.hasDraft).length;
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

  const messages: ChatMsg[] = useMemo(() => {
    const real = (thread.data?.messages ?? []) as ChatMsg[];
    const mine = pending.filter((p) => active?.threads.some((t) => t.threadId === p.threadId));
    return [...real, ...mine].sort((a, b) => a.at - b.at);
  }, [thread.data, pending, active]);
  const drafts: ChatDraft[] = (thread.data?.drafts ?? []) as ChatDraft[];
  const topDraft = drafts[0] ?? null;

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, activeKey, showThread, topDraft?.draftId]);

  useEffect(() => {
    if (thread.data) setPending([]);
  }, [thread.data]);

  useEffect(() => {
    setDraft("");
    setFiles([]);
    setExpanded({});
    setEditingDraft(null);
    setDesigned(false);
    setShowCard(false);
    setDraftOpen(false);
  }, [activeKey]);

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
    Promise.all([qc.invalidateQueries({ queryKey: ["mail-chat"] }), qc.invalidateQueries({ queryKey: ["mail-chats"] })]);

  async function sendReply() {
    const text = draft.trim();
    if (!text || !active || sending) return;
    const last = [...messages].reverse().find((m) => !m.pending) ?? null;
    const target = editingDraft
      ? { threadId: editingDraft.threadId, account: editingDraft.account }
      : last
        ? { threadId: last.threadId, account: last.account }
        : active.threads[0];
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
      text,
      attachments: files.map((f, i) => ({ filename: f.filename, mimeType: f.contentType, size: f.size, attachmentId: `tmp${i}`, messageId: "" })),
      pending: true,
    };
    setPending((p) => [...p, temp]);
    const sentFiles = files;
    const replaced = editingDraft;
    setDraft("");
    setFiles([]);
    setEditingDraft(null);
    try {
      await doReply({
        data: {
          threadId: target.threadId,
          account: target.account,
          text,
          channel: active.channel,
          designed,
          attachments: sentFiles.map(({ filename, contentType, base64Data }) => ({ filename, contentType, base64Data })),
          replacesDraftId: replaced?.draftId,
        },
      });
      await refreshAll();
    } catch (e: any) {
      setPending((p) => p.filter((m) => m.id !== temp.id));
      setDraft(text);
      setFiles(sentFiles);
      setEditingDraft(replaced);
      toast.error(e?.message ?? "השליחה נכשלה");
    } finally {
      setSending(false);
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
    doArchive({ data: { threads: active.threads.slice(0, 30) } }).catch(() => undefined);
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
    ...BASE_FILTERS.map((f) => ({ ...f, count: f.id === "unread" ? unreadCount : f.id === "drafts" ? draftCount : undefined })),
    ...usedLabels.map((l) => ({ id: `label:${l.id}` as Filter, label: `🏷 ${l.id}` })),
    ...(archivedCount ? [{ id: "archived" as Filter, label: "ארכיון", count: archivedCount }] : []),
  ];

  // ── render ──
  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full flex items-center justify-center text-white" style={{ background: WA.green }}>
            <Mail className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-2xl text-primary">מיילים כמו וואטסאפ</h2>
            <p className="hidden sm:block text-sm text-muted-foreground">כל המיילים של הסטודיו והאישי במקום אחד, מסונכרנים אוטומטית מ-Gmail — עונים ישר מכאן</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {notifyState === "default" && (
            <Button
              variant="ghost"
              className="rounded-full gap-2"
              onClick={() => Notification.requestPermission().then((p) => p === "granted" && toast.success("התראות הופעלו"))}
            >
              <Bell className="h-4 w-4" /> הפעלת התראות
            </Button>
          )}
          <Button
            className="rounded-full gap-2 text-white"
            style={{ background: WA.green }}
            onClick={() => {
              setComposeTo([]);
              setComposeOpen(true);
            }}
          >
            <MessageSquarePlus className="h-4 w-4" /> מייל חדש
          </Button>
        </div>
      </div>

      {chats.data && !chats.data.connected && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">חשבון ה-Gmail לא מחובר לאתר, ולכן אין מה להציג. יש לחבר אותו בהגדרות הפרויקט.</div>
      )}

      <div
        className="grid md:grid-cols-[370px_1fr] rounded-2xl border overflow-hidden h-[calc(100dvh-12rem)] min-h-[480px] md:h-[calc(100dvh-14rem)] md:min-h-[620px] shadow-sm"
        style={{ borderColor: WA.line, background: "#fff" }}
      >
        {/* ── side panel ── */}
        <aside className={`min-h-0 flex-col border-l ${showThread ? "hidden md:flex" : "flex"}`} style={{ borderColor: WA.line }}>
          <div className="shrink-0 px-3 pt-3 pb-2 space-y-2 bg-white">
            <div className="flex rounded-full p-1" style={{ background: WA.panel }}>
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
                  className="h-8 px-3 rounded-full font-medium flex items-center gap-1"
                  style={selectMode ? { background: "#d9fdd3", color: WA.greenDark } : { background: WA.panel, color: WA.ink }}
                >
                  <Users className="h-3.5 w-3.5" /> {selectMode ? "ביטול בחירה" : "קבוצה חדשה"}
                </button>
              </div>
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

          <div className="shrink-0 px-3 py-2 text-[11px] flex items-center justify-between border-t" style={{ borderColor: WA.line, color: WA.muted }}>
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
              <header className="shrink-0 h-[60px] px-3 flex items-center gap-2 border-b" style={{ background: WA.panel, borderColor: WA.line }}>
                <button
                  type="button"
                  aria-label="חזרה לרשימה"
                  onClick={() => setShowThread(false)}
                  className="md:hidden h-10 w-10 -mr-1 rounded-full flex items-center justify-center hover:bg-black/5"
                >
                  <ArrowRight className="h-5 w-5" style={{ color: WA.ink }} />
                </button>
                <button type="button" onClick={() => setShowCard((v) => !v)} className="min-w-0 flex-1 flex items-center gap-3 text-right" aria-label="פרטי השיחה">
                  <Avatar name={active.title} seed={active.key} group={active.isGroup} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-[15px] flex items-center gap-1.5" style={{ color: WA.ink }}>
                      {active.title}
                      {activeLabel && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-normal" style={{ background: labelStyle(activeLabel)?.bg, color: labelStyle(activeLabel)?.color }}>
                          {activeLabel}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs" style={{ color: WA.muted }} dir={active.isGroup ? "rtl" : "ltr"}>
                      {active.isGroup ? active.participants.map((p) => p.name || p.email).join(", ") : active.subtitle}
                    </div>
                  </div>
                </button>
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
                <a
                  href={`https://mail.google.com/mail/u/0/#all/${active.threads[0]?.threadId}`}
                  target="_blank"
                  rel="noreferrer"
                  title="פתיחה ב-Gmail"
                  aria-label="פתיחה ב-Gmail"
                  className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-black/5"
                  style={{ color: WA.muted }}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </header>

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
                      {activeContact?.phone && (
                        <>
                          <a href={`tel:${activeContact.phone}`} className="h-8 px-3 rounded-full text-xs flex items-center gap-1" style={{ background: WA.panel, color: WA.ink }}>
                            <Phone className="h-3.5 w-3.5" /> <span dir="ltr">{activeContact.phone}</span>
                          </a>
                          <a
                            href={`https://wa.me/${waPhone(activeContact.phone)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="h-8 px-3 rounded-full text-xs flex items-center gap-1 text-white"
                            style={{ background: WA.unread }}
                          >
                            <MessageCircle className="h-3.5 w-3.5" /> וואטסאפ
                          </a>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div
                className="min-h-0 flex-1 overflow-y-auto px-3 md:px-[6%] py-3"
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
                  const newSubject = !prev || prev.subject !== m.subject;
                  const firstOfRun = newDay || newSubject || !prev || prev.fromMe !== m.fromMe || prev.fromEmail !== m.fromEmail;
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
                      {newSubject && m.subject && (
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
                          <div className="flex items-center justify-end gap-1 mt-0.5 text-[11px] leading-none" style={{ color: WA.muted }}>
                            {bubbleTime(m.at)}
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
                <div ref={bottomRef} />
              </div>

              <footer className="shrink-0 border-t" style={{ background: WA.panel, borderColor: WA.line }}>
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
                <div className="flex gap-1.5 overflow-x-auto px-3 pt-2 items-center">
                  {QUICK_REPLIES.map((r) => (
                    <button
                      key={r.label}
                      type="button"
                      onClick={() => setDraft((d) => (d ? `${d}\n${r.text}` : r.text))}
                      className="shrink-0 h-7 px-3 rounded-full text-xs bg-white hover:bg-[#f5f6f6] whitespace-nowrap"
                      style={{ color: WA.greenDark }}
                    >
                      {r.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDesigned((v) => !v)}
                    title="שליחה בעיצוב המותג (לוגו + חתימה)"
                    className="shrink-0 h-7 px-3 rounded-full text-xs whitespace-nowrap flex items-center gap-1 mr-auto"
                    style={designed ? { background: WA.green, color: "#fff" } : { background: "#fff", color: WA.muted }}
                  >
                    <Palette className="h-3.5 w-3.5" /> {designed ? "מעוצב ✓" : "מעוצב"}
                  </button>
                </div>
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
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
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
                    placeholder={active.isGroup ? `תשובה לכל הקבוצה (${active.participants.length})` : "כתבי הודעה"}
                    className="flex-1 min-w-0 resize-none rounded-lg px-3 py-2.5 text-base md:text-[15px] outline-none bg-white max-h-48"
                    style={{ color: WA.ink, fieldSizing: "content" } as any}
                    dir="auto"
                  />
                  <button
                    type="button"
                    onClick={() => void sendReply()}
                    disabled={!draft.trim() || sending}
                    aria-label="שליחה"
                    className="h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-white transition disabled:opacity-40"
                    style={{ background: WA.green }}
                  >
                    {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 -scale-x-100" />}
                  </button>
                </div>
                <div className="px-3 pb-2 -mt-1 text-[11px]" style={{ color: WA.muted }}>
                  Enter לשליחה · Shift+Enter לשורה חדשה · {active.channel === "studio" ? "נשלח בשם Sweetbaby" : "נשלח בשם מיכל סיבוני"}
                  {designed ? " · עם לוגו וחתימה" : ""}
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

      <ComposeDialog
        open={composeOpen}
        onOpenChange={(o) => {
          setComposeOpen(o);
          if (!o) setComposeTo([]);
        }}
        initialTo={composeTo}
        contacts={allContacts}
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
    <button type="button" title={label} aria-label={label} onClick={onClick} className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-black/5" style={{ color: WA.muted }}>
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
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialTo: Contact[];
  contacts: Contact[];
  onSend: (p: {
    to: string[];
    subject: string;
    text: string;
    channel: "studio" | "personal";
    designed: boolean;
    attachments: Array<{ filename: string; contentType: string; base64Data: string }>;
  }) => Promise<void>;
}) {
  const [to, setTo] = useState<Contact[]>([]);
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [channel, setChannel] = useState<"studio" | "personal">("studio");
  const [designed, setDesigned] = useState(true);
  const [files, setFiles] = useState<OutFile[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTo(initialTo);
      setQuery("");
      setSubject("");
      setText("");
      setFiles([]);
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

  async function submit() {
    const recipients = query.trim() ? (addFromQuery() ?? to) : to;
    if (!recipients.length) return toast.error("הוסיפי לפחות נמען אחד");
    if (!subject.trim()) return toast.error("חסר נושא");
    if (!text.trim()) return toast.error("חסר תוכן");
    setBusy(true);
    try {
      await onSend({
        to: recipients.map((t) => t.email),
        subject: subject.trim(),
        text: text.trim(),
        channel,
        designed,
        attachments: files.map(({ filename, contentType, base64Data }) => ({ filename, contentType, base64Data })),
      });
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
          <Button onClick={submit} disabled={busy} className="rounded-full gap-2 text-white" style={{ background: WA.green }}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 -scale-x-100" />}
            {isGroup ? "פתיחת קבוצה ושליחה" : "שליחה"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Send,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  CheckCheck,
  Check,
  AlertCircle,
  UserRound,
  Smile,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compress";
import {
  getWhatsAppConfigStatus,
  listWhatsAppConversations,
  listWhatsAppThread,
  sendWhatsAppMessageAdmin,
  sendWhatsAppMediaAdmin,
  sendWhatsAppTemplateAdmin,
  getWhatsAppBotHandoff,
  resumeWhatsAppBot,
} from "@/lib/admin-whatsapp.functions";
import { labelForBusinessPhone } from "@/lib/whatsapp-numbers";
import { explainWhatsAppFailure, incomingTypeLabel } from "@/lib/whatsapp-errors";
import { WHATSAPP_TEMPLATES, findWhatsAppTemplate, templateDefaultParams } from "@/lib/whatsapp-templates";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/whatsapp")({
  component: WhatsAppAdmin,
});

type Msg = {
  id: string;
  direction: "in" | "out";
  phone: string;
  contact_name: string | null;
  body: string | null;
  media_url: string | null;
  media_type: "image" | "video" | "document" | "audio" | null;
  status: string;
  error: string | null;
  created_at: string;
};

type OutgoingMediaType = "image" | "video" | "document" | "audio" | "sticker";

/** Uploads an outgoing file to the same "items" storage bucket the photo galleries already use and returns a signed URL — WhatsApp's Cloud API sends media by URL ("link" method). `asSticker` sends a .webp as a sticker (no compression, no caption). */
async function uploadMediaToStorage(
  file: File,
  asSticker = false,
): Promise<{ url: string; type: OutgoingMediaType }> {
  let type: OutgoingMediaType;
  if (asSticker) {
    if (file.type !== "image/webp") throw new Error("מדבקה חייבת להיות קובץ webp (עד 500KB, 512x512)");
    if (file.size > 500 * 1024) throw new Error("המדבקה גדולה מדי — עד 500KB");
    type = "sticker";
  } else if (file.type.startsWith("image/")) type = "image";
  else if (file.type.startsWith("video/")) type = "video";
  else if (file.type.startsWith("audio/")) {
    // WhatsApp accepts aac, mp3, m4a (mp4), amr and ogg/opus — not webm/wav.
    if (!/audio\/(aac|mpeg|mp4|amr|ogg)/.test(file.type)) {
      throw new Error("פורמט ההקלטה לא נתמך בוואטסאפ — צריך mp3, m4a, aac, amr או ogg");
    }
    type = "audio";
  } else if (file.type === "application/pdf") type = "document";
  else throw new Error("סוג קובץ לא נתמך (תמונה, סרטון, הקלטה, מדבקה או PDF)");

  const toUpload = type === "image" ? await compressImage(file) : file;
  const ext = toUpload.name.split(".").pop() ?? "bin";
  const path = `whatsapp-outgoing/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("items").upload(path, toUpload, { upsert: false });
  if (error) throw error;
  const { data, error: signErr } = await supabase.storage
    .from("items")
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (signErr || !data?.signedUrl) throw signErr ?? new Error("שגיאה ביצירת קישור לקובץ");
  return { url: data.signedUrl, type };
}

/**
 * Ready-made message templates — one click drops the text into the composer
 * for a final edit before sending. These work for replies inside Meta's 24h
 * window; initiating a first contact to someone who never wrote in requires
 * a Meta-approved template (created in Meta Business Suite, not from code),
 * and these texts double as the copy to submit there.
 */
const MESSAGE_TEMPLATES: { label: string; text: string }[] = [
  {
    label: "אישור הזמנה",
    text: "היי {שם} 💗\nמאשרת שההזמנה שלך נקלטה אצלנו בסטודיו!\n📅 תאריך: {תאריך}\n🕐 שעה: {שעה}\n\nאשלח לך לפני המועד את כל הפרטים להגעה. אם צריך לשנות משהו — אני כאן.\nמיכל | Sweetbaby 📸",
  },
  {
    label: "חזרה ללקוחה שהשאירה פרטים",
    text: "היי {שם} 💗\nקיבלתי את הפנייה שלך באתר ורציתי לחזור אליך אישית.\nאשמח לשמוע קצת יותר — איזה סוג צילום מעניין אותך ולאיזה תאריך חשבת? ככה אוכל לבדוק לך זמינות ולהתאים בדיוק את מה שמתאים לך.\nמיכל | Sweetbaby 📸",
  },
];

function StatusIcon({ status }: { status: string }) {
  if (status === "failed") return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
  if (status === "read") return <CheckCheck className="h-3.5 w-3.5 text-blue-500" />;
  if (status === "delivered") return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />;
  return <Check className="h-3.5 w-3.5 text-muted-foreground" />;
}

function WhatsAppAdmin() {
  const qc = useQueryClient();
  const fetchConfig = useServerFn(getWhatsAppConfigStatus);
  const fetchConvos = useServerFn(listWhatsAppConversations);
  const fetchThread = useServerFn(listWhatsAppThread);
  const doSendText = useServerFn(sendWhatsAppMessageAdmin);
  const doSendMedia = useServerFn(sendWhatsAppMediaAdmin);
  const fetchHandoff = useServerFn(getWhatsAppBotHandoff);
  const doResumeBot = useServerFn(resumeWhatsAppBot);
  const doSendTemplate = useServerFn(sendWhatsAppTemplateAdmin);

  const config = useQuery({ queryKey: ["whatsapp-config"], queryFn: () => fetchConfig({}) });
  const convos = useQuery({
    queryKey: ["whatsapp-conversations"],
    queryFn: () => fetchConvos({}),
    refetchInterval: 15000,
  });

  const [activePhone, setActivePhone] = useState<string | null>(null);
  useEffect(() => {
    if (!activePhone && convos.data?.length) setActivePhone((convos.data[0] as any).phone);
  }, [convos.data, activePhone]);

  const thread = useQuery({
    queryKey: ["whatsapp-thread", activePhone],
    queryFn: () => fetchThread({ data: { phone: activePhone! } }),
    enabled: !!activePhone,
    refetchInterval: activePhone ? 10000 : false,
  });

  const handoff = useQuery({
    queryKey: ["whatsapp-handoff", activePhone],
    queryFn: () => fetchHandoff({ data: { phone: activePhone! } }),
    enabled: !!activePhone,
    refetchInterval: activePhone ? 10000 : false,
  });
  const [resuming, setResuming] = useState(false);
  const resumeBot = async () => {
    if (!activePhone) return;
    setResuming(true);
    try {
      await doResumeBot({ data: { phone: activePhone } });
      qc.invalidateQueries({ queryKey: ["whatsapp-handoff", activePhone] });
    } catch (e: any) {
      toast.error(e?.message ?? "הפעלה מחדש נכשלה");
    } finally {
      setResuming(false);
    }
  };

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // "New conversation" via an approved template — the only legal way to
  // message a number that hasn't written in within WhatsApp's 24h window.
  const [newConvoOpen, setNewConvoOpen] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newTemplateId, setNewTemplateId] = useState(WHATSAPP_TEMPLATES[0]?.id ?? "");
  const [newParams, setNewParams] = useState<Record<string, string>>(() => templateDefaultParams(WHATSAPP_TEMPLATES[0]?.id ?? ""));
  const [sendingTemplate, setSendingTemplate] = useState(false);
  const newTemplate = findWhatsAppTemplate(newTemplateId);

  const sendNewConversation = async () => {
    if (!newPhone.trim() || !newTemplate) return;
    if (newTemplate.params.some((p) => !newParams[p.key]?.trim())) {
      toast.error("יש למלא את כל השדות");
      return;
    }
    setSendingTemplate(true);
    try {
      const { phone } = await doSendTemplate({
        data: {
          phone: newPhone.trim(),
          templateId: newTemplate.id,
          params: newTemplate.params.map((p) => newParams[p.key].trim()),
        },
      });
      toast.success("ההודעה נשלחה");
      setNewConvoOpen(false);
      setNewPhone("");
      setNewParams(templateDefaultParams(newTemplateId));
      qc.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
      setActivePhone(phone);
    } catch (e: any) {
      toast.error(e?.message ?? "השליחה נכשלה");
    } finally {
      setSendingTemplate(false);
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.data]);

  const refreshAfterSend = () => {
    qc.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
    qc.invalidateQueries({ queryKey: ["whatsapp-thread", activePhone] });
  };

  const sendText = async () => {
    if (!activePhone || !draft.trim()) return;
    setSending(true);
    try {
      await doSendText({ data: { phone: activePhone, body: draft.trim() } });
      setDraft("");
      refreshAfterSend();
    } catch (e: any) {
      toast.error(e?.message ?? "השליחה נכשלה");
    } finally {
      setSending(false);
    }
  };

  const stickerInputRef = useRef<HTMLInputElement>(null);

  const sendMedia = async (file: File, asSticker = false) => {
    if (!activePhone) return;
    setSending(true);
    try {
      const { url, type } = await uploadMediaToStorage(file, asSticker);
      await doSendMedia({
        data: {
          phone: activePhone,
          mediaUrl: url,
          mediaType: type,
          caption: draft.trim() || undefined,
        },
      });
      if (type !== "audio" && type !== "sticker") setDraft("");
      refreshAfterSend();
    } catch (e: any) {
      toast.error(e?.message ?? "שליחת הקובץ נכשלה");
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (stickerInputRef.current) stickerInputRef.current.value = "";
    }
  };

  // ---- Clarity helpers -------------------------------------------------
  const [filter, setFilter] = useState<"all" | "waiting" | "failed">("all");

  /** Newest failed outgoing message in the last 3 days (conversation list holds each number's newest message) — drives the red "sending is not working" banner. */
  const sendProblem = useMemo(() => {
    const rows = ((convos.data ?? []) as any[]).filter(
      (r) =>
        r.direction === "out" &&
        r.status === "failed" &&
        Date.now() - new Date(r.created_at).getTime() < 3 * 24 * 3600 * 1000,
    );
    if (!rows.length) return null;
    rows.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return { count: rows.length, reason: explainWhatsAppFailure(rows[0].error) };
  }, [convos.data]);

  const waitingCount = useMemo(
    () => ((convos.data ?? []) as any[]).filter((r) => r.direction === "in").length,
    [convos.data],
  );
  const failedCount = useMemo(
    () => ((convos.data ?? []) as any[]).filter((r) => r.direction === "out" && r.status === "failed").length,
    [convos.data],
  );
  const visibleConvos = useMemo(() => {
    const rows = (convos.data ?? []) as any[];
    if (filter === "waiting") return rows.filter((r) => r.direction === "in");
    if (filter === "failed") return rows.filter((r) => r.direction === "out" && r.status === "failed");
    return rows;
  }, [convos.data, filter]);

  /** WhatsApp only allows free-form messages within 24h of the customer's last message; after that only an approved template works. Evaluated once the thread has loaded. */
  const windowClosed = useMemo(() => {
    if (!activePhone || thread.data === undefined) return false;
    const incoming = ((thread.data ?? []) as unknown as Msg[]).filter((m) => m.direction === "in");
    if (!incoming.length) return true;
    const last = new Date(incoming[incoming.length - 1].created_at).getTime();
    return Date.now() - last > 24 * 3600 * 1000;
  }, [thread.data, activePhone]);

  const openTemplateForActive = () => {
    if (activePhone) setNewPhone(activePhone);
    setNewConvoOpen(true);
  };

  const activeName = useMemo(() => {
    const row = (convos.data ?? []).find((c: any) => c.phone === activePhone) as any;
    return row?.contact_name || activePhone || "";
  }, [convos.data, activePhone]);

  const activeBusinessLabel = useMemo(() => {
    const row = (convos.data ?? []).find((c: any) => c.phone === activePhone) as any;
    return labelForBusinessPhone(row?.business_phone);
  }, [convos.data, activePhone]);

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-2xl text-primary">וואטסאפ</h2>
            <p className="text-sm text-muted-foreground">
              קבלה ושליחה של הודעות, תמונות וסרטונים — ישירות מכאן, בלי טלפון חכם
            </p>
          </div>
        </div>
        <Button variant="outline" className="rounded-full gap-2 shrink-0" onClick={() => setNewConvoOpen(true)}>
          <MessageSquarePlus className="h-4 w-4" /> שיחה חדשה
        </Button>
      </div>

      <Dialog open={newConvoOpen} onOpenChange={setNewConvoOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>פתיחת שיחה חדשה</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">
            למספר שלא כתב אלייך קודם — חייבים תבנית מאושרת (ולא טקסט חופשי), לפי מדיניות וואטסאפ.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">מספר טלפון</label>
              <input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="054-1234567"
                dir="ltr"
                className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">תבנית</label>
              <Select
                value={newTemplateId}
                onValueChange={(v) => {
                  setNewTemplateId(v);
                  setNewParams(templateDefaultParams(v));
                }}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WHATSAPP_TEMPLATES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newTemplate?.params.map((p) => (
              <div key={p.key}>
                <label className="text-xs text-muted-foreground mb-1 block">{p.label}</label>
                <input
                  value={newParams[p.key] ?? ""}
                  onChange={(e) => setNewParams((prev) => ({ ...prev, [p.key]: e.target.value }))}
                  className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={sendNewConversation} disabled={sendingTemplate} className="rounded-full gap-2">
              {sendingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              שליחה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {config.data && !config.data.configured && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-900 space-y-2">
          <p className="font-semibold">וואטסאפ עדיין לא מחובר</p>
          <p>
            כדי להפעיל, חברי את חשבון הוואטסאפ ביזנס דרך הגדרות הפרויקט ← Connectors ← WhatsApp
            Business. אחרי החיבור, שליחה וקבלה של הודעות עובדות ישירות מכאן — בלי הגדרות נוספות.
          </p>
        </div>
      )}

      {config.data?.configured &&
        (sendProblem ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-900 space-y-1">
            <p className="font-semibold">⚠️ שליחת הודעות לא עובדת כרגע</p>
            <p>{sendProblem.reason}</p>
            <p className="text-xs text-red-800/80">
              {sendProblem.count} שיחות עם הודעה אחרונה שנכשלה. קבלת הודעות מלקוחות ממשיכה לעבוד.
            </p>
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-2.5 text-sm text-emerald-900">
            ✅ אין כשלונות שליחה ב-3 הימים האחרונים
          </div>
        ))}

      <div
        className="grid md:grid-cols-[280px_1fr] gap-0 bg-card rounded-2xl border border-primary/5 overflow-hidden"
        style={{ minHeight: 520 }}
      >
        <div className="border-l border-primary/5 overflow-y-auto max-h-[70vh]">
          <div className="flex flex-wrap gap-1.5 p-2.5 border-b border-primary/5 sticky top-0 bg-card z-10">
            {(
              [
                ["all", `הכל (${(convos.data ?? []).length})`],
                ["waiting", `ממתינות לתשובה (${waitingCount})`],
                ["failed", `נכשלו (${failedCount})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`h-7 px-3 rounded-full text-xs transition ${
                  filter === key ? "bg-primary text-primary-foreground" : "bg-cream/60 hover:bg-cream text-primary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {visibleConvos.map((c: any) => (
            <button
              key={c.phone}
              type="button"
              onClick={() => setActivePhone(c.phone)}
              className={`w-full text-right p-3.5 border-b border-primary/5 hover:bg-cream/40 transition ${
                activePhone === c.phone ? "bg-cream/60" : ""
              }`}
            >
              <div className="flex items-center gap-1.5">
                <div className="text-sm font-medium truncate" dir="ltr">
                  {c.contact_name || c.phone}
                </div>
                {labelForBusinessPhone(c.business_phone) && (
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                    {labelForBusinessPhone(c.business_phone)}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground truncate mt-0.5">
                {c.media_type
                  ? c.media_type === "image"
                    ? "📷 תמונה"
                    : c.media_type === "video"
                      ? "🎥 סרטון"
                      : c.media_type === "audio"
                        ? "🎤 הקלטה"
                        : "📎 קובץ"
                  : c.body || ""}
              </div>
              <div className="flex items-center gap-2 mt-1 text-[10px]">
                <span className="text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })}{" "}
                  {new Date(c.created_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                </span>
                {c.direction === "in" && (
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900">ממתינה לתשובה</span>
                )}
                {c.direction === "out" && c.status === "failed" && (
                  <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-800">לא נשלחה</span>
                )}
              </div>
            </button>
          ))}
          {convos.data && visibleConvos.length === 0 && convos.data.length > 0 && (
            <p className="text-sm text-muted-foreground p-4 text-center">אין שיחות בסינון הזה.</p>
          )}
          {convos.data?.length === 0 && (
            <p className="text-sm text-muted-foreground p-4 text-center">
              עדיין אין הודעות וואטסאפ.
            </p>
          )}
        </div>

        <div className="flex flex-col">
          {activePhone ? (
            <>
              <div className="p-4 border-b border-primary/5 font-medium flex items-center gap-2" dir="ltr">
                <span>{activeName}</span>
                {activeBusinessLabel && (
                  <span dir="rtl" className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                    {activeBusinessLabel}
                  </span>
                )}
              </div>
              {handoff.data?.handoffRequestedAt && (
                <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2 text-amber-900">
                    <UserRound className="h-4 w-4 shrink-0" />
                    <span>הלקוחה ביקשה לדבר איתך — הבוט שותק בשיחה הזו עד שתלחצי "החזרת הבוט"</span>
                  </div>
                  <button
                    type="button"
                    onClick={resumeBot}
                    disabled={resuming}
                    className="shrink-0 h-8 px-3 rounded-full bg-amber-900 text-amber-50 text-xs font-medium disabled:opacity-50"
                  >
                    {resuming ? "מפעילה…" : "החזרת הבוט"}
                  </button>
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[55vh]">
                {((thread.data ?? []) as unknown as Msg[]).map((m, i, arr) => {
                  const day = new Date(m.created_at).toLocaleDateString("he-IL", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  });
                  const prevDay =
                    i > 0
                      ? new Date(arr[i - 1].created_at).toLocaleDateString("he-IL", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })
                      : null;
                  return (
                  <div key={m.id}>
                  {day !== prevDay && (
                    <div className="text-center my-2">
                      <span className="text-[11px] px-3 py-1 rounded-full bg-cream/70 text-muted-foreground">{day}</span>
                    </div>
                  )}
                  <div
                    className={`flex ${m.direction === "out" ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                        m.direction === "out"
                          ? "rounded-tl-sm bg-primary text-primary-foreground"
                          : "rounded-tr-sm bg-cream/60"
                      }`}
                    >
                      {m.media_url && m.media_type === "image" && (
                        <img
                          src={m.media_url}
                          alt=""
                          className="rounded-xl mb-1 max-h-64 object-cover"
                        />
                      )}
                      {m.media_url && m.media_type === "video" && (
                        <video src={m.media_url} controls className="rounded-xl mb-1 max-h-64" />
                      )}
                      {m.media_url && m.media_type === "audio" && (
                        <audio src={m.media_url} controls className="mb-1 max-w-full" />
                      )}
                      {m.media_url && m.media_type === "document" && (
                        <a
                          href={m.media_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline block mb-1"
                        >
                          📎 פתיחת קובץ
                        </a>
                      )}
                      {m.body && <div className="whitespace-pre-line">{m.body}</div>}
                      {m.status === "failed" && m.error && (
                        <div className="mt-1 text-[11px] text-destructive font-medium whitespace-pre-line">
                          לא נשלחה: {explainWhatsAppFailure(m.error)}
                        </div>
                      )}
                      <div
                        className={`flex items-center gap-1 mt-1 text-[10px] ${
                          m.direction === "out"
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground"
                        }`}
                      >
                        {new Date(m.created_at).toLocaleTimeString("he-IL", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {m.direction === "out" && <StatusIcon status={m.status} />}
                      </div>
                    </div>
                  </div>
                  </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              {windowClosed && (
                <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-200 flex items-center justify-between gap-3 text-sm">
                  <span className="text-amber-900">
                    עברו יותר מ-24 שעות מההודעה האחרונה של הלקוחה — וואטסאפ מאפשר רק תבנית מאושרת.
                  </span>
                  <button
                    type="button"
                    onClick={openTemplateForActive}
                    className="shrink-0 h-8 px-3 rounded-full bg-amber-900 text-amber-50 text-xs font-medium"
                  >
                    שליחת תבנית
                  </button>
                </div>
              )}
              <div className="px-3 pt-2 border-t border-primary/5 flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">תבניות:</span>
                {MESSAGE_TEMPLATES.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => setDraft(t.text)}
                    className="h-7 px-3 rounded-full bg-cream/60 hover:bg-cream text-xs text-primary transition"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="p-3 flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,audio/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) sendMedia(file);
                  }}
                />
                <input
                  ref={stickerInputRef}
                  type="file"
                  accept="image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) sendMedia(file, true);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || windowClosed}
                  className="h-10 w-10 rounded-full hover:bg-cream/60 flex items-center justify-center text-muted-foreground disabled:opacity-50 shrink-0"
                  title="שליחת תמונה, סרטון, הקלטה או PDF"
                  aria-label="שליחת תמונה, סרטון, הקלטה או PDF"
                >
                  <ImageIcon className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => stickerInputRef.current?.click()}
                  disabled={sending || windowClosed}
                  className="h-10 w-10 rounded-full hover:bg-cream/60 flex items-center justify-center text-muted-foreground disabled:opacity-50 shrink-0"
                  title="שליחת מדבקה (קובץ webp)"
                  aria-label="שליחת מדבקה"
                >
                  <Smile className="h-5 w-5" />
                </button>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendText();
                    }
                  }}
                  placeholder={windowClosed ? "אי אפשר לכתוב חופשי — שלחי תבנית" : "הקלידי הודעה…"}
                  disabled={windowClosed}
                  className="flex-1 h-10 rounded-full border border-input bg-background px-4 text-sm disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={sendText}
                  disabled={sending || !draft.trim() || windowClosed}
                  className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 shrink-0"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              בחרי שיחה מהרשימה
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

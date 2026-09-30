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
  CheckCheck,
  Check,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compress";
import {
  getWhatsAppConfigStatus,
  listWhatsAppConversations,
  listWhatsAppThread,
  sendWhatsAppMessageAdmin,
  sendWhatsAppMediaAdmin,
} from "@/lib/admin-whatsapp.functions";

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
  created_at: string;
};

/** Uploads an outgoing image/video to the same "items" storage bucket the photo galleries already use, and returns a public-ish signed URL — WhatsApp's Cloud API sends media by URL ("link" method), so no separate binary-upload endpoint is needed. */
async function uploadMediaToStorage(file: File): Promise<{ url: string; type: "image" | "video" }> {
  const isImage = file.type.startsWith("image/");
  const toUpload = isImage ? await compressImage(file) : file;
  const ext = toUpload.name.split(".").pop() ?? (isImage ? "jpg" : "mp4");
  const path = `whatsapp-outgoing/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("items").upload(path, toUpload, { upsert: false });
  if (error) throw error;
  const { data, error: signErr } = await supabase.storage
    .from("items")
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (signErr || !data?.signedUrl) throw signErr ?? new Error("שגיאה ביצירת קישור לקובץ");
  return { url: data.signedUrl, type: isImage ? "image" : "video" };
}

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

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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

  const sendMedia = async (file: File) => {
    if (!activePhone) return;
    setSending(true);
    try {
      const { url, type } = await uploadMediaToStorage(file);
      await doSendMedia({
        data: {
          phone: activePhone,
          mediaUrl: url,
          mediaType: type,
          caption: draft.trim() || undefined,
        },
      });
      setDraft("");
      refreshAfterSend();
    } catch (e: any) {
      toast.error(e?.message ?? "שליחת הקובץ נכשלה");
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const activeName = useMemo(() => {
    const row = (convos.data ?? []).find((c: any) => c.phone === activePhone) as any;
    return row?.contact_name || activePhone || "";
  }, [convos.data, activePhone]);

  return (
    <div dir="rtl" className="space-y-5">
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

      {config.data && !config.data.configured && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-900 space-y-2">
          <p className="font-semibold">וואטסאפ עדיין לא מחובר</p>
          <p>
            כדי להפעיל, צריך חשבון WhatsApp Business Platform דרך Meta (business.facebook.com), ואז
            להזין 4 משתני סביבה (באותו מקום שכבר הוגדר TWILIO_AUTH_TOKEN):
          </p>
          <ul className="list-disc pr-5 space-y-0.5">
            <li>
              <code dir="ltr" className="bg-white/60 px-1 rounded">
                WHATSAPP_ACCESS_TOKEN
              </code>
            </li>
            <li>
              <code dir="ltr" className="bg-white/60 px-1 rounded">
                WHATSAPP_PHONE_NUMBER_ID
              </code>
            </li>
            <li>
              <code dir="ltr" className="bg-white/60 px-1 rounded">
                WHATSAPP_APP_SECRET
              </code>
            </li>
            <li>
              <code dir="ltr" className="bg-white/60 px-1 rounded">
                WHATSAPP_VERIFY_TOKEN
              </code>{" "}
              — כל מחרוזת שתבחרי בעצמך
            </li>
          </ul>
          <p>
            וב-Meta, בכתובת ה-webhook להזין:{" "}
            <code dir="ltr" className="bg-white/60 px-1 rounded">
              https://sweetbabyphoto.shop/api/whatsapp/webhook
            </code>
          </p>
        </div>
      )}

      <div
        className="grid md:grid-cols-[280px_1fr] gap-0 bg-card rounded-2xl border border-primary/5 overflow-hidden"
        style={{ minHeight: 520 }}
      >
        <div className="border-l border-primary/5 overflow-y-auto max-h-[70vh]">
          {(convos.data ?? []).map((c: any) => (
            <button
              key={c.phone}
              type="button"
              onClick={() => setActivePhone(c.phone)}
              className={`w-full text-right p-3.5 border-b border-primary/5 hover:bg-cream/40 transition ${
                activePhone === c.phone ? "bg-cream/60" : ""
              }`}
            >
              <div className="text-sm font-medium truncate" dir="ltr">
                {c.contact_name || c.phone}
              </div>
              <div className="text-xs text-muted-foreground truncate mt-0.5">
                {c.media_type
                  ? c.media_type === "image"
                    ? "📷 תמונה"
                    : c.media_type === "video"
                      ? "🎥 סרטון"
                      : "📎 קובץ"
                  : c.body || ""}
              </div>
            </button>
          ))}
          {convos.data?.length === 0 && (
            <p className="text-sm text-muted-foreground p-4 text-center">
              עדיין אין הודעות וואטסאפ.
            </p>
          )}
        </div>

        <div className="flex flex-col">
          {activePhone ? (
            <>
              <div className="p-4 border-b border-primary/5 font-medium" dir="ltr">
                {activeName}
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[55vh]">
                {((thread.data ?? []) as unknown as Msg[]).map((m) => (
                  <div
                    key={m.id}
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
                      {m.media_url && (m.media_type === "document" || m.media_type === "audio") && (
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
                ))}
                <div ref={bottomRef} />
              </div>
              <div className="p-3 border-t border-primary/5 flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) sendMedia(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                  className="h-10 w-10 rounded-full hover:bg-cream/60 flex items-center justify-center text-muted-foreground disabled:opacity-50 shrink-0"
                  title="שליחת תמונה/סרטון"
                >
                  <ImageIcon className="h-5 w-5" />
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
                  placeholder="הקלידי הודעה…"
                  className="flex-1 h-10 rounded-full border border-input bg-background px-4 text-sm"
                />
                <button
                  type="button"
                  onClick={sendText}
                  disabled={sending || !draft.trim()}
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

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listChatLogs, listVoiceCallLogs } from "@/lib/admin-chat-logs.functions";
import { listClientEmails } from "@/lib/admin-clients.functions";
import { MessageCircle, Phone, ChevronDown, ChevronUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/chat-logs")({
  component: ChatLogsAdmin,
});

type Msg = { role: "user" | "assistant"; content: string };
type ChatLogRow = { id: string; session_id: string; user_id: string | null; messages: Msg[]; created_at: string; updated_at: string };
type CallLogRow = { call_sid: string; from_number: string | null; messages: Msg[]; created_at: string; updated_at: string };

function ChatLogsAdmin() {
  const [tab, setTab] = useState<"chat" | "calls">("chat");
  const fetchLogs = useServerFn(listChatLogs);
  const fetchCalls = useServerFn(listVoiceCallLogs);
  const fetchEmails = useServerFn(listClientEmails);
  const logs = useQuery({ queryKey: ["admin-chat-logs"], queryFn: () => fetchLogs({}), refetchInterval: 15000 });
  const calls = useQuery({ queryKey: ["admin-voice-call-logs"], queryFn: () => fetchCalls({}), refetchInterval: 15000 });
  const emailsQ = useQuery({ queryKey: ["admin-client-emails"], queryFn: () => fetchEmails({ data: {} } as any) });
  const emails: Record<string, string> = (emailsQ.data as any) ?? {};

  const [openId, setOpenId] = useState<string | null>(null);
  const chatRows = (logs.data ?? []) as unknown as ChatLogRow[];
  const callRows = (calls.data ?? []) as unknown as CallLogRow[];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="font-display text-xl text-primary mb-1 flex items-center gap-2">
          {tab === "chat" ? <MessageCircle className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
          {tab === "chat" ? "שיחות צ'אט לקוחות" : "שיחות טלפון עם הבוט"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {tab === "chat"
            ? "כל שיחה שנוהלה עם הצ'אט של הלקוחות (הבועה בפינת האתר) — כולל כאלה שלא הסתיימו בהזמנה. מתעדכן אוטומטית."
            : "כל שיחה שנוהלה עם בוט הטלפון (הקו הרגיל וקו ימות המשיח) — כולל כאלה שלא הסתיימו בהזמנה. מתעדכן אוטומטית."}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("chat")}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
            tab === "chat" ? "bg-primary text-primary-foreground" : "bg-cream/60 text-muted-foreground hover:bg-cream"
          }`}
        >
          צ'אט אתר ({chatRows.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("calls")}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
            tab === "calls" ? "bg-primary text-primary-foreground" : "bg-cream/60 text-muted-foreground hover:bg-cream"
          }`}
        >
          שיחות טלפון ({callRows.length})
        </button>
      </div>

      {tab === "chat" ? (
        <div className="space-y-2">
          {chatRows.map((r) => {
            const isOpen = openId === r.id;
            const who = r.user_id ? emails[r.user_id] || "לקוחה מחוברת" : "אורחת (לא מחוברת)";
            const lastMsg = r.messages?.[r.messages.length - 1];
            return (
              <div key={r.id} className="bg-card rounded-xl border border-primary/5 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : r.id)}
                  className="w-full flex items-center justify-between gap-3 p-4 text-right hover:bg-cream/30 transition"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" dir="ltr">
                      {who}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{lastMsg?.content ?? ""}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">{r.messages?.length ?? 0} הודעות</span>
                    <span className="text-xs text-muted-foreground">{new Date(r.updated_at).toLocaleString("he-IL")}</span>
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-primary/5 p-4 space-y-2 max-h-96 overflow-y-auto bg-cream/20">
                    {(r.messages ?? []).map((m, i) => (
                      <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm whitespace-pre-line ${
                            m.role === "user" ? "rounded-tl-sm bg-primary text-primary-foreground" : "rounded-tr-sm bg-card border border-primary/5"
                          }`}
                        >
                          {m.content}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {chatRows.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">עדיין אין שיחות צ'אט מתועדות.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {callRows.map((r) => {
            const isOpen = openId === r.call_sid;
            const line = r.call_sid.startsWith("yemot:") ? "קו ימות המשיח" : "קו טלפון רגיל";
            const lastMsg = r.messages?.[r.messages.length - 1];
            return (
              <div key={r.call_sid} className="bg-card rounded-xl border border-primary/5 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : r.call_sid)}
                  className="w-full flex items-center justify-between gap-3 p-4 text-right hover:bg-cream/30 transition"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" dir="ltr">
                      {r.from_number || "מספר לא ידוע"} <span className="text-muted-foreground text-xs">· {line}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{lastMsg?.content ?? ""}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">{r.messages?.length ?? 0} הודעות</span>
                    <span className="text-xs text-muted-foreground">{new Date(r.updated_at).toLocaleString("he-IL")}</span>
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-primary/5 p-4 space-y-2 max-h-96 overflow-y-auto bg-cream/20">
                    {(r.messages ?? []).map((m, i) => (
                      <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm whitespace-pre-line ${
                            m.role === "user" ? "rounded-tl-sm bg-primary text-primary-foreground" : "rounded-tr-sm bg-card border border-primary/5"
                          }`}
                        >
                          {m.content}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {callRows.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">עדיין אין שיחות טלפון מתועדות.</p>}
        </div>
      )}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listChatLogs } from "@/lib/admin-chat-logs.functions";
import { listClientEmails } from "@/lib/admin-clients.functions";
import { MessageCircle, ChevronDown, ChevronUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/chat-logs")({
  component: ChatLogsAdmin,
});

type Msg = { role: "user" | "assistant"; content: string };
type LogRow = { id: string; session_id: string; user_id: string | null; messages: Msg[]; created_at: string; updated_at: string };

function ChatLogsAdmin() {
  const fetchLogs = useServerFn(listChatLogs);
  const fetchEmails = useServerFn(listClientEmails);
  const logs = useQuery({ queryKey: ["admin-chat-logs"], queryFn: () => fetchLogs({}), refetchInterval: 15000 });
  const emailsQ = useQuery({ queryKey: ["admin-client-emails"], queryFn: () => fetchEmails({ data: {} } as any) });
  const emails: Record<string, string> = (emailsQ.data as any) ?? {};

  const [openId, setOpenId] = useState<string | null>(null);
  const rows = (logs.data ?? []) as unknown as LogRow[];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="font-display text-xl text-primary mb-1 flex items-center gap-2">
          <MessageCircle className="h-5 w-5" /> שיחות צ'אט לקוחות
        </h2>
        <p className="text-sm text-muted-foreground">
          כל שיחה שנוהלה עם הצ'אט של הלקוחות (הבועה בפינת האתר) — כולל כאלה שלא הסתיימו בהזמנה. מתעדכן אוטומטית.
        </p>
      </div>

      <div className="space-y-2">
        {rows.map((r) => {
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
        {rows.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">עדיין אין שיחות צ'אט מתועדות.</p>}
      </div>
    </div>
  );
}

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mail } from "lucide-react";
import { listMailChats } from "@/lib/admin-mailchat.functions";
import type { MailConversation } from "@/lib/mailchat";

// Main admin page mail panel (owner, 2026-11-27): replaces "הזמנות אחרונות" and the system-notices box.
// Two boxes (studio / photo customers), 10 chats at a time, chats answered 14+ days ago are hidden.
const HIDE_ANSWERED_MS = 14 * 86400000;
type Box = "studio" | "photo";
type Filter = "all" | "unread" | "waiting";

function ago(ts: number): string {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.round(m / 60);
  if (h < 24) return `לפני ${h} שעות`;
  return new Date(ts).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
}

export function AdminMailPanel() {
  const fetchChats = useServerFn(listMailChats);
  const [box, setBox] = useState<Box>("studio");
  const [filter, setFilter] = useState<Filter>("all");
  const [shown, setShown] = useState(10);

  const chats = useQuery({
    queryKey: ["admin-home-mail", box, shown],
    queryFn: () => fetchChats({ data: { box, limit: shown * 3 + 10 } }),
    refetchInterval: 30000,
    placeholderData: keepPreviousData,
  });

  const all: MailConversation[] = ((chats.data?.conversations ?? []) as MailConversation[])
    .filter((c) => c.lastFromMe ? Date.now() - c.lastDate < HIDE_ANSWERED_MS : true)
    .sort((a, b) => b.lastDate - a.lastDate);
  const counts = {
    unread: all.filter((c) => c.unread).length,
    waiting: all.filter((c) => !c.lastFromMe || c.hasDraft).length,
  };
  const list = all.filter((c) =>
    filter === "unread" ? c.unread : filter === "waiting" ? !c.lastFromMe || c.hasDraft : true,
  );
  const rows = list.slice(0, shown);
  const more = list.length > shown || !!chats.data?.hasMore;

  const boxBtn = (b: Box, label: string) => (
    <button
      type="button"
      onClick={() => { setBox(b); setShown(10); }}
      className={`px-4 py-1.5 rounded-full text-sm border ${box === b ? "bg-primary text-primary-foreground border-primary" : "bg-card text-primary border-primary/20"}`}
    >
      {label}
    </button>
  );
  const chip = (f: Filter, label: string, n?: number) => (
    <button
      type="button"
      onClick={() => { setFilter(filter === f ? "all" : f); setShown(10); }}
      className={`px-3 py-1 rounded-full text-xs border ${filter === f ? "bg-peach text-primary border-primary/30" : "border-primary/10 text-muted-foreground"}`}
    >
      {label}{n ? ` (${n})` : ""}
    </button>
  );

  return (
    <div className="bg-card rounded-2xl p-4 sm:p-6 border border-primary/5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-display text-2xl text-primary flex items-center gap-2">
          <Mail className="h-5 w-5" /> מיילים
        </h2>
        <div className="flex items-center gap-2">
          {boxBtn("studio", "לקוחות סטודיו")}
          {boxBtn("photo", "לקוחות צילום")}
          <Link to="/admin/mail-chat" className="text-xs text-forest hover:text-primary underline underline-offset-4 mr-2">
            למסך המלא
          </Link>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {chip("unread", "לא נקראו", counts.unread)}
        {chip("waiting", "ממתינות לי", counts.waiting)}
      </div>

      {chats.isLoading ? (
        <div className="text-muted-foreground text-sm py-10 text-center">טוען מיילים…</div>
      ) : chats.error ? (
        <div className="text-sm py-8 text-center text-amber-700">Gmail לא הגיב כרגע, מנסה שוב בעוד רגע.</div>
      ) : chats.data && !chats.data.connected ? (
        <div className="text-muted-foreground text-sm py-10 text-center">חשבון Gmail לא מחובר.</div>
      ) : rows.length === 0 ? (
        <div className="text-muted-foreground text-sm py-10 text-center">אין מיילים להצגה.</div>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((c) => (
            <Link
              key={c.key}
              to="/admin/mail-chat"
              className="flex items-center gap-3 py-3 hover:bg-cream/50 rounded-lg px-2 -mx-2"
            >
              <div className="h-9 w-9 rounded-full bg-peach text-primary flex items-center justify-center shrink-0 text-sm font-medium">
                {(c.title || "?").trim().charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`truncate ${c.unread ? "font-semibold text-primary" : "text-primary"}`}>{c.title}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {c.lastFromMe ? "את: " : ""}{c.snippet}
                </div>
              </div>
              <div className="text-xs text-muted-foreground shrink-0 text-left">
                <div>{ago(c.lastDate)}</div>
                {c.hasDraft && <div className="text-forest">טיוטה מוכנה</div>}
              </div>
              {c.unread && <div className="h-2 w-2 rounded-full bg-destructive shrink-0" />}
            </Link>
          ))}
        </div>
      )}

      {more && !chats.isLoading && (
        <div className="text-center mt-3">
          <button
            type="button"
            onClick={() => setShown((n) => n + 10)}
            className="text-sm text-forest hover:text-primary underline underline-offset-4"
            disabled={chats.isFetching}
          >
            {chats.isFetching ? "טוען…" : "טעינת עוד 10"}
          </button>
        </div>
      )}
    </div>
  );
}

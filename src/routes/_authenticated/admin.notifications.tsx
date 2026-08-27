import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listAdminNotifications, markNotificationRead } from "@/lib/admin-notifications.functions";
import { Bell, ChevronDown, ChevronUp, Phone, CalendarDays, Circle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  component: NotificationsAdmin,
});

type NotifRow = {
  id: string;
  type: string;
  title: string;
  body: Record<string, any>;
  read_at: string | null;
  created_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  voice_message: "הודעה מהבוט הקולי",
  booking: "שריון סטודיו",
};

const TYPE_ICONS: Record<string, typeof Phone> = {
  voice_message: Phone,
  booking: CalendarDays,
};

function NotificationsAdmin() {
  const qc = useQueryClient();
  const fetchNotifs = useServerFn(listAdminNotifications);
  const doMarkRead = useServerFn(markNotificationRead);
  const q = useQuery({ queryKey: ["admin-notifications"], queryFn: () => fetchNotifs({}), refetchInterval: 15000 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const rows = (q.data ?? []) as unknown as NotifRow[];
  const visible = unreadOnly ? rows.filter((r) => !r.read_at) : rows;
  const unreadCount = rows.filter((r) => !r.read_at).length;

  const toggleRead = async (r: NotifRow) => {
    await doMarkRead({ data: { id: r.id, read: !r.read_at } });
    qc.invalidateQueries({ queryKey: ["admin-notifications"] });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="font-display text-xl text-primary mb-1 flex items-center gap-2">
          <Bell className="h-5 w-5" /> הודעות מערכת
          {unreadCount > 0 && <span className="text-xs bg-destructive text-destructive-foreground rounded-full px-2 py-0.5">{unreadCount} חדשות</span>}
        </h2>
        <p className="text-sm text-muted-foreground">
          כל התראה שהמערכת שולחת פנימה — כולל הודעות שלקוחות השאירו בבוט הטלפוני (גם כשליחת המייל נכשלת, הרשומה כאן לא הולכת לאיבוד). מתעדכן אוטומטית.
        </p>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant={unreadOnly ? "default" : "outline"} className="rounded-full" onClick={() => setUnreadOnly((v) => !v)}>
          {unreadOnly ? "מציג רק לא נקראו" : "הצג רק לא נקראו"}
        </Button>
      </div>

      <div className="space-y-2">
        {visible.map((r) => {
          const isOpen = openId === r.id;
          const isRead = !!r.read_at;
          const Icon = TYPE_ICONS[r.type] ?? Bell;
          const bodyEntries = Object.entries(r.body ?? {}).filter(([, v]) => v !== null && v !== "" && v !== undefined);
          return (
            <div key={r.id} className={`bg-card rounded-xl border overflow-hidden ${isRead ? "border-primary/5" : "border-peach-deep/40"}`}>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : r.id)}
                className="w-full flex items-center justify-between gap-3 p-4 text-right hover:bg-cream/30 transition"
              >
                <div className="min-w-0 flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className={`text-sm truncate ${isRead ? "font-normal text-muted-foreground" : "font-semibold text-primary"}`}>{r.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{TYPE_LABELS[r.type] ?? r.type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("he-IL")}</span>
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-primary/5 p-4 space-y-3 bg-cream/20">
                  <div className="text-sm space-y-1">
                    {bodyEntries.map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <span className="text-muted-foreground shrink-0">{k}:</span>
                        <span className="break-words">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                      </div>
                    ))}
                  </div>
                  <Button size="sm" variant="outline" className="rounded-full gap-1.5" onClick={() => toggleRead(r)}>
                    {isRead ? <Circle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    {isRead ? "סמן כלא נקרא" : "סמן כנקרא"}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-10">
            {unreadOnly ? "אין הודעות שלא נקראו." : "אין הודעות עדיין."}
          </p>
        )}
      </div>
    </div>
  );
}

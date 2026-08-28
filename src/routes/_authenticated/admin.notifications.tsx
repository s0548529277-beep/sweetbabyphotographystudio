import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listAdminNotifications, markNotificationRead, getAiProviderStatus } from "@/lib/admin-notifications.functions";
import { adminConfirmPhoneBookingDeposit } from "@/lib/bookings.functions";
import { Bell, ChevronDown, ChevronUp, Phone, CalendarDays, Circle, CheckCircle2, Cpu, KeyRound, AlertTriangle, Shuffle, BadgeCheck } from "lucide-react";
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
  ttlock_error: "כשל בהנפקת קוד כניסה",
  yemot_voice_message_error: "כשל בשליחת הודעה קולית",
  voice_ai_error: "תקלה בבוט הטלפוני",
  ai_provider_switch: "מעבר ספק AI",
  phone_booking_reminder_call: "תזכורת טלפונית — הזמנה ממתינה",
  props_request_reminder_call: "תזכורת טלפונית — בקשת אביזרים ממתינה",
};

const TYPE_ICONS: Record<string, typeof Phone> = {
  voice_message: Phone,
  booking: CalendarDays,
  ttlock_error: KeyRound,
  yemot_voice_message_error: AlertTriangle,
  voice_ai_error: AlertTriangle,
  ai_provider_switch: Shuffle,
  phone_booking_reminder_call: Phone,
  props_request_reminder_call: Phone,
};

const PROVIDER_LABELS: Record<string, string> = {
  "gemini-direct": "Gemini (ישיר)",
  groq: "Groq",
  "lovable-gateway": "Lovable AI Gateway",
};

function NotificationsAdmin() {
  const qc = useQueryClient();
  const fetchNotifs = useServerFn(listAdminNotifications);
  const doMarkRead = useServerFn(markNotificationRead);
  const fetchProviderStatus = useServerFn(getAiProviderStatus);
  const doConfirmPhoneBooking = useServerFn(adminConfirmPhoneBookingDeposit);
  const q = useQuery({ queryKey: ["admin-notifications"], queryFn: () => fetchNotifs({}), refetchInterval: 15000 });
  const providerQ = useQuery({ queryKey: ["ai-provider-status"], queryFn: () => fetchProviderStatus({}), refetchInterval: 15000 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  // Per-notification state for the phone-booking "confirm payment" action —
  // keyed by notification id so multiple rows can be mid-confirm at once
  // without stepping on each other.
  const [confirmState, setConfirmState] = useState<
    Record<string, { loading: boolean; result?: { ok: boolean; doorCode: string | null } }>
  >({});

  const confirmPhoneBooking = async (notifId: string, bookingId: string, contactEmail?: string) => {
    setConfirmState((s) => ({ ...s, [notifId]: { loading: true } }));
    try {
      const res = await doConfirmPhoneBooking({ data: { id: bookingId, contactEmail } });
      setConfirmState((s) => ({ ...s, [notifId]: { loading: false, result: { ok: res.ok !== false, doorCode: res.doorCode ?? null } } }));
    } catch (e: any) {
      setConfirmState((s) => ({ ...s, [notifId]: { loading: false, result: { ok: false, doorCode: null } } }));
      console.error("[SWEETBABY] admin confirm phone booking failed", e);
    }
  };

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

      {providerQ.data && (
        <div className="flex items-center gap-2 text-sm bg-cream/40 border border-primary/10 rounded-xl px-4 py-3">
          <Cpu className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">ספק ה-AI ששימש לאחרונה:</span>
          <span className="font-semibold text-primary">
            {PROVIDER_LABELS[providerQ.data.provider ?? ""] ?? providerQ.data.provider} · <span dir="ltr">{providerQ.data.model}</span>
          </span>
          <span className="text-xs text-muted-foreground mr-auto">{new Date(providerQ.data.updated_at).toLocaleString("he-IL")}</span>
        </div>
      )}

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
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="rounded-full gap-1.5" onClick={() => toggleRead(r)}>
                      {isRead ? <Circle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      {isRead ? "סמן כלא נקרא" : "סמן כנקרא"}
                    </Button>
                    {/* Only a phone-booked reservation needs this — a website
                        booking's own /deposit page already confirms itself
                        the moment she pays, since that page runs in HER
                        browser session. A phone booking has no such session
                        (see adminConfirmPhoneBookingDeposit's own comment for
                        why), so this button is the only way it ever reaches
                        "confirmed" — click it once the bank transfer/Bit
                        payment has actually arrived. */}
                    {((r.type === "booking" && r.body?.source === "voice_call") || r.type === "phone_booking_reminder_call") && r.body?.booking_id && (
                      <Button
                        size="sm"
                        className="rounded-full gap-1.5"
                        disabled={confirmState[r.id]?.loading}
                        onClick={() => confirmPhoneBooking(r.id, String(r.body.booking_id), r.body.contact_email || undefined)}
                      >
                        <BadgeCheck className="h-3.5 w-3.5" />
                        {confirmState[r.id]?.loading ? "מאשרת..." : "אשר תשלום והנפק קוד"}
                      </Button>
                    )}
                  </div>
                  {confirmState[r.id]?.result && (
                    <p className={`text-xs ${confirmState[r.id]!.result!.ok ? "text-primary" : "text-destructive"}`}>
                      {confirmState[r.id]!.result!.ok
                        ? `אושר בהצלחה — נשלח מייל מלא + שיחת ימות${confirmState[r.id]!.result!.doorCode ? ` · קוד כניסה: ${confirmState[r.id]!.result!.doorCode}` : ""}`
                        : "האישור נכשל — בדקי ב-/admin/notifications עבור שגיאה מפורטת, או נסי שוב."}
                    </p>
                  )}
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

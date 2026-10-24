import { useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell, MessageCircle, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { heError } from "@/lib/he-errors";
import {
  SESSION_STATUSES,
  formatDateIL,
  hebrewDayLabel,
  fromYmd,
  statusMeta,
  whatsappLink,
  type CmClient,
  type CmSession,
} from "@/lib/client-management";
import { sendCmSessionReminder } from "@/lib/client-management.functions";
import { cmDb, useCmInvalidate } from "./data";

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-3xl border border-newborn-rose/20 bg-white/90 shadow-[0_8px_30px_-18px_rgba(120,60,70,0.35)] ${className}`}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          {title ? <h3 className="font-display text-lg text-newborn-ink">{title}</h3> : <span />}
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "rose",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "rose" | "gold" | "sage" | "ink";
}) {
  const tones = {
    rose: "from-newborn-blush/70 to-white text-newborn-rose",
    gold: "from-amber-50 to-white text-newborn-gold",
    sage: "from-emerald-50 to-white text-emerald-700",
    ink: "from-stone-100 to-white text-newborn-ink",
  } as const;
  return (
    <div
      className={`rounded-3xl border border-newborn-rose/15 bg-gradient-to-b ${tones[tone]} p-4`}
    >
      <div className="flex items-center gap-2 text-sm opacity-80">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white/80 shadow-sm">
          {icon}
        </span>
        <span className="text-newborn-ink/70">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-newborn-ink/50">{hint}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const m = statusMeta(status);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${m.tone}`}
    >
      {m.label}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-newborn-rose/25 bg-newborn-canvas/40 p-6 text-center text-sm text-newborn-ink/60">
      {children}
    </div>
  );
}

/** One session line — used in the overview, the journal and a client's card. */
export function SessionRow({
  session,
  client,
  onEdit,
  compact,
}: {
  session: CmSession;
  client?: CmClient;
  onEdit?: (s: CmSession) => void;
  compact?: boolean;
}) {
  const invalidate = useCmInvalidate();
  const sendReminder = useServerFn(sendCmSessionReminder);
  const [busy, setBusy] = useState(false);
  const wa = whatsappLink(
    client?.phone,
    `היי ${client?.full_name ?? ""}, תזכורת לצילום ${session.session_type} ב-${formatDateIL(session.session_date)} בשעה ${session.start_time} 💗`,
  );

  const setStatus = async (status: string) => {
    const { error } = await cmDb
      .from("cm_sessions")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", session.id);
    if (error) return toast.error(heError(error));
    invalidate("sessions");
  };

  const remove = async () => {
    if (
      !confirm(
        `למחוק את הצילום של ${client?.full_name ?? "הלקוחה"} ב-${formatDateIL(session.session_date)}?`,
      )
    )
      return;
    const { error } = await cmDb.from("cm_sessions").delete().eq("id", session.id);
    if (error) return toast.error(heError(error));
    toast.success("הצילום נמחק");
    invalidate("sessions", "accounts");
  };

  const remind = async () => {
    if (!client?.email) return toast.error("ללקוחה אין מייל — אפשר לשלוח בוואטסאפ");
    setBusy(true);
    try {
      await sendReminder({ data: { sessionId: session.id } });
      toast.success(`תזכורת נשלחה ל-${client.email}`);
      invalidate("sessions");
    } catch (e) {
      toast.error(heError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-newborn-rose/10 bg-white px-4 py-3">
      <div className="min-w-[86px] text-center">
        <div className="text-sm font-semibold text-newborn-ink">
          {formatDateIL(session.session_date)}
        </div>
        <div className="text-[11px] text-newborn-ink/50">
          {hebrewDayLabel(fromYmd(session.session_date))}
        </div>
        <div className="text-sm font-medium text-newborn-rose">{session.start_time}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-newborn-ink">{client?.full_name ?? "—"}</span>
          <span className="rounded-full bg-newborn-blush/60 px-2 py-0.5 text-xs text-newborn-ink">
            {session.session_type}
            {session.part_label ? ` · ${session.part_label}` : ""}
          </span>
          {session.reminder_sent_at && (
            <span className="text-[11px] text-emerald-700">✓ תזכורת נשלחה</span>
          )}
        </div>
        {!compact && (session.time_slot || session.notes) && (
          <div className="mt-0.5 truncate text-xs text-newborn-ink/55">
            {[session.time_slot, session.notes].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
      <Select value={session.status} onValueChange={setStatus}>
        <SelectTrigger className="h-8 w-[130px] rounded-full border-newborn-rose/20 text-xs">
          <SelectValue>
            <StatusBadge status={session.status} />
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SESSION_STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          title="שליחת תזכורת במייל עכשיו"
          disabled={busy}
          onClick={remind}
        >
          <Bell className="h-4 w-4 text-newborn-gold" />
        </Button>
        {wa && (
          <Button size="icon" variant="ghost" title="וואטסאפ" asChild>
            <a href={wa} target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4 text-emerald-600" />
            </a>
          </Button>
        )}
        {onEdit && (
          <Button size="icon" variant="ghost" title="עריכה" onClick={() => onEdit(session)}>
            <Pencil className="h-4 w-4" />
          </Button>
        )}
        <Button size="icon" variant="ghost" title="מחיקה" onClick={remove}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

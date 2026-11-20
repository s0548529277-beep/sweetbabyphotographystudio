// Views + cards for the unified client page (/admin/newborn-packages): outdoor and custom-studio
// cards, the kind chooser, the shared dashboard / daily calendar / table / payments views.
// Newborn keeps its own card and dialogs in the page file (they are gallery-aware).
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { he } from "date-fns/locale";
import {
  Check,
  Circle,
  Clock,
  CalendarCheck2,
  CalendarDays,
  Images,
  Loader2,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Trash2,
  Wallet,
  Wallet2,
  X as XIcon,
  FileSignature,
  Lock,
  Image as ImageIcon,
  Send,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NEWBORN_TIMELINE_STEPS } from "@/lib/newborn-packages";
import { formatDateIL, whatsappLink } from "@/lib/client-management";
import { heError } from "@/lib/he-errors";
import { STAGE_LABELS, type WorkflowStage } from "@/lib/photo-clients.functions";
import {
  HUB_KINDS,
  hubBalance,
  hubInProgress,
  hubIsPaid,
  hubKind,
  type HubKind,
  type HubRow,
} from "@/lib/client-hub";

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function KindBadge({ kind, className = "" }: { kind: HubKind; className?: string }) {
  const k = hubKind(kind);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${k.badge} ${className}`}
    >
      <span className={`h-2 w-2 rounded-full ${k.dot}`} />
      {k.label}
    </span>
  );
}

/** "הזמנה חדשה" → which kind? Three big coloured buttons. */
export function HubKindChooser({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (kind: HubKind) => void;
}) {
  const descriptions: Record<HubKind, string> = {
    newborn: "חבילת ניו-בורן, תוספות, גלריה וחוזה",
    outdoor: "חבילת צילומי חוץ, חוזה, שיחת סטיילינג",
    studio: "חבילה מותאמת אישית — משריינת את הסטודיו ביומן",
    general: "צילום עם מיכל או סטודיו בלבד: מסירת תמונות, בחירה ועיבוד",
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>איזו הזמנה לפתוח?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {HUB_KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => onPick(k.key)}
              className={`${k.scope} flex w-full items-center gap-3 rounded-2xl border border-primary/20 bg-cream p-4 text-right transition hover:shadow-md`}
            >
              <span className={`h-10 w-10 shrink-0 rounded-full ${k.dot}`} />
              <span className="flex-1">
                <span className="block font-display text-lg text-primary">{k.label}</span>
                <span className="block text-xs text-muted-foreground">{descriptions[k.key]}</span>
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CardActions({
  row,
  onEdit,
  onDelete,
}: {
  row: HubRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const wa = whatsappLink(
    row.phone,
    row.date
      ? `היי ${row.name}, תזכורת לצילום ב-${formatDateIL(row.date)}${row.time ? ` בשעה ${row.time}` : ""} 💗`
      : undefined,
  );
  return (
    <div className="flex items-center gap-1">
      <span className="font-display text-xl text-primary ml-1">₪{row.total}</span>
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noreferrer"
          title="וואטסאפ"
          className="flex h-8 w-8 items-center justify-center rounded-full text-emerald-600 hover:bg-emerald-50"
        >
          <MessageCircle className="h-3.5 w-3.5" />
        </a>
      )}
      <button
        type="button"
        onClick={onEdit}
        title="עריכה"
        aria-label="עריכה"
        className="flex h-8 w-8 items-center justify-center rounded-full text-primary hover:bg-primary/10"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        title="מחיקה"
        aria-label="מחיקה"
        className="flex h-8 w-8 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ContactLine({ row }: { row: HubRow }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1" dir="ltr">
        <Phone className="h-3 w-3" /> {row.phone}
      </span>
      {row.email && (
        <span className="flex items-center gap-1" dir="ltr">
          <Mail className="h-3 w-3" /> {row.email}
        </span>
      )}
      {row.date && (
        <span className="flex items-center gap-1">
          <CalendarDays className="h-3 w-3" /> {formatDateIL(row.date)}
          {row.time ? ` · ${row.time}` : ""}
        </span>
      )}
    </div>
  );
}

function StepButtons({
  steps,
  order,
  busyStep,
  onToggle,
}: {
  steps: { key: string; label: string }[];
  order: any;
  busyStep: string | null;
  onToggle: (stepKey: string, done: boolean) => void;
}) {
  const doneCount = steps.filter((s) => order[`${s.key}_at`]).length;
  return (
    <>
      <div className="mb-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>
        <span className="whitespace-nowrap text-[11px] text-muted-foreground">
          {doneCount}/{steps.length}
        </span>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {steps.map((step) => {
          const doneAt = order[`${step.key}_at`] as string | null;
          const busy = busyStep === `${order.id}:${step.key}`;
          return (
            <button
              key={step.key}
              type="button"
              disabled={busy}
              onClick={() => onToggle(step.key, !doneAt)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-right text-sm transition-colors ${
                doneAt
                  ? "bg-forest/10 text-forest"
                  : "bg-cream/60 text-muted-foreground hover:bg-cream"
              }`}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : doneAt ? (
                <Check className="h-4 w-4 shrink-0" />
              ) : (
                <Circle className="h-4 w-4 shrink-0" />
              )}
              <span className="flex-1">{step.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/** Outdoor client card — the newborn card's layout without the gallery button, in brown. */
export function OutdoorHubCard({
  row,
  busyStep,
  sendingContract,
  onToggleStep,
  onToggleDeposit,
  onSendContract,
  onEdit,
  onDelete,
}: {
  row: HubRow;
  busyStep: string | null;
  sendingContract: boolean;
  onToggleStep: (stepKey: string, done: boolean) => void;
  onToggleDeposit: () => void;
  onSendContract: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const o = row.raw;
  return (
    <div className={`${hubKind("outdoor").scope} rounded-2xl border border-primary/15 border-r-4 border-r-outdoor-rose bg-card p-5`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-lg text-primary">{row.name}</span>
            <KindBadge kind="outdoor" />
            <Badge variant="secondary">{row.packageName}</Badge>
          </div>
          <ContactLine row={row} />
          {(o.children_count != null || o.children_names) && (
            <div className="mt-1 text-xs text-muted-foreground">
              ילדים: {o.children_count ?? ""}
              {o.children_names ? ` · ${o.children_names}` : ""}
            </div>
          )}
          {o.styling_call_date && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              שיחת סטיילינג: {formatDateIL(o.styling_call_date)}
            </div>
          )}
        </div>
        <CardActions row={row} onEdit={onEdit} onDelete={onDelete} />
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onToggleDeposit}
          className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm transition-colors ${
            o.deposit_paid
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-primary/15 text-muted-foreground hover:bg-primary/5"
          }`}
        >
          {o.deposit_paid ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
          מקדמה שולמה
        </button>
        <button
          type="button"
          onClick={onSendContract}
          disabled={sendingContract}
          title={o.contract_sent_at ? "החוזה כבר נשלח — לחיצה שולחת שוב" : undefined}
          className="flex h-9 items-center gap-1.5 rounded-xl border border-primary/15 px-3 text-sm text-primary transition-colors hover:bg-primary/5 disabled:opacity-60"
        >
          {sendingContract ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileSignature className="h-3.5 w-3.5" />
          )}
          {o.contract_sent_at ? "שליחת חוזה שוב" : "שליחת חוזה"}
        </button>
        {/* The outdoor gallery (photo upload, client selection, steps) lives on its own page. */}
        <Link
          to="/admin/outdoor-packages/$orderId"
          params={{ orderId: String(o.id) }}
          className="flex h-9 items-center gap-1.5 rounded-xl border border-primary/15 px-3 text-sm text-primary transition-colors hover:bg-primary/5"
        >
          <Images className="h-3.5 w-3.5" />
          גלריה
        </Link>
      </div>

      {row.notes && (
        <p className="mb-3 whitespace-pre-line rounded-lg bg-blush/40 p-2 text-xs text-muted-foreground">
          {row.notes}
        </p>
      )}

      <StepButtons
        steps={NEWBORN_TIMELINE_STEPS}
        order={o}
        busyStep={busyStep}
        onToggle={onToggleStep}
      />
    </div>
  );
}

const STUDIO_STEPS = [
  { key: "shoot_done", label: "הצילום בוצע" },
  { key: "payment_done", label: "סיום תשלום" },
];

/** Custom studio package card — beige. Shows whether the studio is currently blocked for this order. */
export function StudioHubCard({
  row,
  busyStep,
  onToggleStep,
  onEdit,
  onDelete,
}: {
  row: HubRow;
  busyStep: string | null;
  onToggleStep: (stepKey: string, done: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const o = row.raw;
  const blocked = !!o.blocking_booking_id && !!o.session_date;
  return (
    <div className={`${hubKind("studio").scope} rounded-2xl border border-primary/15 border-r-4 border-r-studio-rose bg-card p-5`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-lg text-primary">{row.name}</span>
            <KindBadge kind="studio" />
            <Badge variant="secondary">{row.packageName}</Badge>
          </div>
          <ContactLine row={row} />
          <div className="mt-1 text-xs text-muted-foreground">
            משך: {Number(o.duration_hours ?? 2)} שעות
          </div>
        </div>
        <CardActions row={row} onEdit={onEdit} onDelete={onDelete} />
      </div>

      <div
        className={`mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
          blocked ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"
        }`}
      >
        <Lock className="h-4 w-4 shrink-0" />
        {blocked
          ? "הסטודיו משוריין בשעות האלה — אי אפשר להזמין אותו"
          : row.date
            ? "השריון ביומן לא נוצר — נסי לשמור שוב"
            : "אין תאריך — הסטודיו עדיין לא משוריין"}
      </div>

      {row.notes && (
        <p className="mb-3 whitespace-pre-line rounded-lg bg-blush/40 p-2 text-xs text-muted-foreground">
          {row.notes}
        </p>
      )}
      {o.package_description && (
        <p className="mb-3 whitespace-pre-line text-xs text-muted-foreground">
          {o.package_description}
        </p>
      )}

      <StepButtons steps={STUDIO_STEPS} order={o} busyStep={busyStep} onToggle={onToggleStep} />
    </div>
  );
}

const STAGE_TONES: Record<WorkflowStage, string> = {
  booked: "bg-muted text-muted-foreground",
  date_confirmed: "bg-blue-100 text-blue-800",
  proofs_ready: "bg-amber-100 text-amber-800",
  edited_uploaded: "bg-purple-100 text-purple-800",
  album_published: "bg-green-100 text-green-800",
};

/** The label under the name: package tier, or what kind of studio-only client she is. */
export function generalServiceLabel(raw: any, packageLabel: string): string {
  if (raw?.has_package) return packageLabel || "חבילת צילום";
  return raw?.wants_editing === false ? "שליחת תמונות בלבד" : "סטודיו + עיבוד";
}

/**
 * General photo client card — soft green. The full workflow (upload, client selection, album, contract,
 * delivery) lives on the client page, so the card is a compact summary with one button into it.
 */
export function GeneralHubCard({ row, onEdit }: { row: HubRow; onEdit: () => void }) {
  const r = row.raw;
  const stage = (r.stage as WorkflowStage) ?? "booked";
  const sendOnly = !!r.sendOnly;
  return (
    <div className={`${hubKind("general").scope} rounded-2xl border border-primary/15 border-r-4 border-r-general-rose bg-card p-5`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-lg text-primary">{row.name}</span>
            <KindBadge kind="general" />
            <Badge variant="secondary" className="gap-1">
              {sendOnly && <Send className="h-3 w-3" />}
              {row.packageName}
            </Badge>
          </div>
          <ContactLine row={row} />
          {row.notes && <div className="mt-1 text-xs text-muted-foreground">{row.notes}</div>}
        </div>
        <div className="flex items-center gap-2">
          {row.total > 0 && <span className="font-display text-xl text-primary">₪{row.total}</span>}
          <button
            type="button"
            onClick={onEdit}
            title="פתיחת כרטיס הלקוחה"
            aria-label="פתיחת כרטיס הלקוחה"
            className="flex h-8 w-8 items-center justify-center rounded-full text-primary hover:bg-primary/10"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!sendOnly && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STAGE_TONES[stage]}`}>{STAGE_LABELS[stage]}</span>
        )}
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <ImageIcon className="h-3.5 w-3.5" /> {Number(r.photo_count ?? 0)} תמונות
        </span>
        {row.total > 0 && (
          <span className={`text-xs ${hubBalance(row) > 0 ? "text-destructive" : "text-forest"}`}>
            {hubBalance(row) > 0 ? `יתרה ₪${hubBalance(row)}` : "שולם במלואו"}
          </span>
        )}
        <Button asChild size="sm" variant="outline" className="mr-auto h-9 gap-1.5 rounded-xl">
          <Link to="/admin/photo-clients/$bookingId" params={{ bookingId: row.id }}>
            <Images className="h-3.5 w-3.5" />
            כרטיס לקוחה וגלריה
          </Link>
        </Button>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof Wallet;
  value: string;
  label: string;
  tone?: "warn";
}) {
  return (
    <div className="rounded-2xl border border-primary/10 bg-card p-4">
      <div
        className={`mb-1 font-display text-2xl ${tone === "warn" ? "text-destructive" : "text-primary"}`}
      >
        {value}
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
    </div>
  );
}

/** "מסך ראשי" — balances, upcoming sessions and per-kind counts across every kind in view. */
export function HubDashboardView({
  rows,
  onGoToCalendar,
  onGoToPayments,
  onOpen,
}: {
  rows: HubRow[];
  onGoToCalendar: () => void;
  onGoToPayments: () => void;
  onOpen: (row: HubRow) => void;
}) {
  const today = todayKey();
  const now = new Date();
  const openBalance = rows.reduce((s, r) => s + hubBalance(r), 0);
  const paidThisMonth = rows.reduce((s, r) => {
    if (!r.lastPaymentAt) return s;
    const d = new Date(r.lastPaymentAt);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      ? s + r.paid
      : s;
  }, 0);
  const galleriesCount = rows.filter((r) => r.galleryOpenedAt).length;
  const upcoming = rows
    .filter((r) => r.date && r.date >= today)
    .sort((a, b) => ((a.date as string) < (b.date as string) ? -1 : 1));
  const todayCount = rows.filter((r) => r.date === today).length;
  // Work in progress (shot but not delivered) and the biggest open balances — the two lists the old
  // client-management overview had; they now cover every kind.
  const inProgress = rows
    .filter((r) => hubInProgress(r, today))
    .sort((a, b) => ((a.date ?? "") < (b.date ?? "") ? -1 : 1));
  const openRows = rows
    .filter((r) => hubBalance(r) > 0)
    .sort((a, b) => hubBalance(b) - hubBalance(a));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard
          icon={Wallet2}
          value={`₪${openBalance.toFixed(0)}`}
          label="יתרה פתוחה"
          tone={openBalance > 0 ? "warn" : undefined}
        />
        <StatCard icon={Wallet} value={`₪${paidThisMonth.toFixed(0)}`} label="שולם החודש" />
        <StatCard icon={Images} value={String(galleriesCount)} label="גלריות פתוחות" />
        <StatCard icon={Clock} value={String(upcoming.length)} label="צילומים קרובים" />
        <StatCard icon={CalendarCheck2} value={String(todayCount)} label="צילומים היום" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {HUB_KINDS.map((k) => (
          <div key={k.key} className={`${k.scope} rounded-2xl border border-primary/15 bg-cream p-3 text-center`}>
            <div className="font-display text-xl text-primary">
              {rows.filter((r) => r.kind === k.key).length}
            </div>
            <div className="mt-0.5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <span className={`h-2 w-2 rounded-full ${k.dot}`} /> {k.label}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-primary/10 bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg text-primary">צילומים קרובים</h3>
          <button type="button" onClick={onGoToCalendar} className="text-xs text-primary hover:underline">
            ללוח המלא ←
          </button>
        </div>
        {upcoming.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            אין צילומים עתידיים עם תאריך קבוע.
          </p>
        ) : (
          <div className="space-y-2">
            {upcoming.slice(0, 8).map((r) => (
              <div
                key={`${r.kind}-${r.id}`}
                className="flex items-center justify-between gap-3 rounded-xl bg-blush/25 p-3"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-medium text-primary">{r.name}</span>
                  <KindBadge kind={r.kind} />
                  <Badge variant="secondary" className="text-[10px]">
                    {r.packageName}
                  </Badge>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDateIL(r.date)}
                  {r.time ? ` · ${r.time}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-primary/10 bg-card p-5">
          <h3 className="mb-3 font-display text-lg text-primary">בתהליך עבודה ({inProgress.length})</h3>
          {inProgress.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">אין עבודות פתוחות 🎉</p>
          ) : (
            <div className="space-y-2">
              {inProgress.slice(0, 8).map((r) => (
                <button
                  key={`${r.kind}-${r.id}`}
                  type="button"
                  onClick={() => onOpen(r)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl bg-blush/25 p-3 text-right hover:bg-blush/40"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-medium text-primary">{r.name}</span>
                    <KindBadge kind={r.kind} />
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {r.kind === "general" && r.raw?.stage
                      ? STAGE_LABELS[r.raw.stage as WorkflowStage]
                      : `צולם ${formatDateIL(r.date)}`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-primary/10 bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg text-primary">תשלומים פתוחים ({openRows.length})</h3>
            <button type="button" onClick={onGoToPayments} className="text-xs text-primary hover:underline">
              לכל התשלומים ←
            </button>
          </div>
          {openRows.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">אין יתרות פתוחות 🎉</p>
          ) : (
            <div className="space-y-2">
              {openRows.slice(0, 8).map((r) => (
                <button
                  key={`${r.kind}-${r.id}`}
                  type="button"
                  onClick={() => onOpen(r)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl bg-blush/25 p-3 text-right hover:bg-blush/40"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-medium text-primary">{r.name}</span>
                    <KindBadge kind={r.kind} />
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums text-destructive">₪{hubBalance(r)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniRow({
  row,
  openingGallery,
  onEdit,
  onOpenGallery,
}: {
  row: HubRow;
  openingGallery: boolean;
  onEdit: () => void;
  onOpenGallery: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-blush/25 p-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-primary">{row.name}</span>
          <KindBadge kind={row.kind} />
          <Badge variant="secondary" className="text-[10px]">
            {row.packageName}
          </Badge>
          {row.time && <span className="text-xs text-muted-foreground">{row.time}</span>}
        </div>
        <div className="text-xs text-muted-foreground" dir="ltr">
          {row.phone}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onEdit}
          title="עריכה"
          aria-label="עריכה"
          className="flex h-8 w-8 items-center justify-center rounded-full text-primary hover:bg-primary/10"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {row.kind === "newborn" && (
          <button
            type="button"
            onClick={onOpenGallery}
            disabled={openingGallery}
            title={row.email ? undefined : "יש להוסיף מייל ללקוחה קודם"}
            className="flex h-8 items-center gap-1.5 rounded-full border border-primary/15 px-3 text-xs text-primary hover:bg-primary/5 disabled:opacity-60"
          >
            {openingGallery ? <Loader2 className="h-3 w-3 animate-spin" /> : <Images className="h-3 w-3" />}
            גלריה
          </button>
        )}
      </div>
    </div>
  );
}

/** "יומן יומי" — month picker + the day's sessions of every kind in view. */
export function HubCalendarView({
  rows,
  onEdit,
  onOpenGallery,
  openingGalleryId,
}: {
  rows: HubRow[];
  onEdit: (row: HubRow) => void;
  onOpenGallery: (row: HubRow) => void;
  openingGalleryId: string | null;
}) {
  const [selected, setSelected] = useState<Date | undefined>(new Date());

  const { byDate, scheduledDates } = useMemo(() => {
    const map = new Map<string, HubRow[]>();
    for (const r of rows) {
      if (!r.date) continue;
      const list = map.get(r.date) ?? [];
      list.push(r);
      map.set(r.date, list);
    }
    return {
      byDate: map,
      scheduledDates: Array.from(map.keys()).map((s) => {
        const [y, m, d] = s.split("-").map(Number);
        return new Date(y, m - 1, d);
      }),
    };
  }, [rows]);

  const key = selected
    ? `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}-${String(selected.getDate()).padStart(2, "0")}`
    : "";
  const dayRows = (byDate.get(key) ?? []).sort((a, b) => ((a.time ?? "") < (b.time ?? "") ? -1 : 1));
  const withoutDate = rows.filter((r) => !r.date);

  return (
    <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
      <div className="h-fit w-fit rounded-2xl border border-primary/10 bg-card p-4">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={setSelected}
          locale={he}
          modifiers={{ scheduled: scheduledDates }}
          modifiersClassNames={{ scheduled: "bg-blush text-primary font-medium rounded-full" }}
        />
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-3 w-3 rounded-full bg-blush" /> יום עם צילום קבוע
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-primary/10 bg-card p-5">
          <h3 className="mb-3 font-display text-xl text-primary">
            {selected?.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}
          </h3>
          {dayRows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-primary/15 py-8 text-center text-sm text-muted-foreground">
              אין צילומים ליום זה
            </p>
          ) : (
            <div className="space-y-2">
              {dayRows.map((r) => (
                <MiniRow
                  key={`${r.kind}-${r.id}`}
                  row={r}
                  openingGallery={openingGalleryId === r.id}
                  onEdit={() => onEdit(r)}
                  onOpenGallery={() => onOpenGallery(r)}
                />
              ))}
            </div>
          )}
        </div>

        {withoutDate.length > 0 && (
          <div className="rounded-2xl border border-primary/10 bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-primary">
              בלי תאריך צילום עדיין ({withoutDate.length})
            </h3>
            <div className="space-y-2">
              {withoutDate.map((r) => (
                <MiniRow
                  key={`${r.kind}-${r.id}`}
                  row={r}
                  openingGallery={openingGalleryId === r.id}
                  onEdit={() => onEdit(r)}
                  onOpenGallery={() => onOpenGallery(r)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** "טבלה" for the mixed / outdoor / studio views (newborn alone keeps its detailed table). */
export function HubTableView({ rows }: { rows: HubRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-primary/10 bg-card">
      <table className="w-full min-w-[1000px] text-sm">
        <thead>
          <tr className="border-b border-primary/10 text-right text-xs text-muted-foreground">
            <th className="px-3 py-3 font-medium">סוג</th>
            <th className="px-3 py-3 font-medium">שם</th>
            <th className="px-3 py-3 font-medium">טלפון</th>
            <th className="px-3 py-3 font-medium">מייל</th>
            <th className="px-3 py-3 font-medium">תאריך ושעה</th>
            <th className="px-3 py-3 font-medium">חבילה</th>
            <th className="px-3 py-3 font-medium">סכום</th>
            <th className="px-3 py-3 font-medium">שולם</th>
            <th className="px-3 py-3 font-medium">יתרה</th>
            <th className="px-3 py-3 text-center font-medium">שולם במלואו</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const bal = hubBalance(r);
            return (
              <tr key={`${r.kind}-${r.id}`} className="border-b border-primary/5 last:border-0 hover:bg-cream/40">
                <td className="whitespace-nowrap px-3 py-2.5">
                  <KindBadge kind={r.kind} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-medium text-primary">{r.name}</td>
                <td className="whitespace-nowrap px-3 py-2.5" dir="ltr">
                  {r.phone}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5" dir="ltr">
                  {r.email || "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {r.date ? (
                    <>
                      {formatDateIL(r.date)}
                      {r.time ? <span className="text-muted-foreground"> · {r.time}</span> : null}
                    </>
                  ) : (
                    <span className="text-muted-foreground">טרם נקבע</span>
                  )}
                </td>
                <td className="px-3 py-2.5">{r.packageName || "—"}</td>
                <td className="px-3 py-2.5 tabular-nums">{r.total > 0 ? `₪${r.total}` : "—"}</td>
                <td className="px-3 py-2.5 tabular-nums">₪{r.paid}</td>
                <td className={`px-3 py-2.5 tabular-nums ${bal > 0 ? "font-semibold text-destructive" : "text-forest"}`}>
                  {r.total > 0 ? (bal > 0 ? `₪${bal}` : "שולם") : "—"}
                </td>
                <td className="px-3 py-2.5 text-center">
                  {hubIsPaid(r) ? (
                    <Check className="inline h-4 w-4 text-forest" />
                  ) : (
                    <XIcon className="inline h-4 w-4 text-destructive/70" />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">אין לקוחות להצגה.</p>}
    </div>
  );
}

/**
 * "תשלומים" for every kind. The caller supplies how a payment is saved and how reminder mails are
 * sent (newborn and outdoor have a mail; custom studio orders have none, so no checkbox there).
 */
export function HubPaymentsView({
  rows,
  savePayment,
  sendReminders,
  onSaved,
}: {
  rows: HubRow[];
  savePayment: (row: HubRow, amount: number) => Promise<void>;
  sendReminders: (rows: HubRow[]) => Promise<{ sent: boolean; reason?: string }[]>;
  onSaved: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const keyOf = (r: HubRow) => `${r.kind}:${r.id}`;
  const paidTotal = rows.reduce((s, r) => s + r.paid, 0);
  const openTotal = rows.reduce((s, r) => s + hubBalance(r), 0);

  const toggleSelected = (k: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const sendToSelected = async () => {
    const chosen = rows.filter((r) => selected.has(keyOf(r)));
    if (chosen.length === 0) return toast.error("צריך לבחור לפחות הזמנה אחת");
    setSending(true);
    try {
      const results = await sendReminders(chosen);
      const sentCount = results.filter((r) => r.sent).length;
      const skipped = results.filter((r) => !r.sent);
      if (sentCount > 0) toast.success(`נשלחו ${sentCount} מיילים`);
      if (skipped.length > 0)
        toast.error(`${skipped.length} לא נשלחו: ${skipped.map((s) => s.reason).join(", ")}`, {
          duration: 8000,
        });
      setSelected(new Set());
    } catch (e) {
      toast.error(heError(e, "השליחה נכשלה"));
    } finally {
      setSending(false);
    }
  };

  const save = async (row: HubRow) => {
    const k = keyOf(row);
    const raw = drafts[k];
    const amount = raw === undefined ? row.paid : Number(raw);
    if (Number.isNaN(amount) || amount < 0) return toast.error("סכום לא תקין");
    setSavingKey(k);
    try {
      await savePayment(row, row.total > 0 ? Math.min(amount, row.total) : amount);
      setDrafts((d) => {
        const next = { ...d };
        delete next[k];
        return next;
      });
      onSaved();
    } catch (e) {
      toast.error(heError(e, "השמירה נכשלה"));
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Wallet} value={`₪${paidTotal.toFixed(0)}`} label="שולם סה״כ" />
        <StatCard
          icon={Wallet2}
          value={`₪${openTotal.toFixed(0)}`}
          label="יתרה פתוחה סה״כ"
          tone={openTotal > 0 ? "warn" : undefined}
        />
      </div>

      <div className="flex items-center justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5 rounded-full"
          disabled={sending || selected.size === 0}
          onClick={sendToSelected}
        >
          <Mail className="h-3.5 w-3.5" /> {sending ? "שולח..." : `מייל תשלום ללקוחות (${selected.size})`}
        </Button>
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const k = keyOf(row);
          const shown = drafts[k] ?? String(row.paid);
          const pct = row.total > 0 ? Math.min(100, (row.paid / row.total) * 100) : 0;
          const balance = hubBalance(row);
          const canMail = row.kind !== "studio";
          return (
            <div key={k} className={`${hubKind(row.kind).scope} rounded-2xl border border-primary/15 border-r-4 bg-card p-4 ${hubKind(row.kind).stripe}`}>
              <div className="mb-2 flex flex-wrap items-center gap-3">
                {canMail ? (
                  <Checkbox
                    checked={selected.has(k)}
                    onCheckedChange={() => toggleSelected(k)}
                    disabled={row.total > 0 && balance <= 0}
                  />
                ) : (
                  <span className="w-4" />
                )}
                <span className="font-medium text-primary">{row.name}</span>
                <KindBadge kind={row.kind} />
                <span className="mr-auto text-sm text-muted-foreground">
                  מתוך <span className="font-display text-primary">₪{row.total}</span>
                </span>
              </div>
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full bg-forest transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  value={shown}
                  onChange={(e) => setDrafts((d) => ({ ...d, [k]: e.target.value }))}
                  className="h-9 max-w-[120px]"
                  dir="ltr"
                />
                <Button size="sm" onClick={() => save(row)} disabled={savingKey === k} className="h-9 rounded-full">
                  {savingKey === k ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "שמירה"}
                </Button>
                <span className={`mr-auto text-xs ${balance > 0 ? "text-destructive" : "text-forest"}`}>
                  {row.total <= 0 ? "לא הוגדר סכום" : balance > 0 ? `יתרה ₪${balance}` : "שולם במלואו"}
                </span>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">אין עדיין הזמנות.</p>}
      </div>
    </div>
  );
}

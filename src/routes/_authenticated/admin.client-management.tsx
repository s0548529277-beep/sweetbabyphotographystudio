import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  CalendarDays,
  CalendarPlus,
  Camera,
  Clock,
  Images,
  LayoutDashboard,
  ListChecks,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { fullHebrewDate } from "@/lib/hebrew-date";
import { balanceOf, formatDateIL, shekel, ymd } from "@/lib/client-management";
import { useCmData, type CmData } from "@/components/client-management/data";
import {
  EmptyState,
  Panel,
  SessionRow,
  StatCard,
  StatusBadge,
} from "@/components/client-management/ui";
import { JournalTab, type JournalPreset } from "@/components/client-management/JournalTab";
import { CalendarTab } from "@/components/client-management/CalendarTab";
import { ClientsTab } from "@/components/client-management/ClientsTab";
import { PaymentsTab } from "@/components/client-management/PaymentsTab";
import { SettingsTab } from "@/components/client-management/SettingsTab";

export const Route = createFileRoute("/_authenticated/admin/client-management")({
  component: ClientManagementPage,
});

type Tab = "overview" | "journal" | "calendar" | "clients" | "payments" | "settings";

const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: "overview", label: "מסך ראשי", icon: LayoutDashboard },
  { key: "journal", label: "יומן צילומים", icon: CalendarPlus },
  { key: "calendar", label: "לוח שנה", icon: CalendarDays },
  { key: "clients", label: "לקוחות", icon: Users },
  { key: "payments", label: "תשלומים", icon: Wallet },
  { key: "settings", label: "הגדרות", icon: Settings },
];

function ClientManagementPage() {
  const data = useCmData();
  const [tab, setTab] = useState<Tab>("overview");
  const [preset, setPreset] = useState<JournalPreset | null>(null);

  const book = (p: JournalPreset) => {
    setPreset(p);
    setTab("journal");
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gradient-to-b from-newborn-canvas via-white to-newborn-blush/30"
    >
      <div className="mx-auto max-w-7xl px-4 py-6">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/admin"
              title="חזרה לניהול"
              className="grid h-9 w-9 place-items-center rounded-full border border-newborn-rose/20 text-newborn-ink hover:bg-newborn-blush/50"
            >
              →
            </Link>
            <div>
              <p className="text-xs tracking-[0.25em] text-newborn-gold">
                SWEETBABY · CLIENT STUDIO
              </p>
              <h1 className="font-display text-3xl text-newborn-ink">ניהול לקוחות</h1>
              <p className="text-sm text-newborn-ink/60">{fullHebrewDate(new Date())}</p>
            </div>
          </div>
          <Button
            className="rounded-full bg-newborn-rose text-white shadow-lg shadow-newborn-rose/20 hover:bg-newborn-rose/90"
            onClick={() => book({ date: ymd(new Date()) })}
          >
            <CalendarPlus className="h-4 w-4" /> צילום חדש
          </Button>
        </header>

        <nav className="mb-6 flex gap-1 overflow-x-auto rounded-full border border-newborn-rose/15 bg-white/80 p-1 shadow-sm">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm transition ${
                  active
                    ? "bg-newborn-ink text-white shadow"
                    : "text-newborn-ink/70 hover:bg-newborn-blush/50"
                }`}
              >
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </nav>

        {data.missingTables ? (
          <Panel>
            <div className="space-y-2 text-sm text-newborn-ink">
              <p className="font-medium">כמעט מוכן — צריך להפעיל את טבלאות המערכת במסד הנתונים.</p>
              <p className="text-newborn-ink/70">
                ב-Lovable יופיע עדכון מסד נתונים ממתין (client_management). אשרי אותו פעם אחת,
                ורענני את הדף.
              </p>
            </div>
          </Panel>
        ) : data.error ? (
          <Panel>
            <p className="text-sm text-destructive">
              שגיאה בטעינת הנתונים: {String((data.error as any)?.message ?? data.error)}
            </p>
          </Panel>
        ) : data.loading ? (
          <EmptyState>טוענת יומן ולקוחות…</EmptyState>
        ) : (
          <>
            {tab === "overview" && <Overview data={data} onTab={setTab} onBook={book} />}
            {tab === "journal" && (
              <JournalTab data={data} preset={preset} onPresetUsed={() => setPreset(null)} />
            )}
            {tab === "calendar" && <CalendarTab data={data} onPickDay={(date) => book({ date })} />}
            {tab === "clients" && <ClientsTab data={data} onBook={book} />}
            {tab === "payments" && <PaymentsTab data={data} />}
            {tab === "settings" && <SettingsTab data={data} />}
          </>
        )}
      </div>
    </div>
  );
}

function Overview({
  data,
  onTab,
  onBook,
}: {
  data: CmData;
  onTab: (t: Tab) => void;
  onBook: (p: JournalPreset) => void;
}) {
  const today = ymd(new Date());
  const weekAhead = ymd(new Date(Date.now() + 7 * 86400_000));
  const active = data.sessions.filter((s) => s.status !== "cancelled");
  const todays = active.filter((s) => s.session_date === today);
  const upcoming = active.filter((s) => s.session_date > today && s.session_date <= weekAhead);
  const inProgress = active.filter((s) => ["shot", "selecting", "editing"].includes(s.status));
  const openAccounts = data.accounts
    .filter((a) => balanceOf(a) > 0)
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  const openTotal = openAccounts.reduce((s, a) => s + balanceOf(a), 0);
  const needsReminder = active.filter(
    (s) =>
      s.session_date >= today &&
      s.status === "scheduled" &&
      !s.reminder_sent_at &&
      !data.clientById.get(s.client_id)?.email,
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          icon={<Camera className="h-4 w-4" />}
          label="צילומים היום"
          value={todays.length}
          tone="rose"
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="ב-7 הימים הקרובים"
          value={upcoming.length}
          tone="gold"
        />
        <StatCard
          icon={<ListChecks className="h-4 w-4" />}
          label="בתהליך עבודה"
          value={inProgress.length}
          hint="צולם · בחירה · עיבוד"
          tone="ink"
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="לקוחות"
          value={data.clients.length}
          tone="sage"
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="יתרה פתוחה"
          value={shekel(openTotal)}
          tone="rose"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="צילומים היום"
          action={
            <Button size="sm" variant="ghost" onClick={() => onBook({ date: today })}>
              + קביעה להיום
            </Button>
          }
        >
          <div className="space-y-2">
            {todays.length ? (
              todays.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  client={data.clientById.get(s.client_id)}
                  compact
                />
              ))
            ) : (
              <EmptyState>אין צילומים היום ☕</EmptyState>
            )}
          </div>
        </Panel>
        <Panel
          title="השבוע הקרוב"
          action={
            <Button size="sm" variant="ghost" onClick={() => onTab("calendar")}>
              ללוח ›
            </Button>
          }
        >
          <div className="space-y-2">
            {upcoming.length ? (
              upcoming.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  client={data.clientById.get(s.client_id)}
                  compact
                />
              ))
            ) : (
              <EmptyState>אין צילומים בשבוע הקרוב</EmptyState>
            )}
          </div>
        </Panel>
        <Panel
          title="בתהליך עבודה"
          action={
            <Button size="sm" variant="ghost" asChild>
              <Link to="/admin/photo-clients">
                <Images className="h-4 w-4" /> לגלריות
              </Link>
            </Button>
          }
        >
          <div className="space-y-2">
            {inProgress.length ? (
              inProgress.map((s) => {
                const c = data.clientById.get(s.client_id);
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-2xl border border-newborn-rose/10 bg-white px-4 py-2.5"
                  >
                    <div>
                      <div className="text-sm font-medium text-newborn-ink">{c?.full_name}</div>
                      <div className="text-xs text-newborn-ink/50">
                        {s.session_type} · צולם {formatDateIL(s.session_date)}
                      </div>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                );
              })
            ) : (
              <EmptyState>
                אין עבודות פתוחות. כשמסמנים צילום כ״צולם״ הוא יופיע כאן עד המסירה.
              </EmptyState>
            )}
          </div>
        </Panel>
        <Panel
          title="תשלומים פתוחים"
          action={
            <Button size="sm" variant="ghost" onClick={() => onTab("payments")}>
              לכל החשבונות ›
            </Button>
          }
        >
          <div className="space-y-2">
            {openAccounts.length ? (
              openAccounts.slice(0, 6).map((a) => {
                const c = data.clientById.get(a.client_id);
                const overdue = a.due_date && a.due_date < today;
                return (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-2 rounded-2xl border border-newborn-rose/10 bg-white px-4 py-2.5"
                  >
                    <div>
                      <div className="text-sm font-medium text-newborn-ink">{c?.full_name}</div>
                      <div
                        className={`text-xs ${overdue ? "font-medium text-destructive" : "text-newborn-ink/50"}`}
                      >
                        {a.title}
                        {a.due_date ? ` · עד ${formatDateIL(a.due_date)}` : ""}
                      </div>
                    </div>
                    <span className="font-semibold text-newborn-rose tabular-nums">
                      {shekel(balanceOf(a))}
                    </span>
                  </div>
                );
              })
            ) : (
              <EmptyState>אין יתרות פתוחות 🎉</EmptyState>
            )}
          </div>
        </Panel>
      </div>

      <Panel
        title="👶 צילומי ניו-בורן קרובים"
        action={
          <Button size="sm" variant="ghost" asChild>
            <Link to="/admin/newborn-packages">ללקוחות ניו-בורן ›</Link>
          </Button>
        }
      >
        {(() => {
          const nb = data.newborn.filter((o) => o.session_date && o.session_date >= today).slice(0, 8);
          return nb.length ? (
            <div className="grid gap-2 md:grid-cols-2">
              {nb.map((o) => (
                <Link
                  key={o.id}
                  to="/admin/newborn-packages/$orderId"
                  params={{ orderId: o.id }}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-amber-200/60 bg-amber-50/50 px-4 py-2.5 hover:bg-amber-50"
                >
                  <div>
                    <div className="text-sm font-medium text-newborn-ink">{o.contact_name}</div>
                    <div className="text-xs text-newborn-ink/55">
                      {formatDateIL(o.session_date)}
                      {o.session_time ? ` · ${o.session_time.slice(0, 5)}` : ""}
                    </div>
                  </div>
                  {Number(o.total_price ?? 0) > Number(o.amount_paid ?? 0) && (
                    <span className="text-sm font-semibold tabular-nums text-newborn-rose">
                      {shekel(Number(o.total_price ?? 0) - Number(o.amount_paid ?? 0))}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState>אין צילומי ניו-בורן קרובים</EmptyState>
          );
        })()}
      </Panel>

      {needsReminder.length > 0 && (
        <Panel title="⚠️ לא יקבלו תזכורת אוטומטית">
          <p className="mb-2 text-sm text-newborn-ink/60">
            לצילומים האלה אין מייל ללקוחה — אפשר להוסיף מייל או לשלוח תזכורת בוואטסאפ:
          </p>
          <div className="space-y-2">
            {needsReminder.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                client={data.clientById.get(s.client_id)}
                compact
              />
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  hebrewDayLabel,
  hebrewMonthCaption,
  holidayFor,
  isRestDay,
  statusMeta,
  ymd,
  type CmSession,
} from "@/lib/client-management";
import type { CmData } from "./data";
import { Panel } from "./ui";

const WEEKDAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

export function CalendarTab({
  data,
  onPickDay,
}: {
  data: CmData;
  onPickDay: (date: string) => void;
}) {
  const [view, setView] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(() => new Date());
  const todayStr = ymd(new Date());

  const byDate = useMemo(() => {
    const m = new Map<string, CmSession[]>();
    for (const s of data.sessions) {
      if (s.status === "cancelled") continue;
      const arr = m.get(s.session_date) ?? [];
      arr.push(s);
      m.set(s.session_date, arr);
    }
    return m;
  }, [data.sessions]);

  const days: (Date | null)[] = useMemo(() => {
    if (view === "week") {
      const start = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate() - cursor.getDay(),
      );
      return Array.from(
        { length: 7 },
        (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
      );
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const count = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = Array.from({ length: first.getDay() }, () => null);
    for (let i = 1; i <= count; i++)
      cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), i));
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [view, cursor]);

  const move = (dir: 1 | -1) => {
    setCursor((c) =>
      view === "week"
        ? new Date(c.getFullYear(), c.getMonth(), c.getDate() + 7 * dir)
        : new Date(c.getFullYear(), c.getMonth() + dir, 1),
    );
  };

  const title =
    view === "month"
      ? `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
      : (() => {
          const s = days[0]!;
          const e = days[6]!;
          return `${s.getDate()}.${s.getMonth() + 1} – ${e.getDate()}.${e.getMonth() + 1}.${e.getFullYear()}`;
        })();

  return (
    <Panel>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            className="rounded-full"
            onClick={() => move(-1)}
            aria-label="הקודם"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="min-w-[160px] text-center">
            <div className="font-display text-xl text-newborn-ink">{title}</div>
            <div className="text-xs text-newborn-ink/55">
              {hebrewMonthCaption(cursor.getFullYear(), cursor.getMonth())}
            </div>
          </div>
          <Button
            size="icon"
            variant="outline"
            className="rounded-full"
            onClick={() => move(1)}
            aria-label="הבא"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCursor(new Date())}>
            היום
          </Button>
        </div>
        <div className="flex rounded-full border border-newborn-rose/20 bg-newborn-canvas/50 p-1 text-sm">
          {(["week", "month"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-full px-4 py-1 transition ${view === v ? "bg-newborn-rose text-white shadow" : "text-newborn-ink/70"}`}
            >
              {v === "week" ? "שבוע" : "חודש"}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-3 text-xs text-newborn-ink/50">לחיצה על יום פותחת קביעת צילום לתאריך הזה</p>

      <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-newborn-ink/50">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d, i) => {
          if (!d) return <div key={i} />;
          const key = ymd(d);
          const list = byDate.get(key) ?? [];
          const hol = holidayFor(d);
          const rest = isRestDay(d);
          const isToday = key === todayStr;
          return (
            <button
              key={key}
              onClick={() => onPickDay(key)}
              className={`group flex flex-col rounded-2xl border p-1.5 text-right transition hover:border-newborn-rose/50 hover:shadow-sm ${
                view === "week" ? "min-h-[180px]" : "min-h-[92px]"
              } ${isToday ? "border-newborn-rose bg-newborn-blush/40" : rest ? "border-transparent bg-stone-50" : "border-newborn-rose/10 bg-white"}`}
            >
              <div className="flex items-baseline justify-between gap-1">
                <span
                  className={`text-sm font-semibold ${isToday ? "text-newborn-rose" : "text-newborn-ink"}`}
                >
                  {d.getDate()}
                </span>
                <span className="truncate text-[10px] text-newborn-ink/45">
                  {hebrewDayLabel(d)}
                </span>
              </div>
              {hol && (
                <div
                  className={`truncate text-[10px] font-medium ${rest ? "text-destructive/80" : "text-newborn-gold"}`}
                >
                  {hol}
                </div>
              )}
              <div className="mt-1 space-y-0.5">
                {list.slice(0, view === "week" ? 8 : 3).map((s) => {
                  const c = data.clientById.get(s.client_id);
                  return (
                    <div
                      key={s.id}
                      className={`truncate rounded-md px-1 py-0.5 text-[10px] ${statusMeta(s.status).tone}`}
                      title={`${s.start_time} ${c?.full_name ?? ""} · ${s.session_type}`}
                    >
                      {s.start_time} {c?.full_name ?? ""}
                    </div>
                  );
                })}
                {list.length > (view === "week" ? 8 : 3) && (
                  <div className="text-[10px] text-newborn-ink/50">
                    +{list.length - (view === "week" ? 8 : 3)}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

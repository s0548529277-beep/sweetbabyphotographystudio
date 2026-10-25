import { fromYmd, hebrewDayLabel, holidayFor, isRestDay } from "@/lib/client-management";

/**
 * Hebrew date + holiday/Shabbat + same-day warnings under a date field.
 * `sameDayTimes` = start times of other shoots already on that date.
 */
export function DateHints({
  date,
  sameDayTimes = [],
}: {
  date: string | null | undefined;
  sameDayTimes?: string[];
}) {
  if (!date) return null;
  const d = fromYmd(date);
  if (Number.isNaN(d.getTime())) return null;
  const hol = holidayFor(d);
  const rest = isRestDay(d);
  return (
    <div className="mt-1 text-xs text-newborn-ink/60">
      {hebrewDayLabel(d)}
      {hol && (
        <span className={`ms-2 font-medium ${rest ? "text-destructive" : "text-newborn-gold"}`}>
          · {hol}
        </span>
      )}
      {d.getDay() === 6 && <span className="ms-2 font-medium text-destructive">· שבת</span>}
      {sameDayTimes.length > 0 && (
        <span className="ms-2 text-amber-700">
          · כבר {sameDayTimes.length === 1 ? "יש צילום" : `יש ${sameDayTimes.length} צילומים`} ביום
          הזה ({sameDayTimes.join(", ")})
        </span>
      )}
    </div>
  );
}

/** Confirm before booking on Shabbat/yom tov. Returns false if the admin cancelled. */
export function confirmRestDay(date: string | null | undefined) {
  if (!date) return true;
  const d = fromYmd(date);
  if (!isRestDay(d)) return true;
  return confirm(`התאריך שנבחר הוא ${holidayFor(d) ?? "שבת"}. לקבוע בכל זאת?`);
}

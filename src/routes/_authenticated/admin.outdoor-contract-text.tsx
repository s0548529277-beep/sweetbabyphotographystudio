import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TRAVEL_OPTIONS,
  RETURNING_DISCOUNT_PERCENT,
  buildQuickOutdoorContractHtml,
  quickContractTotals,
  weekdayOfDate,
  type QuickOutdoorInput,
  type TravelOption,
} from "@/lib/outdoorQuickContract";

export const Route = createFileRoute("/_authenticated/admin/outdoor-contract-text")({
  component: OutdoorContractTextAdmin,
});

function todayIso() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function OutdoorContractTextAdmin() {
  const [clientName, setClientName] = useState("");
  const [date, setDate] = useState(todayIso());
  const [weekday, setWeekday] = useState(weekdayOfDate(todayIso()));
  const [time, setTime] = useState("10:00");
  const [packageName, setPackageName] = useState("");
  const [packagePrice, setPackagePrice] = useState("");
  const [deposit, setDeposit] = useState("300");
  const [travel, setTravel] = useState<TravelOption>("none");
  const [returningClient, setReturningClient] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const input: QuickOutdoorInput = useMemo(
    () => ({
      clientName: clientName.trim(),
      weekday,
      date,
      time,
      packageName: packageName.trim(),
      packagePrice: packagePrice.trim() === "" ? null : Number(packagePrice),
      deposit: Number(deposit) || 0,
      travel,
      returningClient,
    }),
    [clientName, weekday, date, time, packageName, packagePrice, deposit, travel, returningClient],
  );

  const generatedHtml = useMemo(() => buildQuickOutdoorContractHtml(input), [input]);
  const totals = quickContractTotals(input);

  // Manual edits live in the DOM; any change in the form regenerates the text.
  const previewRef = useRef<HTMLDivElement>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    setVersion((v) => v + 1);
  }, [generatedHtml]);

  const onDateChange = (v: string) => {
    setDate(v);
    const w = weekdayOfDate(v);
    if (w) setWeekday(w);
  };

  const restoreOriginal = () => {
    if (previewRef.current) previewRef.current.innerHTML = generatedHtml;
    toast.success("הוחזר הנוסח המקורי");
  };

  const downloadPdf = () => {
    const html = previewRef.current?.innerHTML ?? generatedHtml;
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("הדפדפן חסם את החלון — יש לאפשר חלונות קופצים");
      return;
    }
    const title = `חוזה צילומי חוץ${input.clientName ? ` - ${input.clientName}` : ""}`;
    w.document.write(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${title}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;margin:28px;color:#5a4433;background:#fff}
        @page{margin:14mm}
      </style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  return (
    <div dir="rtl" className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-display text-2xl text-primary">חוזה צילומי חוץ</h2>
          <p className="text-sm text-muted-foreground">
            ממלאים את הפרטים והחוזה נכתב אוטומטית. אפשר לערוך ולהוריד PDF.
          </p>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-primary/10 p-4 sm:p-5 space-y-4">
        <h3 className="font-semibold text-sm">מילוי מהיר לפני שליחה ללקוחה</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="שם הלקוחה">
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="למשל: רחלי" />
          </Field>
          <Field label="יום הצילום">
            <Input value={weekday} onChange={(e) => setWeekday(e.target.value)} />
          </Field>
          <Field label="תאריך">
            <Input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} />
          </Field>
          <Field label="שעה">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label="שם החבילה">
            <Input value={packageName} onChange={(e) => setPackageName(e.target.value)} placeholder="למשל: פופולרית" />
          </Field>
          <Field label="מחיר החבילה (ש״ח)">
            <Input
              type="number"
              inputMode="numeric"
              value={packagePrice}
              onChange={(e) => setPackagePrice(e.target.value)}
            />
          </Field>
          <Field label="מקדמה (ש״ח)">
            <Input type="number" inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
          </Field>
          <Field label="תוספת נסיעות">
            <select
              value={travel}
              onChange={(e) => setTravel(e.target.value as TravelOption)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {TRAVEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm sm:mt-5">
            <input
              type="checkbox"
              checked={returningClient}
              onChange={(e) => setReturningClient(e.target.checked)}
            />
            לקוחה חוזרת (הנחה {RETURNING_DISCOUNT_PERCENT}%)
          </label>
        </div>
        {totals.base > 0 && (totals.discount > 0 || totals.travel > 0) && (
          <p className="text-sm text-muted-foreground">
            סה״כ לתשלום: <strong className="text-foreground">{totals.total} ש״ח</strong>
            {totals.discount > 0 && <> · הנחה {totals.discount} ש״ח</>}
            {totals.travel > 0 && <> · נסיעות {totals.travel} ש״ח</>}
          </p>
        )}
      </div>

      <div className="bg-card rounded-2xl border border-primary/10 p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={editMode} onChange={(e) => setEditMode(e.target.checked)} />
            מצב עריכה
            <span className="text-xs text-muted-foreground">אפשר ללחוץ על כל טקסט בחוזה ולשנות אותו</span>
          </label>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={restoreOriginal} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> נוסח מקורי
            </Button>
            <Button size="sm" onClick={downloadPdf} className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> הורדת PDF
            </Button>
          </div>
        </div>
        <div
          key={version}
          ref={previewRef}
          contentEditable={editMode}
          suppressContentEditableWarning
          className={`rounded-xl border p-4 sm:p-5 bg-[#f6f0e4] ${editMode ? "ring-2 ring-primary/30" : ""}`}
          dangerouslySetInnerHTML={{ __html: generatedHtml }}
        />
        <p className="text-xs text-muted-foreground">
          שינוי בפרטי הטופס כותב את החוזה מחדש וימחק עריכות ידניות. בחלון ההדפסה יש לבחור ״שמירה כ-PDF״.
        </p>
      </div>
    </div>
  );
}

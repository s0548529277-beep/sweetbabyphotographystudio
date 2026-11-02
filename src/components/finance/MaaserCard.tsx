import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toCSV, downloadCSV } from "@/lib/csv";
import {
  MAASER_RATE,
  MAASER_OVERRIDES_KEY,
  parseOverrides,
  defaultIncluded,
  isCardSettlement,
  computeMaaser,
  type MaaserTxn,
  type MaaserOverrides,
} from "@/lib/maaser";

const ils = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;
const ils2 = (n: number) =>
  `₪${n.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * מעשר — 10% of (money that entered the account − business bank/credit
 * expenses), with a line-by-line breakdown and a checkbox on every line so
 * the owner decides what counts. Choices are remembered (app_settings key
 * `finance_maaser_overrides`, no migration) and apply to later months too,
 * because each line keeps its own id.
 */
export function MaaserCard({ txns, from, to }: { txns: MaaserTxn[]; from: string; to: string }) {
  const qc = useQueryClient();

  const overridesQ = useQuery({
    queryKey: ["maaser-overrides"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", MAASER_OVERRIDES_KEY).maybeSingle();
      return parseOverrides(data?.value);
    },
  });
  const overrides: MaaserOverrides = overridesQ.data ?? {};

  const saveOverrides = async (next: MaaserOverrides) => {
    qc.setQueryData(["maaser-overrides"], next);
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: MAASER_OVERRIDES_KEY, value: JSON.stringify(next), updated_at: new Date().toISOString() });
    if (error) {
      toast.error(`שמירת הבחירה נכשלה: ${error.message}`);
      qc.invalidateQueries({ queryKey: ["maaser-overrides"] });
    }
  };

  const inRange = useMemo(
    () => txns.filter((t) => (!from || t.date >= from) && (!to || t.date <= to)),
    [txns, from, to],
  );

  const included = (t: MaaserTxn) => overrides[t.id] ?? defaultIncluded(t);

  const result = useMemo(
    () => computeMaaser(inRange, (t) => overrides[t.id] ?? defaultIncluded(t)),
    [inRange, overrides],
  );

  const setIncluded = (ids: string[], value: boolean) => {
    const next = { ...overrides };
    for (const id of ids) next[id] = value;
    void saveOverrides(next);
  };

  const exportCsv = () => {
    const rows = [...inRange]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => ({
        date: t.date,
        kind: t.kind === "income" ? "הכנסה" : "הוצאה",
        scope: t.isPersonal ? "אישי" : "עסק",
        title: t.title,
        amount: t.amount,
        included: included(t) ? "כן" : "לא",
      }));
    downloadCSV(
      `maaser-${from || "all"}-${to || "now"}.csv`,
      toCSV(rows, [
        { key: "date", label: "תאריך" },
        { key: "kind", label: "סוג" },
        { key: "scope", label: "אישי/עסק" },
        { key: "title", label: "תיאור" },
        { key: "amount", label: "סכום" },
        { key: "included", label: "נכלל במעשר" },
      ]),
    );
  };

  return (
    <div className="bg-card rounded-2xl border border-primary/5 p-5 space-y-4" dir="rtl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display text-lg">חישוב מעשר ({Math.round(MAASER_RATE * 100)}% לצדקה)</h3>
          <p className="text-xs text-muted-foreground mt-1">
            כסף שנכנס דרך הבנק (אישי ועסקי) פחות הוצאות העסק (אשראי וכלליות), בטווח התאריכים שמוצג למעלה. מסמנים ✓ על כל
            שורה שנכלל בחישוב, והבחירה נשמרת גם לחודשים הבאים.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv}>
          ייצוא לאקסל
        </Button>
      </div>

      <div className="grid sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-primary/10 p-4">
          <div className="text-xs text-muted-foreground mb-1">כסף שנכנס לבנק</div>
          <div className="font-display text-2xl">{ils2(result.income)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            עסק {ils(result.incomeBusiness)} · אישי {ils(result.incomePersonal)}
          </div>
        </div>
        <div className="rounded-xl border border-primary/10 p-4">
          <div className="text-xs text-muted-foreground mb-1">הוצאות עסק (אשראי וכלליות)</div>
          <div className="font-display text-2xl">{ils2(result.expenses)}</div>
        </div>
        <div className="rounded-xl border border-primary/10 p-4">
          <div className="text-xs text-muted-foreground mb-1">נטו</div>
          <div className="font-display text-2xl">{ils2(result.net)}</div>
        </div>
        <div className="rounded-xl border border-primary/40 ring-1 ring-primary/20 p-4">
          <div className="text-xs text-muted-foreground mb-1">מעשר ({Math.round(MAASER_RATE * 100)}%)</div>
          <div className="font-display text-2xl">{ils2(result.maaser)}</div>
        </div>
      </div>

      {result.net <= 0 && (
        <p className="text-xs rounded-md bg-primary/5 px-3 py-2">
          בטווח הזה ההוצאות המסומנות גבוהות מההכנסות (או שוות להן), ולכן אין מעשר לחישוב.
        </p>
      )}

      {(["income", "expense"] as const).map((kind) => {
        const lines = result.lines.filter((l) => l.t.kind === kind).sort((a, b) => b.t.date.localeCompare(a.t.date));
        const ids = lines.map((l) => l.t.id);
        return (
          <div key={kind} className="border border-primary/10 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between gap-2 bg-cream/60 px-3 py-2 text-sm flex-wrap">
              <span className="font-medium">
                {kind === "income" ? "הכנסות שנכנסו לבנק" : "הוצאות"} —{" "}
                {ils2(kind === "income" ? result.income : result.expenses)} (נכללו {lines.filter((l) => l.on).length} מתוך{" "}
                {lines.length})
              </span>
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setIncluded(ids, true)}>
                  סימון הכל
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setIncluded(ids, false)}>
                  ביטול הכל
                </Button>
              </span>
            </div>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <tbody>
                  {lines.map(({ t, on }) => (
                    <tr key={t.id} className={`border-t border-primary/5 ${on ? "" : "text-muted-foreground"}`}>
                      <td className="p-2 w-8 text-center">
                        <Checkbox checked={on} onCheckedChange={(v) => setIncluded([t.id], !!v)} />
                      </td>
                      <td className="p-2 whitespace-nowrap">{t.date}</td>
                      <td className="p-2 max-w-[280px] truncate" title={t.title}>
                        {t.title}
                        <Tag>{t.isPersonal ? "אישי" : "עסק"}</Tag>
                        {kind === "expense" && isCardSettlement(t) && <Tag>חיוב כרטיס — הפירוט באשראי</Tag>}
                        {kind === "income" && t.depositStatus === "pending" && <Tag>עוד לא שולם</Tag>}
                        {kind === "income" && t.paymentMethod === "cash" && <Tag>מזומן — לא נכנס לבנק</Tag>}
                        {kind === "expense" && t.unpaid && <Tag>חוב שלא שולם</Tag>}
                      </td>
                      <td className="p-2 whitespace-nowrap text-left">{ils2(t.amount)}</td>
                    </tr>
                  ))}
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-muted-foreground">
                        אין שורות בטווח הזה
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">
        מעשר = {Math.round(MAASER_RATE * 100)}% × (כסף שנכנס {ils2(result.income)} − הוצאות {ils2(result.expenses)}) ={" "}
        <span className="font-medium text-foreground">{ils2(result.maaser)}</span>
      </p>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="mr-2 text-[11px] rounded bg-primary/10 px-1.5 py-0.5">{children}</span>;
}

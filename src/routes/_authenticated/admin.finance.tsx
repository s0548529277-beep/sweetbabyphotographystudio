import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Trash2,
  TrendingUp,
  TrendingDown,
  Wallet,
  Search,
  Clock3,
  PieChart,
  HandCoins,
  AlertCircle,
  FileSpreadsheet,
  Repeat,
} from "lucide-react";
import { readXlsxFirstSheet, isReddishArgb, parseAmountCell, parseDateCell } from "@/lib/xlsx-read";
import { toCSV, downloadCSV } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/admin/finance")({
  component: FinanceAdmin,
});

const TYPE_PROPS = "השכרת אביזרים";
const TYPE_STUDIO = "השכרת סטודיו";
const TYPE_PHOTO = "צילומים בסטודיו";
const INCOME_CATEGORIES = [TYPE_PHOTO, TYPE_STUDIO, TYPE_PROPS, "מכירה", "אחר"];
const CATEGORIES = ["ציוד", "אביזרים", "שכירות", "פרסום", "משלוחים", "אחר"];

const monthKey = (d: string) => d.slice(0, 7);
const ils = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;
const monthLabel = (k: string) => {
  const [y, m] = k.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("he-IL", {
    month: "long",
    year: "numeric",
  });
};

/**
 * is_personal is a brand-new column on both expenses and manual_income — if
 * its migration hasn't landed on the live database yet (the usual
 * Lovable/Drizzle regeneration lag), naming it in an insert makes the WHOLE
 * insert fail, which would break adding any row at all, not just personal
 * ones. Retries once without it so the row itself always gets saved;
 * schemaFallback tells the caller the personal/business tag specifically
 * didn't make it, so it can warn rather than claim success silently.
 */
async function insertWithPersonalFallback(
  table: "expenses" | "manual_income",
  rows: Record<string, unknown>[],
): Promise<{ error: { message: string } | null; schemaFallback: boolean }> {
  const first = await (supabase as any).from(table).insert(rows);
  if (!first.error || !/does not exist/i.test(first.error.message ?? "")) {
    return { error: first.error, schemaFallback: false };
  }
  const stripped = rows.map(({ is_personal: _ip, ...rest }) => rest);
  const retry = await (supabase as any).from(table).insert(stripped);
  return { error: retry.error, schemaFallback: !retry.error };
}

type Txn = {
  id: string;
  kind: "income" | "expense";
  type: string;
  title: string;
  client: string;
  date: string;
  amount: number;
  removable: null | "manual_income" | "expenses";
  // Only set for income rows sourced from a real order/booking — manual
  // income and expenses have no deposit to track, so this stays null for
  // them (treated as "not pending" everywhere it's checked).
  depositStatus: string | null;
  // Only set for expense rows recorded as an unpaid debt (see the detailed
  // "הוספת הוצאה/חוב" dialog) — null for income rows and for simple
  // already-paid expenses.
  debt: null | {
    vendorName: string | null;
    vendorEmail: string | null;
    vendorPhone: string | null;
    dueDate: string | null;
  };
  // Only meaningful for expense rows — income is always "business" (there's
  // no such thing as personal income in this tracker). Per explicit
  // request: personal/home expenses are tracked too, not just business
  // ones, but kept filterable so the main totals can still reflect the
  // business's own financial picture.
  isPersonal: boolean;
};

/** Exports exactly the rows currently visible (respects every active filter — date range, type, client search, paid/pending) as a CSV that opens straight into Excel — same toCSV/downloadCSV pattern as the catalog's own export. */
function exportTxnsCSV(rows: Txn[]) {
  const csv = toCSV(
    rows.map((t) => ({
      date: t.date,
      kind: t.kind === "income" ? "הכנסה" : "הוצאה",
      type: t.type,
      title: t.title,
      client: t.client,
      amount: t.amount,
      status: t.depositStatus === "pending" ? "ממתין לתשלום" : t.debt ? "חוב פתוח" : "שולם",
      // "הכל" (the "אישי / עסק" filter set to show both) is what someone
      // would export to actually filter in Excel afterward — a column, not
      // a column she has to re-derive from which export she ran.
      personal: t.isPersonal ? "אישי" : "עסק",
    })),
    [
      { key: "date", label: "תאריך" },
      { key: "kind", label: "סוג" },
      { key: "type", label: "קטגוריה" },
      { key: "title", label: "פירוט" },
      { key: "client", label: "לקוחה" },
      { key: "amount", label: "סכום" },
      { key: "status", label: "סטטוס" },
      { key: "personal", label: "אישי / עסק" },
    ],
  );
  downloadCSV(`כספים-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}

function FinanceAdmin() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: "",
    amount: "",
    category: "אחר",
    spent_on: new Date().toISOString().slice(0, 10),
    is_personal: false,
  });
  const [income, setIncome] = useState({
    title: "",
    amount: "",
    client: "",
    category: TYPE_PHOTO,
    received_on: new Date().toISOString().slice(0, 10),
    is_personal: false,
  });

  // Detailed "add expense / debt" dialog — separate from the quick inline
  // form above, for when the expense is an unpaid debt owed to a supplier
  // and needs contact details to follow up on.
  const [debtOpen, setDebtOpen] = useState(false);
  const emptyDebtForm = {
    title: "",
    amount: "",
    category: "אחר",
    spent_on: new Date().toISOString().slice(0, 10),
    vendor_name: "",
    vendor_email: "",
    vendor_phone: "",
    due_date: "",
    notes: "",
    is_paid: false,
    is_personal: false,
  };
  const [debtForm, setDebtForm] = useState(emptyDebtForm);

  // Recurring monthly expenses (e.g. rent ₪1200/month) — auto-inserted into
  // `expenses` once a month by runDueRecurringExpenses (see
  // recurring-expenses.functions.ts), so she never has to re-type the same
  // expense. This is just the admin list/add/delete UI for defining them.
  const [recurringForm, setRecurringForm] = useState({
    title: "",
    amount: "",
    category: "שכירות",
    day_of_month: "1",
    is_personal: false,
  });

  // Excel import ("הביאי אקסל מהבנק/מהאשראי, מה שאדום זה הוצאה, את בוחרת
  // הכנסה/הוצאה ואישי/עסק") — see src/lib/xlsx-read.ts for the actual .xlsx
  // parsing. Every row from the file is kept (not just the red ones) so a
  // color-detection miss never hides a row she needs — "red" only pre-flags
  // likely expense candidates; nothing is ever imported without her
  // explicitly marking it "אישי" or "עסק" herself (selection stays "none"
  // otherwise, same safety net as before — a row she never touches is never
  // imported, period). "direction" is a separate, orthogonal choice —
  // a bank/credit-card file has both deposits and charges, so every row also
  // needs to be classified as income or expense, independent of personal/
  // business.
  const [importOpen, setImportOpen] = useState(false);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<
    {
      cells: string[];
      isRed: boolean;
      selection: "none" | "personal" | "business";
      direction: "expense" | "income";
    }[]
  >([]);
  const [importDateCol, setImportDateCol] = useState(0);
  const [importDescCol, setImportDescCol] = useState(1);
  const [importAmountCol, setImportAmountCol] = useState(2);
  const [importCategory, setImportCategory] = useState("אחר");
  const [importIncomeCategory, setImportIncomeCategory] = useState(TYPE_PHOTO);
  const [importShowOnlyRed, setImportShowOnlyRed] = useState(true);
  const [importBusy, setImportBusy] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const resetImport = () => {
    setImportHeaders([]);
    setImportRows([]);
  };

  const onImportFileSelected = async (file: File) => {
    try {
      const sheetRows = await readXlsxFirstSheet(file);
      const [headerRow, ...dataRows] = sheetRows;
      if (!headerRow) {
        toast.error("לא נמצאו שורות בקובץ");
        return;
      }
      const headers = headerRow.cells.map((c) => c.value || "");
      setImportHeaders(headers);
      const guessCol = (keywords: string[]) => {
        const idx = headers.findIndex((h) => keywords.some((k) => h.includes(k)));
        return idx >= 0 ? idx : 0;
      };
      setImportDateCol(guessCol(["תאריך"]));
      setImportDescCol(guessCol(["תיאור", "פירוט", "בית העסק", "שם"]));
      setImportAmountCol(guessCol(["סכום", "חיוב", "₪"]));
      const parsedRows = dataRows
        .filter((r) => r.cells.some((c) => c.value.trim() !== ""))
        .map((r) => ({
          cells: r.cells.map((c) => c.value),
          isRed: r.cells.some((c) => isReddishArgb(c.fillArgb)),
          selection: "none" as const,
          direction: "expense" as const,
        }));
      setImportRows(parsedRows);
      // Some exports (e.g. a credit-card statement) never have red-colored
      // rows at all — a file like a bank statement where she marks rows
      // red is the exception, not the rule. Defaulting the "red only"
      // filter to on would just show an empty table in that case, so only
      // default to it when the file actually has red rows to filter to;
      // otherwise she sees every row immediately and picks אישי/עסק herself.
      setImportShowOnlyRed(parsedRows.some((r) => r.isRed));
      setImportOpen(true);
    } catch (err) {
      console.error("[SWEETBABY] xlsx import parse failed", err);
      toast.error("קריאת הקובץ נכשלה — ודאי שזה קובץ אקסל תקין (.xlsx)");
    }
  };

  const setImportRowSelection = (idx: number, selection: "none" | "personal" | "business") => {
    setImportRows((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, selection: r.selection === selection ? "none" : selection } : r)),
    );
  };

  const setImportRowDirection = (idx: number, direction: "expense" | "income") => {
    setImportRows((rows) => rows.map((r, i) => (i === idx ? { ...r, direction } : r)));
  };

  // For a credit-card statement every line is a charge — there's nothing to
  // color red, so marking row by row is pointless. These mark every row at
  // once (and drop the red-only filter so she can see and deselect any
  // exceptions), instead of trying to guess "this looks like a credit
  // file" from the data itself.
  const markAllImportSelection = (selection: "none" | "personal" | "business") => {
    if (selection !== "none") setImportShowOnlyRed(false);
    setImportRows((rows) => rows.map((r) => ({ ...r, selection })));
  };

  const markAllImportDirection = (direction: "expense" | "income") => {
    setImportRows((rows) => rows.map((r) => ({ ...r, direction })));
  };

  const submitImport = async () => {
    const selected = importRows.filter((r) => r.selection !== "none");
    if (selected.length === 0)
      return toast.error("לא נבחרו שורות לייבוא — סמני 'אישי' או 'עסק' על השורות הרצויות");

    const dateFor = (r: (typeof importRows)[number]) =>
      parseDateCell(r.cells[importDateCol]) || new Date().toISOString().slice(0, 10);
    const titleFor = (r: (typeof importRows)[number]) =>
      (r.cells[importDescCol] || "").trim() || "יובא מאקסל";

    const expenseRows = selected
      .filter((r) => r.direction === "expense")
      .map((r) => ({
        title: titleFor(r),
        amount: parseAmountCell(r.cells[importAmountCol]),
        category: importCategory,
        spent_on: dateFor(r),
        notes: "יובא מאקסל",
        is_personal: r.selection === "personal",
      }))
      .filter((r) => r.amount > 0);
    const incomeRows = selected
      .filter((r) => r.direction === "income")
      .map((r) => ({
        title: titleFor(r),
        amount: parseAmountCell(r.cells[importAmountCol]),
        category: importIncomeCategory,
        received_on: dateFor(r),
        notes: "יובא מאקסל",
        is_personal: r.selection === "personal",
      }))
      .filter((r) => r.amount > 0);

    if (expenseRows.length === 0 && incomeRows.length === 0)
      return toast.error("לא נמצא סכום תקין באף שורה שנבחרה — בדקי את מיפוי העמודות");

    setImportBusy(true);
    const [expenseResult, incomeResult] = await Promise.all([
      expenseRows.length > 0
        ? insertWithPersonalFallback("expenses", expenseRows)
        : Promise.resolve({ error: null as { message: string } | null, schemaFallback: false }),
      incomeRows.length > 0
        ? insertWithPersonalFallback("manual_income", incomeRows)
        : Promise.resolve({ error: null as { message: string } | null, schemaFallback: false }),
    ]);
    setImportBusy(false);

    if (expenseResult.error) return toast.error(expenseResult.error.message);
    if (incomeResult.error) return toast.error(incomeResult.error.message);

    const parts: string[] = [];
    if (expenseRows.length > 0) parts.push(`${expenseRows.length} הוצאות`);
    if (incomeRows.length > 0) parts.push(`${incomeRows.length} הכנסות`);
    const summary = parts.join(" ו-");
    if (expenseResult.schemaFallback || incomeResult.schemaFallback) {
      toast.warning(`${summary} יובאו, אבל הסימון אישי/עסק עדיין לא נשמר בחלקן — יש לעדכן שוב בעוד כמה דקות`);
    } else {
      toast.success(`${summary} יובאו`);
    }
    setImportOpen(false);
    resetImport();
    qc.invalidateQueries({ queryKey: ["admin-finance"] });
  };

  // Filters — defaults to the current calendar month (not all history), per
  // explicit request; still fully editable/clearable like any other filter.
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 8) + "01");
  const [to, setTo] = useState("");
  const [client, setClient] = useState("");
  const [type, setType] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | "pending" | "paid">("all");
  // Defaults to "business" so the dashboard totals/charts keep reflecting
  // the business's own financial picture, same as before personal expenses
  // existed at all — personal ones are still tracked, just need an
  // explicit switch to see mixed in with (or instead of) business ones.
  const [personalFilter, setPersonalFilter] = useState<"business" | "personal" | "all">("business");
  // Set by clicking the "סה״כ הכנסות"/"סה״כ הוצאות" summary card — filters
  // the transactions list below to just that kind and scrolls to it, so the
  // total shown on the card is immediately explained by the rows under it.
  const [kindFilter, setKindFilter] = useState<"all" | "income" | "expense">("all");
  const txnsListRef = useRef<HTMLDivElement>(null);
  const focusKind = (k: "income" | "expense") => {
    setKindFilter((prev) => (prev === k ? "all" : k));
    txnsListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const data = useQuery({
    queryKey: ["admin-finance"],
    queryFn: async () => {
      const [ordersRes, bookingsRes, expensesRes, manualRes, newbornRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id,total,status,created_at,scheduled_date,contact_name,contact_phone,deposit_status"),
        // "*" (not an explicit column list) because balance_paid is a
        // brand-new column — see the schema-fallback comment on
        // insertWithPersonalFallback above for why naming a not-yet-deployed
        // column in a .select() breaks the WHOLE query, not just that field.
        supabase.from("bookings").select("*"),
        supabase.from("expenses").select("*").order("spent_on", { ascending: false }),
        supabase.from("manual_income").select("*").order("received_on", { ascending: false }),
        // Newborn-package orders aren't a public booking/order — they're
        // Michal's own internal CRM rows (see newborn_package_orders'
        // migration comment) — but a customer can still owe a balance on
        // one (total_price - amount_paid), so it's pulled in here too for
        // the combined "חובות לקוחות" view below.
        (supabase as any)
          .from("newborn_package_orders")
          .select("id,contact_name,contact_phone,session_date,total_price,amount_paid,created_at"),
      ]);
      if (expensesRes.error) throw expensesRes.error;
      return {
        orders: ordersRes.data ?? [],
        bookings: bookingsRes.data ?? [],
        expenses: expensesRes.data ?? [],
        manual: manualRes.data ?? [],
        newborn: newbornRes.data ?? [],
      };
    },
  });

  const recurringQuery = useQuery({
    queryKey: ["admin-recurring-expenses"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("recurring_expenses")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        title: string;
        amount: number;
        category: string;
        day_of_month: number;
        is_personal: boolean;
        active: boolean;
        last_generated_month: string | null;
      }[];
    },
  });

  const addRecurringExpense = async () => {
    const amount = Number(recurringForm.amount);
    const day = Number(recurringForm.day_of_month);
    if (!recurringForm.title.trim() || !amount) return toast.error("נא למלא תיאור וסכום");
    if (!day || day < 1 || day > 28) return toast.error("יום בחודש צריך להיות בין 1 ל-28");
    const { error } = await (supabase as any).from("recurring_expenses").insert({
      title: recurringForm.title.trim(),
      amount,
      category: recurringForm.category,
      day_of_month: day,
      is_personal: recurringForm.is_personal,
    });
    if (error) return toast.error(error.message);
    toast.success("ההוצאה הקבועה נוספה — תיווצר אוטומטית כל חודש");
    setRecurringForm({ ...recurringForm, title: "", amount: "" });
    qc.invalidateQueries({ queryKey: ["admin-recurring-expenses"] });
  };

  const toggleRecurringActive = async (id: string, active: boolean) => {
    const { error } = await (supabase as any).from("recurring_expenses").update({ active }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-recurring-expenses"] });
  };

  const deleteRecurringExpense = async (id: string) => {
    if (!confirm("למחוק את ההוצאה הקבועה הזו? זה לא ישפיע על הוצאות שכבר נוצרו בעבר.")) return;
    const { error } = await (supabase as any).from("recurring_expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-recurring-expenses"] });
  };

  /** Every income/expense line, normalised so it can be filtered and grouped. */
  const allTxns = useMemo<Txn[]>(() => {
    const out: Txn[] = [];
    for (const o of data.data?.orders ?? []) {
      if (o.status === "cancelled") continue;
      out.push({
        id: `o-${o.id}`,
        kind: "income",
        type: TYPE_PROPS,
        title: `הזמנת אביזרים #${String(o.id).slice(0, 8)}`,
        client: o.contact_name ?? "",
        date: String(o.scheduled_date ?? o.created_at).slice(0, 10),
        amount: Number(o.total ?? 0),
        removable: null,
        depositStatus: (o as { deposit_status?: string | null }).deposit_status ?? null,
        debt: null,
        isPersonal: false,
      });
    }
    for (const b of data.data?.bookings ?? []) {
      if (b.status === "cancelled") continue;
      const isPhoto = b.package === "photography";
      out.push({
        id: `b-${b.id}`,
        kind: "income",
        type: isPhoto ? TYPE_PHOTO : TYPE_STUDIO,
        title: isPhoto ? "סשן צילומים עם מיכל" : "שריון סטודיו",
        client: b.contact_name ?? "",
        date: String(b.session_date ?? b.created_at).slice(0, 10),
        amount: Number(b.price ?? 0),
        removable: null,
        depositStatus: (b as { deposit_status?: string | null }).deposit_status ?? null,
        debt: null,
        isPersonal: false,
      });
    }
    for (const mi of data.data?.manual ?? []) {
      const miAny = mi as typeof mi & { is_personal?: boolean | null };
      out.push({
        id: `m-${mi.id}`,
        kind: "income",
        type: mi.category ?? "אחר",
        title: mi.title,
        client: (mi.notes as string) ?? "",
        date: String(mi.received_on).slice(0, 10),
        amount: Number(mi.amount ?? 0),
        removable: "manual_income",
        depositStatus: null,
        debt: null,
        isPersonal: !!miAny.is_personal,
      });
    }
    for (const e of data.data?.expenses ?? []) {
      const ex = e as typeof e & {
        is_paid?: boolean | null;
        vendor_name?: string | null;
        vendor_email?: string | null;
        vendor_phone?: string | null;
        due_date?: string | null;
        is_personal?: boolean | null;
      };
      out.push({
        id: `e-${e.id}`,
        kind: "expense",
        type: e.category ?? "אחר",
        title: e.title,
        client: (e.notes as string) ?? "",
        date: String(e.spent_on).slice(0, 10),
        amount: Number(e.amount ?? 0),
        removable: "expenses",
        depositStatus: null,
        isPersonal: !!ex.is_personal,
        debt:
          ex.is_paid === false
            ? {
                vendorName: ex.vendor_name ?? null,
                vendorEmail: ex.vendor_email ?? null,
                vendorPhone: ex.vendor_phone ?? null,
                dueDate: ex.due_date ?? null,
              }
            : null,
      });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [data.data]);

  const txns = useMemo(() => {
    const c = client.trim().toLowerCase();
    return allTxns.filter((t) => {
      if (personalFilter === "business" && t.isPersonal) return false;
      if (personalFilter === "personal" && !t.isPersonal) return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (type !== "all" && t.type !== type) return false;
      if (c && !`${t.client} ${t.title}`.toLowerCase().includes(c)) return false;
      if (paymentFilter === "pending" && t.depositStatus !== "pending") return false;
      if (paymentFilter === "paid" && t.depositStatus === "pending") return false;
      return true;
    });
  }, [allTxns, from, to, client, type, paymentFilter, personalFilter]);

  // Further filtered by the income/expense card click — only for the
  // itemized list below, never for the totals/months/category stats above
  // (those always reflect everything the other filters allow, regardless of
  // which card is currently "focused").
  const visibleTxns = useMemo(
    () => (kindFilter === "all" ? txns : txns.filter((t) => t.kind === kindFilter)),
    [txns, kindFilter],
  );

  const months = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        props: number;
        studio: number;
        photo: number;
        manual: number;
        expenses: number;
      }
    >();
    const get = (k: string) => {
      if (!map.has(k))
        map.set(k, { key: k, props: 0, studio: 0, photo: 0, manual: 0, expenses: 0 });
      return map.get(k)!;
    };
    for (const t of txns) {
      const m = get(monthKey(t.date));
      if (t.kind === "expense") m.expenses += t.amount;
      else if (t.type === TYPE_PROPS) m.props += t.amount;
      else if (t.type === TYPE_STUDIO) m.studio += t.amount;
      else if (t.type === TYPE_PHOTO) m.photo += t.amount;
      else m.manual += t.amount;
    }
    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [txns]);

  const totals = useMemo(
    () =>
      txns.reduce(
        (acc, t) => ({
          income: acc.income + (t.kind === "income" ? t.amount : 0),
          expenses: acc.expenses + (t.kind === "expense" ? t.amount : 0),
        }),
        { income: 0, expenses: 0 },
      ),
    [txns],
  );

  // Orders/bookings whose deposit was never actually paid — these still
  // count toward "סה״כ הכנסות" above (that total reflects the value of
  // active, non-cancelled orders regardless of payment), so this is a
  // separate, explicit "money expected but not yet in hand" figure, not a
  // subtraction from it.
  const pending = useMemo(() => {
    const rows = txns.filter((t) => t.kind === "income" && t.depositStatus === "pending");
    return { count: rows.length, total: rows.reduce((s, t) => s + t.amount, 0) };
  }, [txns]);

  // Expenses recorded as unpaid debts (via the detailed "הוספת הוצאה/חוב"
  // dialog) — money owed to suppliers, separate from the deposit-pending
  // income figure above.
  const debts = useMemo(() => {
    const rows = txns.filter((t) => t.kind === "expense" && t.debt);
    return { count: rows.length, total: rows.reduce((s, t) => s + t.amount, 0) };
  }, [txns]);

  /**
   * Money owed TO the studio BY customers — the opposite direction from
   * `debts` above (which is money the studio owes suppliers). Unifies three
   * separate sources that each track payment completely differently:
   *   - props orders: deposit_status === "pending" means the FULL amount is
   *     unpaid (placeOrder takes full payment up front, no deposit split).
   *   - studio bookings: balance_amount (price minus the deposit paid at
   *     booking time) is normally collected in person at the session, but
   *     nothing in this app ever wrote it back to 0 once that happened — so
   *     a new balance_paid column (admin-marked, see markBalancePaid below)
   *     is what distinguishes a real open balance from one already
   *     collected. Reads as "still owed" until explicitly marked, including
   *     on every pre-existing booking (safe default: never hides a real
   *     debt, worst case she has to mark old ones off once).
   *   - newborn-package orders: total_price minus amount_paid (see
   *     newborn-orders.functions.ts's `amount_paid` field) — Michal's own
   *     internal CRM, not a public order/booking, but still real money owed.
   * Deliberately NOT filtered by the date/client/type filters above — an
   * open balance from two months ago is still open, regardless of which
   * month's transactions she's currently looking at.
   */
  const customerDebts = useMemo(() => {
    type Row = {
      id: string;
      source: "props" | "studio" | "newborn";
      name: string;
      phone: string;
      date: string | null;
      amount: number;
    };
    const out: Row[] = [];
    for (const o of data.data?.orders ?? []) {
      const oAny = o as typeof o & { contact_phone?: string | null };
      if (o.status === "cancelled") continue;
      if (o.deposit_status !== "pending") continue;
      const amount = Number(o.total ?? 0);
      if (amount <= 0) continue;
      out.push({
        id: `o-${o.id}`,
        source: "props",
        name: o.contact_name ?? "—",
        phone: oAny.contact_phone ?? "",
        date: o.scheduled_date ?? o.created_at ?? null,
        amount,
      });
    }
    for (const b of data.data?.bookings ?? []) {
      const bAny = b as typeof b & {
        balance_amount?: number | null;
        balance_paid?: boolean | null;
        contact_phone?: string | null;
      };
      if (b.status === "cancelled") continue;
      if (bAny.balance_paid) continue;
      const amount = Number(bAny.balance_amount ?? 0);
      if (amount <= 0) continue;
      out.push({
        id: `b-${b.id}`,
        source: "studio",
        name: b.contact_name ?? "—",
        phone: bAny.contact_phone ?? "",
        date: b.session_date ?? null,
        amount,
      });
    }
    for (const n of data.data?.newborn ?? []) {
      const amount = Number(n.total_price ?? 0) - Number(n.amount_paid ?? 0);
      if (amount <= 0) continue;
      out.push({
        id: `n-${n.id}`,
        source: "newborn",
        name: n.contact_name ?? "—",
        phone: n.contact_phone ?? "",
        date: n.session_date ?? n.created_at ?? null,
        amount,
      });
    }
    return out.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }, [data.data]);

  const customerDebtsTotal = useMemo(
    () => customerDebts.reduce((s, d) => s + d.amount, 0),
    [customerDebts],
  );

  const markBalancePaid = async (bookingId: string) => {
    const { error } = await (supabase as any).from("bookings").update({ balance_paid: true }).eq("id", bookingId);
    if (error) {
      if (/does not exist/i.test(error.message ?? "")) {
        toast.error("העדכון עדיין לא נתמך בבסיס הנתונים — נסי שוב בעוד כמה דקות");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("היתרה סומנה כשולמה");
    qc.invalidateQueries({ queryKey: ["admin-finance"] });
  };

  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of txns)
      if (t.kind === "expense") map.set(t.type, (map.get(t.type) ?? 0) + t.amount);
    return Array.from(map.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [txns]);

  const maxBar = Math.max(
    1,
    ...months.map((m) => Math.max(m.props + m.studio + m.photo + m.manual, m.expenses)),
  );
  const maxExpenseCategory = Math.max(1, ...expenseByCategory.map((e) => e.amount));

  const addExpense = async () => {
    const amount = Number(form.amount);
    if (!form.title.trim() || !amount) return toast.error("נא למלא תיאור וסכום");
    const { error, schemaFallback } = await insertWithPersonalFallback("expenses", [
      {
        title: form.title.trim(),
        amount,
        category: form.category,
        spent_on: form.spent_on,
        is_personal: form.is_personal,
      },
    ]);
    if (error) return toast.error(error.message);
    if (schemaFallback) {
      toast.warning("ההוצאה נוספה, אבל הסימון אישי/עסק עדיין לא נשמר — יש לעדכן שוב בעוד כמה דקות");
    } else {
      toast.success("ההוצאה נוספה");
    }
    setForm({ ...form, title: "", amount: "" });
    qc.invalidateQueries({ queryKey: ["admin-finance"] });
  };

  const addDebtExpense = async () => {
    const amount = Number(debtForm.amount);
    if (!debtForm.title.trim() || !amount) return toast.error("נא למלא תיאור וסכום");
    const { error, schemaFallback } = await insertWithPersonalFallback("expenses", [
      {
        title: debtForm.title.trim(),
        amount,
        category: debtForm.category,
        spent_on: debtForm.spent_on,
        notes: debtForm.notes.trim() || null,
        vendor_name: debtForm.vendor_name.trim() || null,
        vendor_email: debtForm.vendor_email.trim() || null,
        vendor_phone: debtForm.vendor_phone.trim() || null,
        due_date: debtForm.due_date || null,
        is_paid: debtForm.is_paid,
        is_personal: debtForm.is_personal,
      },
    ]);
    if (error) return toast.error(error.message);
    if (schemaFallback) {
      toast.warning("הנתון נשמר, אבל הסימון אישי/עסק עדיין לא נשמר — יש לעדכן שוב בעוד כמה דקות");
    } else {
      toast.success(debtForm.is_paid ? "ההוצאה נוספה" : "החוב נוסף");
    }
    setDebtForm(emptyDebtForm);
    setDebtOpen(false);
    qc.invalidateQueries({ queryKey: ["admin-finance"] });
  };

  const addIncome = async () => {
    const amount = Number(income.amount);
    if (!income.title.trim() || !amount) return toast.error("נא למלא תיאור וסכום");
    const { error, schemaFallback } = await insertWithPersonalFallback("manual_income", [
      {
        title: income.title.trim(),
        amount,
        category: income.category,
        notes: income.client.trim() || null,
        received_on: income.received_on,
        is_personal: income.is_personal,
      },
    ]);
    if (error) return toast.error(error.message);
    if (schemaFallback) {
      toast.warning("ההכנסה נוספה, אבל הסימון אישי/עסק עדיין לא נשמר — יש לעדכן שוב בעוד כמה דקות");
    } else {
      toast.success("ההכנסה נוספה");
    }
    setIncome({ ...income, title: "", amount: "", client: "" });
    qc.invalidateQueries({ queryKey: ["admin-finance"] });
  };

  const removeTxn = async (t: Txn) => {
    if (!t.removable) return;
    const realId = t.id.slice(2);
    const { error } = await supabase.from(t.removable).delete().eq("id", realId);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-finance"] });
  };

  const markDebtPaid = async (t: Txn) => {
    if (!t.debt) return;
    const realId = t.id.slice(2);
    const { error } = await supabase.from("expenses").update({ is_paid: true }).eq("id", realId);
    if (error) return toast.error(error.message);
    toast.success("סומן כשולם");
    qc.invalidateQueries({ queryKey: ["admin-finance"] });
  };

  return (
    <div className="space-y-8" dir="rtl">
      <div>
        <h2 className="font-display text-2xl text-primary mb-1">הכנסות והוצאות</h2>
        <p className="text-sm text-muted-foreground">
          כל התנועות במקום אחד — השכרת אביזרים, השכרת סטודיו, צילומים בסטודיו, הכנסות ידניות
          והוצאות.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-2xl border border-primary/5 p-5">
        <div className="flex items-center gap-2 text-sm font-medium mb-3">
          <Search className="h-4 w-4" /> סינון וחיפוש
        </div>
        <div className="grid sm:grid-cols-3 lg:grid-cols-7 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">אישי / עסק</label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={personalFilter}
              onChange={(e) => setPersonalFilter(e.target.value as "business" | "personal" | "all")}
            >
              <option value="business">עסק בלבד</option>
              <option value="personal">אישי בלבד</option>
              <option value="all">הכל</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">מתאריך</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">עד תאריך</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="sm:col-span-2 lg:col-span-2">
            <label className="text-xs text-muted-foreground">חיפוש לפי לקוח / תיאור</label>
            <Input
              placeholder="שם לקוח…"
              value={client}
              onChange={(e) => setClient(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">סוג</label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="all">הכל</option>
              {[TYPE_PROPS, TYPE_STUDIO, TYPE_PHOTO, "מכירה", "אחר", ...CATEGORIES]
                .filter((v, i, a) => a.indexOf(v) === i)
                .map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">סטטוס תשלום</label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as "all" | "pending" | "paid")}
            >
              <option value="all">הכל</option>
              <option value="pending">ממתין לתשלום</option>
              <option value="paid">שולם</option>
            </select>
          </div>
        </div>
        {(from || to || client || type !== "all" || paymentFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => {
              setFrom("");
              setTo("");
              setClient("");
              setType("all");
              setPaymentFilter("all");
            }}
          >
            ניקוי סינון
          </Button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-4">
        {[
          {
            label: "סה״כ הכנסות",
            value: totals.income,
            icon: TrendingUp,
            cls: "text-forest",
            sub: null as string | null,
            kind: "income" as const,
          },
          {
            label: "סה״כ הוצאות",
            value: totals.expenses,
            icon: TrendingDown,
            cls: "text-destructive",
            sub: null,
            kind: "expense" as const,
          },
          {
            label: "רווח נקי",
            value: totals.income - totals.expenses,
            icon: Wallet,
            cls: "text-primary",
            sub: null,
            kind: null,
          },
          {
            label: "ממתין לתשלום",
            value: pending.total,
            icon: Clock3,
            cls: "text-amber-600",
            sub: pending.count > 0 ? `${pending.count} הזמנות ללא מקדמה ששולמה` : "הכל שולם 🎉",
            kind: null,
          },
          {
            label: "חובות לספקים",
            value: debts.total,
            icon: AlertCircle,
            cls: "text-amber-600",
            sub: debts.count > 0 ? `${debts.count} הוצאות שטרם שולמו לספק` : "אין חובות פתוחים 🎉",
            kind: null,
          },
          {
            label: "חובות לקוחות",
            value: customerDebtsTotal,
            icon: HandCoins,
            cls: "text-amber-600",
            sub:
              customerDebts.length > 0
                ? `${customerDebts.length} הזמנות/שריונים עם יתרה פתוחה`
                : "אין יתרות פתוחות מלקוחות 🎉",
            kind: null,
          },
        ].map((c) => (
          <div
            key={c.label}
            onClick={c.kind ? () => focusKind(c.kind) : undefined}
            className={`bg-card rounded-2xl border p-5 transition-colors ${
              c.kind ? "cursor-pointer hover:border-primary/30" : ""
            } ${c.kind && kindFilter === c.kind ? "border-primary/40 ring-1 ring-primary/20" : "border-primary/5"}`}
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <c.icon className="h-4 w-4" /> {c.label}
            </div>
            <div className={`font-display text-3xl ${c.cls}`}>{ils(c.value)}</div>
            {c.sub && <div className="text-xs text-muted-foreground mt-1">{c.sub}</div>}
          </div>
        ))}
      </div>

      <div className="bg-card rounded-2xl border border-primary/5 p-5">
        <h3 className="font-display text-lg mb-4">פירוט לפי חודשים</h3>
        {data.isLoading ? (
          <p className="text-sm text-muted-foreground">טוען…</p>
        ) : months.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין נתונים לסינון הנוכחי.</p>
        ) : (
          <div className="space-y-4">
            {months.map((m) => {
              const inc = m.props + m.studio + m.photo + m.manual;
              const net = inc - m.expenses;
              return (
                <div key={m.key} className="rounded-xl bg-cream/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="font-medium">{monthLabel(m.key)}</div>
                    <div className="text-sm flex gap-4">
                      <span className="text-forest">הכנסות {ils(inc)}</span>
                      <span className="text-destructive">הוצאות {ils(m.expenses)}</span>
                      <span className={net >= 0 ? "text-primary" : "text-destructive"}>
                        נטו {ils(net)}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-2.5 rounded-full bg-forest/15 overflow-hidden">
                      <div
                        className="h-full bg-forest rounded-full"
                        style={{ width: `${(inc / maxBar) * 100}%` }}
                      />
                    </div>
                    <div className="h-2.5 rounded-full bg-destructive/10 overflow-hidden">
                      <div
                        className="h-full bg-destructive rounded-full"
                        style={{ width: `${(m.expenses / maxBar) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    {TYPE_PROPS} {ils(m.props)} · {TYPE_STUDIO} {ils(m.studio)} · {TYPE_PHOTO}{" "}
                    {ils(m.photo)} · ידני {ils(m.manual)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Expense breakdown by category — where the money is actually going, not just the flat monthly total */}
      <div className="bg-card rounded-2xl border border-primary/5 p-5">
        <div className="flex items-center gap-2 text-sm font-medium mb-4">
          <PieChart className="h-4 w-4" /> הוצאות לפי קטגוריה
        </div>
        {expenseByCategory.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין הוצאות לסינון הנוכחי.</p>
        ) : (
          <div className="space-y-3">
            {expenseByCategory.map((e) => (
              <div key={e.category}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>{e.category}</span>
                  <span className="text-muted-foreground tabular-nums">{ils(e.amount)}</span>
                </div>
                <div className="h-2.5 rounded-full bg-destructive/10 overflow-hidden">
                  <div
                    className="h-full bg-destructive rounded-full"
                    style={{ width: `${(e.amount / maxExpenseCategory) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Customer debts — unified view of every open balance a customer owes
          the studio, across the 3 completely separate systems that track
          it (props orders, studio bookings, newborn packages) — see the
          customerDebts memo above for exactly how each source is read. */}
      <div className="bg-card rounded-2xl border border-primary/5 p-5">
        <div className="flex items-center gap-2 text-sm font-medium mb-4">
          <HandCoins className="h-4 w-4" /> חובות לקוחות ({customerDebts.length})
        </div>
        {customerDebts.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין יתרות פתוחות מלקוחות 🎉</p>
        ) : (
          <div className="divide-y divide-primary/5 max-h-[400px] overflow-auto">
            {customerDebts.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate flex items-center gap-2">
                    {d.name}
                    <span
                      className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                        d.source === "props"
                          ? "bg-blue-100 text-blue-700"
                          : d.source === "studio"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-pink-100 text-pink-700"
                      }`}
                    >
                      {d.source === "props" ? "אביזרים" : d.source === "studio" ? "סטודיו" : "ניובורן"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {d.phone && <span dir="ltr">{d.phone} · </span>}
                    {d.date ? new Date(d.date).toLocaleDateString("he-IL") : "—"}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-amber-700 font-medium">{ils(d.amount)}</span>
                  {d.source === "studio" && (
                    <Button variant="outline" size="sm" onClick={() => markBalancePaid(d.id.slice(2))}>
                      סמן יתרה כשולמה
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transactions */}
      <div
        ref={txnsListRef}
        className="bg-card rounded-2xl border border-primary/5 p-5 scroll-mt-4"
      >
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-display text-lg">
            {kindFilter === "income"
              ? "פירוט הכנסות"
              : kindFilter === "expense"
                ? "פירוט הוצאות"
                : "תנועות"}{" "}
            ({visibleTxns.length})
          </h3>
          <div className="flex items-center gap-2">
            {kindFilter !== "all" && (
              <Button variant="ghost" size="sm" onClick={() => setKindFilter("all")}>
                הצג הכל
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="rounded-full gap-1.5"
              onClick={() => exportTxnsCSV(visibleTxns)}
              disabled={visibleTxns.length === 0}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> ייצוא לאקסל
            </Button>
          </div>
        </div>
        <div className="divide-y divide-primary/5 max-h-[520px] overflow-auto">
          {visibleTxns.map((t) => (
            <div key={t.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate flex items-center gap-2">
                  {t.title}
                  {t.client ? (
                    <span className="text-muted-foreground font-normal"> · {t.client}</span>
                  ) : null}
                  {t.depositStatus === "pending" && (
                    <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      ממתין לתשלום
                    </span>
                  )}
                  {t.debt && (
                    <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      חוב
                    </span>
                  )}
                  {t.isPersonal && (
                    <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                      אישי
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(t.date).toLocaleDateString("he-IL")} · {t.type}
                  {t.debt?.vendorName && <> · {t.debt.vendorName}</>}
                  {t.debt?.vendorEmail && <> · {t.debt.vendorEmail}</>}
                  {t.debt?.vendorPhone && <> · {t.debt.vendorPhone}</>}
                  {t.debt?.dueDate && (
                    <> · לתשלום עד {new Date(t.debt.dueDate).toLocaleDateString("he-IL")}</>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={t.kind === "income" ? "text-forest" : "text-destructive"}>
                  {t.kind === "income" ? "+" : "−"}
                  {ils(t.amount)}
                </span>
                {t.debt && (
                  <Button variant="outline" size="sm" onClick={() => markDebtPaid(t)}>
                    סמן כשולם
                  </Button>
                )}
                {t.removable && (
                  <Button variant="ghost" size="icon" onClick={() => removeTxn(t)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {visibleTxns.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">לא נמצאו תנועות.</p>
          )}
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-primary/5 p-5">
        <h3 className="font-display text-lg mb-4">רישום הכנסה ידנית</h3>
        <div className="grid sm:grid-cols-5 gap-3">
          <Input
            placeholder="תיאור (למשל: סשן צילומים)"
            value={income.title}
            onChange={(e) => setIncome({ ...income, title: e.target.value })}
            className="sm:col-span-2"
          />
          <Input
            placeholder="שם לקוח"
            value={income.client}
            onChange={(e) => setIncome({ ...income, client: e.target.value })}
          />
          <Input
            type="number"
            placeholder="סכום"
            value={income.amount}
            onChange={(e) => setIncome({ ...income, amount: e.target.value })}
          />
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={income.category}
            onChange={(e) => setIncome({ ...income, category: e.target.value })}
          >
            {INCOME_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <Input
            type="date"
            value={income.received_on}
            onChange={(e) => setIncome({ ...income, received_on: e.target.value })}
            className="sm:col-span-1"
          />
        </div>
        <div className="flex items-center gap-1 mt-3">
          <Button
            type="button"
            size="sm"
            variant={!income.is_personal ? "default" : "outline"}
            className="h-8 px-3 rounded-full text-xs"
            onClick={() => setIncome({ ...income, is_personal: false })}
          >
            עסק
          </Button>
          <Button
            type="button"
            size="sm"
            variant={income.is_personal ? "default" : "outline"}
            className="h-8 px-3 rounded-full text-xs"
            onClick={() => setIncome({ ...income, is_personal: true })}
          >
            אישי (לבית)
          </Button>
        </div>
        <Button className="mt-3" onClick={addIncome}>
          הוסף הכנסה
        </Button>
      </div>

      <div className="bg-card rounded-2xl border border-primary/5 p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <h3 className="font-display text-lg">רישום הוצאה</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={importFileRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onImportFileSelected(file);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => importFileRef.current?.click()}
            >
              <FileSpreadsheet className="h-4 w-4" /> ייבוא מבנק/אשראי
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setDebtForm(emptyDebtForm);
                setDebtOpen(true);
              }}
            >
              <HandCoins className="h-4 w-4" /> הוספת הוצאה / חוב מפורט
            </Button>
          </div>
        </div>
        <div className="grid sm:grid-cols-5 gap-3">
          <Input
            placeholder="תיאור"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="sm:col-span-2"
          />
          <Input
            type="number"
            placeholder="סכום"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <Input
            type="date"
            value={form.spent_on}
            onChange={(e) => setForm({ ...form, spent_on: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-1 mt-3">
          <Button
            type="button"
            size="sm"
            variant={!form.is_personal ? "default" : "outline"}
            className="h-8 px-3 rounded-full text-xs"
            onClick={() => setForm({ ...form, is_personal: false })}
          >
            עסק
          </Button>
          <Button
            type="button"
            size="sm"
            variant={form.is_personal ? "default" : "outline"}
            className="h-8 px-3 rounded-full text-xs"
            onClick={() => setForm({ ...form, is_personal: true })}
          >
            אישי (לבית)
          </Button>
        </div>
        <Button className="mt-3" onClick={addExpense}>
          הוסף הוצאה
        </Button>
      </div>

      {/* Recurring monthly expenses — define once (e.g. rent ₪1200), and
          runDueRecurringExpenses inserts the real expense row automatically
          every month once its day arrives, so she never re-types it. */}
      <div className="bg-card rounded-2xl border border-primary/5 p-5">
        <div className="flex items-center gap-2 text-sm font-medium mb-4">
          <Repeat className="h-4 w-4" /> הוצאות קבועות (כל חודש)
        </div>
        {recurringQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">טוען…</p>
        ) : (recurringQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground mb-3">אין הוצאות קבועות מוגדרות עדיין.</p>
        ) : (
          <div className="divide-y divide-primary/5 mb-4">
            {(recurringQuery.data ?? []).map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate flex items-center gap-2">
                    {r.title}
                    {!r.active && (
                      <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                        מושבת
                      </span>
                    )}
                    {r.is_personal && (
                      <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        אישי
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.category} · ה-{r.day_of_month} בכל חודש
                    {r.last_generated_month && <> · נוצרה לאחרונה: {monthLabel(r.last_generated_month)}</>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-destructive">{ils(r.amount)}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => toggleRecurringActive(r.id, !r.active)}
                  >
                    {r.active ? "השבתה" : "הפעלה"}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteRecurringExpense(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="grid sm:grid-cols-5 gap-3">
          <Input
            placeholder="תיאור (למשל: שכירות)"
            value={recurringForm.title}
            onChange={(e) => setRecurringForm({ ...recurringForm, title: e.target.value })}
            className="sm:col-span-2"
          />
          <Input
            type="number"
            placeholder="סכום"
            value={recurringForm.amount}
            onChange={(e) => setRecurringForm({ ...recurringForm, amount: e.target.value })}
          />
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={recurringForm.category}
            onChange={(e) => setRecurringForm({ ...recurringForm, category: e.target.value })}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <Input
            type="number"
            min={1}
            max={28}
            placeholder="יום בחודש"
            value={recurringForm.day_of_month}
            onChange={(e) => setRecurringForm({ ...recurringForm, day_of_month: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-1 mt-3">
          <Button
            type="button"
            size="sm"
            variant={!recurringForm.is_personal ? "default" : "outline"}
            className="h-8 px-3 rounded-full text-xs"
            onClick={() => setRecurringForm({ ...recurringForm, is_personal: false })}
          >
            עסק
          </Button>
          <Button
            type="button"
            size="sm"
            variant={recurringForm.is_personal ? "default" : "outline"}
            className="h-8 px-3 rounded-full text-xs"
            onClick={() => setRecurringForm({ ...recurringForm, is_personal: true })}
          >
            אישי (לבית)
          </Button>
        </div>
        <Button className="mt-3" onClick={addRecurringExpense}>
          הוספת הוצאה קבועה
        </Button>
      </div>

      <Dialog open={debtOpen} onOpenChange={setDebtOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>הוספת הוצאה / חוב מפורט</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label>תיאור</Label>
                <Input
                  value={debtForm.title}
                  onChange={(e) => setDebtForm({ ...debtForm, title: e.target.value })}
                  placeholder="למשל: רכישת ציוד תאורה"
                />
              </div>
              <div>
                <Label>סכום</Label>
                <Input
                  type="number"
                  value={debtForm.amount}
                  onChange={(e) => setDebtForm({ ...debtForm, amount: e.target.value })}
                />
              </div>
              <div>
                <Label>קטגוריה</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={debtForm.category}
                  onChange={(e) => setDebtForm({ ...debtForm, category: e.target.value })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>תאריך ההוצאה</Label>
                <Input
                  type="date"
                  value={debtForm.spent_on}
                  onChange={(e) => setDebtForm({ ...debtForm, spent_on: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Checkbox
                  id="debt-is-paid"
                  checked={!debtForm.is_paid}
                  onCheckedChange={(v) => setDebtForm({ ...debtForm, is_paid: !v })}
                />
                <Label htmlFor="debt-is-paid" className="cursor-pointer">
                  זו הוצאה שטרם שולמה (חוב)
                </Label>
              </div>
              <div className="sm:col-span-2 flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={!debtForm.is_personal ? "default" : "outline"}
                  className="h-8 px-3 rounded-full text-xs"
                  onClick={() => setDebtForm({ ...debtForm, is_personal: false })}
                >
                  עסק
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={debtForm.is_personal ? "default" : "outline"}
                  className="h-8 px-3 rounded-full text-xs"
                  onClick={() => setDebtForm({ ...debtForm, is_personal: true })}
                >
                  אישי (לבית)
                </Button>
              </div>
            </div>

            {!debtForm.is_paid && (
              <div className="rounded-xl bg-cream/50 p-4 space-y-3">
                <div className="text-sm font-medium">פרטי הספק / נושה</div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label>שם</Label>
                    <Input
                      value={debtForm.vendor_name}
                      onChange={(e) => setDebtForm({ ...debtForm, vendor_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>טלפון</Label>
                    <Input
                      value={debtForm.vendor_phone}
                      onChange={(e) => setDebtForm({ ...debtForm, vendor_phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>אימייל</Label>
                    <Input
                      type="email"
                      value={debtForm.vendor_email}
                      onChange={(e) => setDebtForm({ ...debtForm, vendor_email: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>לתשלום עד</Label>
                    <Input
                      type="date"
                      value={debtForm.due_date}
                      onChange={(e) => setDebtForm({ ...debtForm, due_date: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <Label>הערות</Label>
              <Textarea
                value={debtForm.notes}
                onChange={(e) => setDebtForm({ ...debtForm, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDebtOpen(false)}>
              ביטול
            </Button>
            <Button onClick={addDebtExpense}>{debtForm.is_paid ? "הוסף הוצאה" : "הוסף חוב"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excel import review — every row from the file, red-highlighted rows
          pre-flagged (not pre-selected) as likely expense candidates; only
          rows she explicitly marks "עסק" get imported. */}
      <Dialog
        open={importOpen}
        onOpenChange={(o) => {
          setImportOpen(o);
          if (!o) resetImport();
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>ייבוא הכנסות והוצאות מבנק/אשראי</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              קובץ בנק/אשראי מכיל גם הפקדות וגם חיובים — לכן לכל שורה יש שתי בחירות נפרדות: "הכנסה" או
              "הוצאה", וגם "אישי" או "עסק". שורות שצבעת באדום בקובץ מסומנות כאן אוטומטית בנקודה אדומה —
              אבל זו רק המלצה (לרוב מתאימה ל"הוצאה"). הייבוא בפועל קורה רק לשורות שמסמנים עליהן "אישי"
              או "עסק" למטה — שורה שלא מסמנים עליה כלום לא תיובא.
            </p>
            <div className="grid sm:grid-cols-5 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">עמודת תאריך</label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={importDateCol}
                  onChange={(e) => setImportDateCol(Number(e.target.value))}
                >
                  {importHeaders.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `עמודה ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">עמודת תיאור</label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={importDescCol}
                  onChange={(e) => setImportDescCol(Number(e.target.value))}
                >
                  {importHeaders.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `עמודה ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">עמודת סכום</label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={importAmountCol}
                  onChange={(e) => setImportAmountCol(Number(e.target.value))}
                >
                  {importHeaders.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `עמודה ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">קטגוריה לשורות הוצאה</label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={importCategory}
                  onChange={(e) => setImportCategory(e.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">קטגוריה לשורות הכנסה</label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={importIncomeCategory}
                  onChange={(e) => setImportIncomeCategory(e.target.value)}
                >
                  {INCOME_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={importShowOnlyRed} onCheckedChange={(v) => setImportShowOnlyRed(!!v)} />
                הצגת שורות מסומנות באדום בלבד ({importRows.filter((r) => r.isRed).length} מתוך{" "}
                {importRows.length})
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">סימון מהיר — אישי/עסק:</span>
                <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => markAllImportSelection("business")}>
                  סימון הכל כעסק
                </Button>
                <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => markAllImportSelection("personal")}>
                  סימון הכל כאישי
                </Button>
                <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => markAllImportSelection("none")}>
                  ביטול הכל
                </Button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">סימון מהיר — הכנסה/הוצאה:</span>
                <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => markAllImportDirection("expense")}>
                  סימון הכל כהוצאה
                </Button>
                <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => markAllImportDirection("income")}>
                  סימון הכל כהכנסה
                </Button>
              </div>
            </div>

            <div className="border border-primary/10 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-cream/60 text-right">
                  <tr>
                    <th className="p-2 font-medium w-8"></th>
                    <th className="p-2 font-medium">{importHeaders[importDateCol] || "תאריך"}</th>
                    <th className="p-2 font-medium">{importHeaders[importDescCol] || "תיאור"}</th>
                    <th className="p-2 font-medium">{importHeaders[importAmountCol] || "סכום"}</th>
                    <th className="p-2 font-medium">הכנסה / הוצאה</th>
                    <th className="p-2 font-medium">אישי / עסק</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((r, i) => {
                    if (importShowOnlyRed && !r.isRed) return null;
                    return (
                      <tr key={i} className={`border-t border-primary/5 ${r.selection !== "none" ? "bg-primary/5" : ""}`}>
                        <td className="p-2 text-center">
                          {r.isRed && <span className="inline-block h-2.5 w-2.5 rounded-full bg-destructive" />}
                        </td>
                        <td className="p-2 whitespace-nowrap">{r.cells[importDateCol] || "—"}</td>
                        <td className="p-2 max-w-[220px] truncate">{r.cells[importDescCol] || "—"}</td>
                        <td className="p-2 whitespace-nowrap">{r.cells[importAmountCol] || "—"}</td>
                        <td className="p-2">
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant={r.direction === "expense" ? "default" : "outline"}
                              className="h-7 px-2.5 rounded-full text-xs"
                              onClick={() => setImportRowDirection(i, "expense")}
                            >
                              הוצאה
                            </Button>
                            <Button
                              size="sm"
                              variant={r.direction === "income" ? "default" : "outline"}
                              className="h-7 px-2.5 rounded-full text-xs"
                              onClick={() => setImportRowDirection(i, "income")}
                            >
                              הכנסה
                            </Button>
                          </div>
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant={r.selection === "personal" ? "default" : "outline"}
                              className="h-7 px-2.5 rounded-full text-xs"
                              onClick={() => setImportRowSelection(i, "personal")}
                            >
                              אישי
                            </Button>
                            <Button
                              size="sm"
                              variant={r.selection === "business" ? "default" : "outline"}
                              className="h-7 px-2.5 rounded-full text-xs"
                              onClick={() => setImportRowSelection(i, "business")}
                            >
                              עסק
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {importRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        אין שורות להצגה
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              ביטול
            </Button>
            <Button onClick={submitImport} disabled={importBusy}>
              {importBusy
                ? "מייבא…"
                : `ייבוא ${importRows.filter((r) => r.selection !== "none").length} שורות`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

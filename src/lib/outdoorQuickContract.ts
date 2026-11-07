import { buildOutdoorContractSections, type ContractSection } from "@/lib/outdoorContract";
import { hebrewDate } from "@/lib/hebrew-date";

/**
 * Contract for צילומי חוץ built from the "מילוי מהיר" form in
 * /admin/outdoor-contract-text. Reuses the fixed clauses of outdoorContract.ts
 * and only swaps/adds the clauses that depend on the form: package details,
 * travel surcharge, returning-client discount and the session date/time.
 */

export const TRAVEL_FEE_40_MIN = 150;
export const RETURNING_DISCOUNT_PERCENT = 10;

export const TRAVEL_OPTIONS = [
  { value: "none", label: "ללא תוספת נסיעה" },
  { value: "far", label: `לוקיישן עד 40 דקות נסיעה — ${TRAVEL_FEE_40_MIN} ש״ח` },
] as const;

export type TravelOption = (typeof TRAVEL_OPTIONS)[number]["value"];

export type QuickOutdoorInput = {
  clientName: string;
  weekday: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  time: string;
  packageName: string;
  packagePrice: number | null;
  deposit: number;
  travel: TravelOption;
  returningClient: boolean;
};

const ROSE = "#c23b6d";
const BROWN = "#5a4433";

export const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export function weekdayOfDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return WEEKDAYS[d.getDay()];
}

export function quickContractTotals(i: QuickOutdoorInput) {
  const base = i.packagePrice ?? 0;
  const discount = i.returningClient ? Math.round((base * RETURNING_DISCOUNT_PERCENT) / 100) : 0;
  const travel = i.travel === "far" ? TRAVEL_FEE_40_MIN : 0;
  return { base, discount, travel, total: base - discount + travel };
}

function p(text: string): string {
  return `<p style="margin:4px 0">${text}</p>`;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

export function buildQuickOutdoorSections(i: QuickOutdoorInput): ContractSection[] {
  const { base, discount, travel, total } = quickContractTotals(i);

  const base_sections = buildOutdoorContractSections({
    contactName: i.clientName,
    sessionDate: i.date || new Date().toISOString().slice(0, 10),
    sessionTime: i.time || null,
    packageName: i.packageName || null,
    packageDescription: null,
    totalPrice: i.packagePrice,
    depositAmount: i.deposit,
    confirmLink: "",
  });

  const heb = i.date ? hebrewDate(`${i.date}T12:00:00`) : "";
  const dateLines = [
    p(
      `הצילומים יתקיימו בעז״ה ביום ${i.weekday || weekdayOfDate(i.date)}, ${formatDate(i.date)}${heb ? ` (${heb})` : ""}`,
    ),
    i.time ? p(`זמן הצילום יתחיל בשעה <strong dir="ltr">${i.time}</strong>`) : "",
    p("יש להגיע 10 דקות קודם לזמן שקבענו"),
  ].join("");

  const priceLines: string[] = [];
  priceLines.push(
    p(
      i.packageName
        ? `סגרנו על חבילת ${i.packageName}${base ? `, בסך ${base} ש״ח` : ""}.`
        : "פרטי החבילה יימסרו בנפרד.",
    ),
  );
  if (i.returningClient && base) {
    priceLines.push(
      p(`כלקוחה חוזרת מגיעה לך הנחה של ${RETURNING_DISCOUNT_PERCENT}% — הנחה של ${discount} ש״ח.`),
    );
  }
  if (travel) priceLines.push(p(`תוספת נסיעות: ${travel} ש״ח.`));
  if (base && (discount || travel)) {
    priceLines.push(p(`<strong>סה״כ לתשלום: ${total} ש״ח.</strong>`));
  }

  const out: ContractSection[] = [];
  for (const s of base_sections) {
    if (s.title === "פרטי החבילה") {
      out.push({ title: s.title, html: priceLines.join("") });
      if (i.travel === "far") {
        out.push({
          title: "תוספת נסיעות",
          html:
            p(
              `לוקיישן שנמצא במרחק נסיעה של עד 40 דקות (למשל עין חמד, חיטים, כלניות, נוריות) כרוך בתוספת של ${TRAVEL_FEE_40_MIN} ש״ח.`,
            ),
        });
      }
    } else if (s.title === "מועד ושעת הצילום") {
      out.push({ title: s.title, html: dateLines });
    } else {
      out.push(s);
    }
  }
  return out;
}

/** The full contract as one HTML block (RTL), used for the preview and the PDF. */
export function buildQuickOutdoorContractHtml(i: QuickOutdoorInput): string {
  const sections = buildQuickOutdoorSections(i);
  const body = sections
    .map(
      (s) => `
      <div style="margin:0 0 18px">
        <h3 style="margin:0 0 6px;color:${ROSE};font-size:17px;font-weight:bold">${s.title}</h3>
        <div style="color:${BROWN};font-size:14px;line-height:1.9">${s.html}</div>
      </div>`,
    )
    .join("");

  return `
    <div dir="rtl" style="font-family:inherit;text-align:right">
      <p style="margin:0 0 4px;color:#8a6a52;font-size:11px;letter-spacing:0.08em">תיאום ציפיות — צילומי חוץ</p>
      <p style="margin:0 0 4px;color:${ROSE};font-size:19px;font-weight:bold">הי ${i.clientName || "יקרה"},</p>
      <p style="margin:0 0 14px;color:${BROWN};font-size:14px;line-height:1.8">שמחה ומתרגשת שבחרת בי לקחת חלק ולתעד את המשפחה שלכם ברגעים מרגשים אלו.</p>
      ${body}
      <p style="margin:18px 0 0;color:${ROSE};font-size:15px;font-weight:bold">שיהיה בהצלחה, באירגונים ובסייעתא דשמיא</p>
      <p style="margin:2px 0 0;color:${BROWN};font-size:14px">מיכל סיבוני</p>
    </div>`;
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const CANONICAL = "https://sweetbabyphotographystudio.lovable.app/terms";
const TITLE = "תנאים והגבלות | Sweetbaby";
const DESCRIPTION = "תנאי השכרת אביזרים ושימוש בסטודיו Sweetbaby. קראו את כללי ההזמנה, הביטול והאחריות לפני השכרה.";

export const Route = createFileRoute("/terms")({
  component: Terms,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: CANONICAL },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "he_IL" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
});

const SECTIONS = [
  {
    title: "השכרת אביזרים",
    items: [
      "מינימום להזמנה 50 ש״ח. התשלום מתבצע לפני איסוף האביזרים.",
      "איסוף והחזרת האביזרים תוך 24 שעות. כל יום נוסף — חיוב השכרה מלא.",
      "איחור מעל 3 שעות מהזמן שנקבע להחזרה — חיוב חצי מסכום ההשכרה.",
      "הלקוחה נושאת באחריות מלאה על האביזרים שבהשכרתה. נזק, אבדן או שבירה יחויבו במחיר המלא של הפריט.",
      "הזמנת אביזרים נחשבת להסכמה לתנאים אלו.",
    ],
  },
  {
    title: "סטודיו Sweetbaby",
    items: [
      "מינימום הזמנה לסטודיו הוא שעה אחת (שתי סלוטים של 30 דקות).",
      "הזמנת סטודיו כוללת שימוש בחלל, הרקעים והאביזרים הבסיסיים המוצעים במסלול שבחרתם.",
      "אביזרים נוספים מעבר למה שכולל במסלול ניתן להזמין דרך קטלוג ההשכרה ולשלם בנפרד.",
    ],
  },
  {
    title: "ביטולים ודחיות",
    items: [
      "ביטול עד יום האירוע — המקדמה לא תוחזר.",
      "ביטול ביום האירוע עצמו — חיוב מלא (100%) מסכום ההזמנה.",
      "השכרת אביזרים שבוטלה לאחר שהפריטים נשלפו מהמלאי — לא תזוכה.",
    ],
  },
  {
    title: "חריגות זמן ותשלומים",
    items: [
      "חריגה של 15–44 דקות מעל הזמן המוזמן — חיוב חצי שעה נוספת.",
      "חריגה של 45 דקות ומעלה — חיוב שעה מלאה נוספת.",
      "התשלום נעשה באמצעות העברה בנקאית לפני קבלת האביזרים או כניסה לסטודיו.",
      "בעתיד תתאפשר גם סליקת אשראי בטוחה דרך Stripe או Meshulam.",
    ],
  },
];

function Terms() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <section className="container-page py-16 md:py-24">
          <div className="max-w-3xl">
            <div className="eyebrow mb-4">Studio Terms</div>
            <h1 className="font-display text-5xl md:text-7xl text-primary leading-none">
              תנאים וה<span className="italic text-peach-deep">גבלות</span>
            </h1>
            <p className="text-muted-foreground mt-6 leading-relaxed">
              דף זה מופעל ומתעדכן על ידי סטודיו Sweetbaby כדי להסביר את כללי השכרת האביזרים ושימוש בסטודיו. מומלץ לקרוא אותו לפני כל הזמנה.
            </p>

            <div className="mt-12 space-y-12">
              {SECTIONS.map((s) => (
                <div key={s.title}>
                  <h2 className="font-display text-2xl md:text-3xl text-primary mb-4">{s.title}</h2>
                  <ul className="space-y-3 text-foreground/90">
                    {s.items.map((item, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="text-peach-deep font-display text-xl leading-none">·</span>
                        <span className="leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-16 pt-8 border-t border-border text-sm text-muted-foreground">
              <p>עודכן לאחרונה: יולי 2026</p>
              <p className="mt-2">
                שאלות? ניתן לפנות אלינו דרך{" "}
                <Link to="/contact" className="underline underline-offset-4 text-foreground hover:text-peach-deep">
                  דף הצור קשר
                </Link>{" "}
                או בטלפון 054-8529277.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

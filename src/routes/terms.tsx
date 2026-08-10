import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PayOnlineButton } from "@/components/PayOnlineButton";
import { CheckSquare } from "lucide-react";

const CANONICAL = "https://sweetbabyphoto.shop/terms";
const TITLE = "תקנון ותנאי שימוש | Sweetbaby";
const DESCRIPTION = "תקנון סטודיו Sweetbaby — מחירון וחישוב שעות, מדיניות תשלום וביטולים, ציוד ותאורה, רקעים, ניקיון, אחריות ונזקים ומדיניות שירות ואספקה.";

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

const SECTIONS: { title: string; items: string[] }[] = [
  {
    title: "מחירון וחישוב שעות",
    items: [
      "שעת השכרה ראשונה: 120 ₪",
      "כל שעה נוספת: 90 ₪",
      "חצי שעה = חצי מהתעריף המתאים",
      "מבצע 8:00–13:00 (ניו-בורן): 3 שעות ב-240 ₪",
      "מינימום הזמנה: שעה (2 חצאי שעות)",
      "עיכוב של 15 דק׳ ומעלה — יחויב כחצי שעה נוספת",
      "עיכוב של 45 דק׳ ומעלה — יחויב כשעה מלאה נוספת",
      "ספירת הזמן כוללת התארגנות וניקיון בסיום",
    ],
  },
  {
    title: "תשלום ומדיניות ביטולים",
    items: [
      "שריון מועד: מקדמה 90 ₪ (לא מוחזרת)",
      "הזמנה ליום ההגעה: תשלום מלא מראש",
      "יתרה: פייבוקס / אשראי / העברה / מזומן בסיום",
      "ביטול/שינוי עד ליום האירוע — המקדמה לא מוחזרת",
      "ביטול ביום האירוע — חיוב מלא (100%)",
    ],
  },
  {
    title: "ציוד ותאורה",
    items: [
      "פלאש Godox AD200 PRO (סוללה נטענת)",
      "משדרים ל-Canon ול-Sony",
      "סופטבוקס בקוטר 1.65 מטר",
      "מיזוג + מפזר חום ייעודי לניו-בורן",
      "שידת החתלה חדשה עם עיטופים ובדים",
      "קופסת ציוד: משדר, סוללה, שוֶשר, דבקים, אטבים",
      "השימוש בפלאש דורש ידע מוקדם",
    ],
  },
  {
    title: "רקעים ורצפות",
    items: [
      "רקעים: ירוק, לבן (2.7), כחול, חום בהיר, חום כהה, צהוב (1.5)",
      "רקעי נייר — לקירות בלבד",
      "שימוש ברקע נייר גם כרצפה: +50 ₪ (יש לתאם מראש)",
      "רקע שהתלכלך/נהרס: 100 ₪ למטר",
      "רצפות ללא תוספת: פורמייקה, עץ, פרקט, קורות עץ",
    ],
  },
  {
    title: "סדר וניקיון",
    items: [
      "הסטודיו נמסר נקי ומסודר — יש להחזירו למצבו המקורי",
      "בלגן/לכלוך משמעותי — חיוב 150 ₪ דמי ניקיון",
      "שירותים בקומה 5, דירה 18",
    ],
  },
  {
    title: "אחריות ונזקים",
    items: [
      "נזק לרכוש: עלות תיקון/רכישה + 20% דמי טיפול",
      "הבטיחות באחריות השוכר/ת בלבד",
      "השארת אור/מזגן דולק — 7 ₪ לשעה עד 8:00 בבוקר למחרת",
      "חפצים שיישכחו מעל 30 יום — יעברו למאגר הסטודיו",
    ],
  },
];

function Terms() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <section className="container-page py-16 md:py-24" dir="rtl">
          <div className="max-w-3xl">
            <div className="eyebrow mb-4">Studio Terms</div>
            <h1 className="font-display text-5xl md:text-7xl text-primary leading-none">
              תקנון ותנאי <span className="italic text-peach-deep">שימוש</span>
            </h1>
            <p className="text-muted-foreground mt-6 leading-relaxed">
              דף זה מרכז את כללי השכרת הסטודיו והאביזרים של Sweetbaby. מומלץ לקרוא אותו לפני כל הזמנה או תשלום.
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

              <div>
                <h2 className="font-display text-2xl md:text-3xl text-primary mb-4">מיקום</h2>
                <p className="leading-relaxed text-foreground/90">תלמוד ירושלמי 24, בית שמש</p>
              </div>

              <div>
                <h2 className="font-display text-2xl md:text-3xl text-primary mb-4">מדיניות שירות ואספקה</h2>
                <p className="leading-relaxed text-foreground/90">
                  השירות ניתן במקום — הלקוח/ה מגיע/ה פיזית לסטודיו בכתובת תלמוד ירושלמי 24, בית שמש, לצורך שימוש
                  בסטודיו ובאביזרים המושכרים. אין משלוח או אספקה מרחוק — כל האיסוף וההחזרה של ציוד/אביזרים מתבצעים
                  במקום, בהתאם למועד ולשעות שסוכמו מראש.
                </p>
              </div>

              <div className="rounded-2xl border border-dashed border-primary/25 bg-cream/40 p-6">
                <div className="text-xs tracking-widest uppercase text-peach-deep mb-2">לעדכן · TODO</div>
                <h2 className="font-display text-2xl text-primary mb-2">מדיניות פרטיות</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  סעיף זה יושלם בהמשך (מומלץ בליווי בדיקה משפטית) ויכלול: אילו פרטים נאספים, לאיזו מטרה, שמירת מידע,
                  שיתוף עם צדדים שלישיים (סליקה, יומן, דיוור) וזכות לעיון/מחיקה.
                </p>
              </div>
            </div>

            {/* Payment + agreement confirmation */}
            <div className="mt-16 rounded-3xl border border-primary/10 bg-card p-7">
              <div className="flex items-start gap-3">
                <CheckSquare className="h-5 w-5 text-peach-deep shrink-0 mt-0.5" />
                <p className="text-sm text-foreground/90 leading-relaxed">
                  אני מאשר/ת שקראתי והבנתי את תנאי השימוש. השימוש בדף התשלום ותשלום מקדמה/השכרה מהווים הסכמה לתקנון זה
                  על כל סעיפיו.
                </p>
              </div>
              <PayOnlineButton className="mt-6" label="תשלום מקדמה / השכרה" />
            </div>

            <div className="mt-12 pt-8 border-t border-border text-sm text-muted-foreground">
              <p>עודכן לאחרונה: אוגוסט 2026</p>
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

import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";

export const Route = createFileRoute("/studio-photography")({
  head: () => ({
    meta: [
      { title: "צילומים בסטודיו עם מיכל סיבוני | Sweetbaby" },
      {
        name: "description",
        content:
          "סשן צילומים בסטודיו עם הצלמת מיכל סיבוני - 300 ₪ לשעה, אופציה לחצי שעה, בניית סטים בתוספת 100 ₪. אפשרות להשכרת אביזרים.",
      },
      { property: "og:title", content: "צילומים בסטודיו עם מיכל סיבוני | Sweetbaby" },
      {
        property: "og:description",
        content: "חבילות צילום בסטודיו: 300 ₪/שעה, אפשרות חצי שעה, בניית סטים +100 ₪.",
      },
      {
        property: "og:url",
        content: "https://sweetbabyphotographystudio.lovable.app/studio-photography",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://sweetbabyphotographystudio.lovable.app/studio-photography",
      },
    ],
  }),
  component: StudioPhotographyPage,
});

const EMAIL_TO = "s0548529277@gmail.com";
const WHATSAPP = "972548529277";

function StudioPhotographyPage() {
  const waLink = (msg: string) =>
    `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`;

  return (
    <>
      <Header />
      <div className="sp-page" dir="rtl">
        <style>{css}</style>

        <header className="sp-header">
          <h1>צילומים בסטודיו</h1>
          <div className="subtitle">עם הצלמת מיכל סיבוני</div>
        </header>

        <div className="sp-container">
          <section className="sp-intro">
            <p>
              סשן צילומים אישי ומקצועי בסטודיו הבוטיק שלנו בבית שמש, בליווי הצלמת
              <b> מיכל סיבוני</b>. אתן מגיעות - אנחנו דואגות לכל השאר: תאורה,
              רקעים, אביזרים והכוונה מלאה במהלך הצילום.
            </p>
          </section>

          <h2 className="section-title">חבילות צילום</h2>
          <div className="sp-grid">
            <div className="sp-card">
              <div className="sp-card-head">
                <h3>שעת צילום</h3>
                <div className="price">
                  300 ₪ <span>/ שעה</span>
                </div>
              </div>
              <ul>
                <li>סשן צילומים מלא עם מיכל סיבוני</li>
                <li>שימוש בציוד ובתאורת הסטודיו</li>
                <li>ליווי מקצועי במהלך הצילום</li>
                <li>מתאים לניו-בורן, גיל שנה, משפחה והיריון</li>
              </ul>
            </div>

            <div className="sp-card featured">
              <div className="sp-card-head">
                <h3>חצי שעת צילום</h3>
                <div className="price">
                  150 ₪ <span>/ חצי שעה</span>
                </div>
              </div>
              <ul>
                <li>סשן קצר וממוקד</li>
                <li>מושלם למיני-סשן או עדכון תמונות</li>
                <li>אותו ליווי מקצועי של מיכל</li>
              </ul>
            </div>

            <div className="sp-card">
              <div className="sp-card-head">
                <h3>תוספת: בניית סטים</h3>
                <div className="price">
                  +100 ₪ <span>/ סט</span>
                </div>
              </div>
              <ul>
                <li>בניית סט מלא לפי נושא</li>
                <li>שילוב רקעים, אביזרים ותאורה מותאמת</li>
                <li>תוספת חד-פעמית מעבר למחיר הבסיס</li>
              </ul>
            </div>
          </div>

          <section className="sp-cta">
            <h3>🧺 זקוקה גם לאביזרים בהשכרה?</h3>
            <p>
              יש לנו קטלוג מלא של אביזרי צילום מעוצבים - סלסלות, כיסויי ראש,
              שמיכות, אביזרים לגיל שנה, לחלאקה ולצילומי חוץ. אפשר לבחור מה
              שמתאים לסשן שלכן ולשלב יחד עם חבילת הצילום.
            </p>
            <Link to="/rental-catalog" className="sp-cta-btn">
              לקטלוג האביזרים ←
            </Link>
          </section>

          <section className="sp-book">
            <h3>לתיאום צילום</h3>
            <p>מוזמנת ליצור קשר במייל או בוואטסאפ ונשריין עבורך מועד:</p>
            <div className="sp-book-actions">
              <a
                href={waLink(
                  "היי מיכל, אשמח לתאם סשן צילומים בסטודיו. תודה!",
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="sp-btn primary"
              >
                שליחת הודעה בוואטסאפ
              </a>
              <a
                href={`mailto:${EMAIL_TO}?subject=${encodeURIComponent(
                  "תיאום סשן צילומים בסטודיו",
                )}`}
                className="sp-btn"
              >
                שליחת מייל
              </a>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

const css = `
.sp-page { --bg:#f5c5b3; --ink:#163126; --white:#fff; background:var(--bg); color:var(--ink); font-family:'Assistant',sans-serif; line-height:1.65; padding-bottom:60px; min-height:100vh; }
.sp-page * { box-sizing:border-box; }
.sp-header { text-align:center; padding:50px 20px 20px; }
.sp-header h1 { font-family:'Platypi',serif; font-size:3.4rem; font-weight:600; }
.sp-header .subtitle { font-size:1.3rem; font-weight:600; margin-top:6px; opacity:0.85; }
.sp-container { max-width:1100px; margin:0 auto; padding:20px; }
.sp-intro { background:var(--white); border-radius:22px; padding:24px 28px; box-shadow:0 8px 32px rgba(22,49,38,0.08); margin-bottom:30px; font-size:1.05rem; }
.sp-page .section-title { text-align:center; font-size:1.9rem; font-weight:700; margin:20px 0 20px; }
.sp-page .section-title::after { content:''; display:block; width:50px; height:3px; background:var(--ink); margin:8px auto 0; border-radius:2px; }
.sp-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:20px; margin-bottom:40px; }
.sp-card { background:var(--white); border-radius:22px; padding:26px; box-shadow:0 8px 32px rgba(22,49,38,0.08); display:flex; flex-direction:column; }
.sp-card.featured { background:var(--ink); color:var(--bg); }
.sp-card-head h3 { font-family:'Platypi',serif; font-size:1.5rem; margin-bottom:6px; }
.sp-card .price { font-size:1.8rem; font-weight:700; margin-bottom:14px; }
.sp-card .price span { font-size:0.9rem; opacity:0.75; font-weight:500; }
.sp-card ul { list-style:none; padding:0; margin:0; }
.sp-card li { padding:6px 0; border-bottom:1px dashed rgba(22,49,38,0.15); font-size:0.95rem; }
.sp-card.featured li { border-color:rgba(245,197,179,0.25); }
.sp-card li:last-child { border-bottom:0; }
.sp-cta { background:var(--white); border-radius:22px; padding:28px; text-align:center; box-shadow:0 8px 32px rgba(22,49,38,0.08); margin-bottom:30px; }
.sp-cta h3 { font-family:'Platypi',serif; font-size:1.5rem; margin-bottom:8px; }
.sp-cta p { margin-bottom:16px; }
.sp-cta-btn { display:inline-block; background:var(--ink); color:var(--bg); padding:12px 26px; border-radius:12px; font-weight:700; text-decoration:none; }
.sp-cta-btn:hover { opacity:0.9; }
.sp-book { background:var(--white); border-radius:22px; padding:28px; text-align:center; box-shadow:0 8px 32px rgba(22,49,38,0.08); }
.sp-book h3 { font-family:'Platypi',serif; font-size:1.6rem; margin-bottom:8px; }
.sp-book-actions { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; margin-top:14px; }
.sp-btn { display:inline-block; padding:12px 22px; border-radius:12px; font-weight:700; text-decoration:none; background:var(--bg); color:var(--ink); }
.sp-btn.primary { background:var(--ink); color:var(--bg); }
.sp-btn:hover { opacity:0.9; }
@media (max-width:768px) { .sp-header h1 { font-size:2.2rem; } }
`;

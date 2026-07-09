import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeImageUrl } from "@/lib/images";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const STUDIO_EMAIL = "s0548529277@gmail.com";
const SCHEDULING_URL =
  "https://calendar.google.com/calendar/appointments/schedules/AcZssZ3s0548529277";

type CatalogItem = { id: string; sku: string; name: string; price: number; image_url: string | null };

const catalogQuery = queryOptions({
  queryKey: ["prop-booking-catalog"],
  queryFn: async () => {
    const { data } = await supabase
      .from("items")
      .select("id, sku, name, price, image_url")
      .eq("active", true)
      .order("sku");
    return (data ?? []) as CatalogItem[];
  },
});

export const Route = createFileRoute("/prop-booking")({
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQuery),
  component: PropBookingPage,
  head: () => ({
    meta: [
      { title: "הזמנת אביזרים | Sweetbaby" },
      { name: "description", content: "קביעת תור ביומן החי של הסטודיו ודיווח אביזרים במייל." },
      { property: "og:title", content: "הזמנת אביזרים | Sweetbaby" },
      { property: "og:description", content: "קביעת תור אוטומטית ביומן, חבילות אביזרים ודיווח שימוש במייל." },
      { property: "og:url", content: "https://sweetbabyphotographystudio.lovable.app/prop-booking" },
    ],
    links: [
      { rel: "canonical", href: "https://sweetbabyphotographystudio.lovable.app/prop-booking" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;600;700&family=Platypi:ital,wght@0,300..800;1,300..800&display=swap" },
    ],
  }),
});

function PropBookingPage() {
  const { data: items } = useSuspenseQuery(catalogQuery);

  const [reportForm, setReportForm] = useState({
    name: "",
    phone: "",
    selectedItems: [] as string[],
  });

  const toggleReportItem = (id: string) =>
    setReportForm((f) => ({
      ...f,
      selectedItems: f.selectedItems.includes(id)
        ? f.selectedItems.filter((x) => x !== id)
        : [...f.selectedItems, id],
    }));

  const submitReport = (e: React.FormEvent) => {
    e.preventDefault();
    const list = reportForm.selectedItems
      .map((id) => items.find((i) => i.id === id))
      .filter(Boolean)
      .map((i) => `• ${i!.name} (${i!.sku}) — ${i!.price}₪`)
      .join("\n");
    const subject = `דיווח שימוש באביזרים — ${reportForm.name}`;
    const body = [
      `דיווח שימוש באביזרים — Sweetbaby 🌸`,
      ``,
      `שם: ${reportForm.name}`,
      `טלפון: ${reportForm.phone}`,
      ``,
      `פריטים שנלקחו מהמדפים:`,
      list || "(לא סומנו פריטים)",
    ].join("\n");
    window.location.href = `mailto:${STUDIO_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <>
      <Header />
      <div className="sb-page">
        <style>{pageCSS}</style>

        <header className="sb-hero">
          <div className="logo-container">
            <h1>Sweetbaby</h1>
            <p className="subtitle">התמונה הראשונה שלי</p>
          </div>
        </header>

        <div className="container">
          <h2 className="section-title">השכרת הסטודיו</h2>
          <div className="grid">
            <div className="card">
              <div className="card-header">
                <h3>שעתי גמיש</h3>
                <p className="price">120 ₪ <span>/ שעה ראשונה</span></p>
              </div>
              <div className="card-body">
                <ul>
                  <li>כל שעה נוספת ב-90 ₪ בלבד</li>
                  <li>מתאים לצילומי משפחה, היריון וילדים</li>
                  <li>גישה מלאה לחלל הסטודיו והתאורה</li>
                </ul>
              </div>
            </div>
            <div className="card">
              <div className="card-header">
                <h3>מבצע בוקר ניו-בורן</h3>
                <p className="price">240 ₪ <span>/ ל-3 שעות</span></p>
              </div>
              <div className="card-body">
                <ul>
                  <li>תקף בין השעות 8:00 ל-13:00 בלבד</li>
                  <li>הזמן המושלם והשקט ביותר לצילומי ניו-בורן</li>
                  <li>חיסכון משמעותי במחיר לשעה</li>
                </ul>
              </div>
            </div>
          </div>

          <h2 className="section-title">חבילות השכרת אביזרים</h2>
          <div className="grid">
            <div className="card">
              <div className="card-header"><h3>חבילת בסיס</h3><p className="price">100 ₪</p></div>
              <div className="card-body"><ul><li>8 אביזרים לבחירה</li><li>כולל אביזר גדול אחד</li></ul></div>
            </div>
            <div className="card">
              <div className="card-header"><h3>חבילת פרימיום</h3><p className="price">150 ₪</p></div>
              <div className="card-body"><ul><li>15 אביזרים לבחירה</li><li>כולל 2 אביזרי עץ</li></ul></div>
            </div>
            <div className="card">
              <div className="card-header"><h3>חבילת סוויט (Sweet)</h3><p className="price">350 ₪</p></div>
              <div className="card-body"><ul><li>אביזרים ללא הגבלה!</li><li>תקף עד ל-12 שעות שימוש</li></ul></div>
            </div>
          </div>

          <div className="booking-box" style={{ textAlign: "center" }}>
            <h2 className="section-title" style={{ marginTop: 0 }}>1. בדיקת זמינות וקביעת תור בסטודיו</h2>
            <p className="booking-desc">
              לוחצים על הכפתור, בוחרים שעה פנויה שמתעדכנת בזמן אמת, וממלאים פרטים – התור נכנס אוטומטית ליומן שלנו.
            </p>
            <div className="booking-icon">📅</div>
            <a
              href={SCHEDULING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="submit-btn"
              style={{ display: "inline-block", width: "auto", padding: "15px 40px", textDecoration: "none" }}
            >
              קביעת תור ביומן
            </a>
            <p className="info-strip">
              בכל שאלה לפני קביעת התור אפשר לכתוב לנו למייל:{" "}
              <a href={`mailto:${STUDIO_EMAIL}`}>{STUDIO_EMAIL}</a>
            </p>
          </div>

          <div className="booking-box bg-secondary-box">
            <h2 className="section-title" style={{ marginTop: 0 }}>2. קטלוג דיווח אביזרים (בזמן השהות בסטודיו)</h2>
            <p style={{ textAlign: "center", marginBottom: 20 }}>סמנו בתוך הקטלוג את הפריטים שלקחתם לשימוש מהמדפים, והזינו שם וטלפון.</p>
            <form onSubmit={submitReport}>
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <div className="form-group">
                  <label>שם מלא:</label>
                  <input type="text" required value={reportForm.name} onChange={(e) => setReportForm({ ...reportForm, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>מספר טלפון:</label>
                  <input type="tel" required value={reportForm.phone} onChange={(e) => setReportForm({ ...reportForm, phone: e.target.value })} />
                </div>
              </div>

              <div className="form-group">
                <label>קטלוג אביזרים ופריטים:</label>
                <div className="catalog-grid">
                  {items.map((it) => {
                    const src = normalizeImageUrl(it.image_url);
                    const checked = reportForm.selectedItems.includes(it.id);
                    return (
                      <label key={it.id} className={`catalog-item ${checked ? "catalog-checked" : ""}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleReportItem(it.id)} />
                        {src ? (
                          <img src={src} alt={it.name} loading="lazy" className="catalog-img" />
                        ) : (
                          <div className="catalog-img" aria-label={it.name} />
                        )}
                        <div className="catalog-details">
                          <span className="catalog-name">{it.name}</span>
                          <span className="catalog-price">כלול בחבילה / {Number(it.price)} ₪ בודד</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <button type="submit" className="submit-btn">שליחת דיווח אביזרים במייל</button>
            </form>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}

const pageCSS = `
.sb-page { --sb-bg: #f5c5b3; --sb-primary: #163126; --sb-white: #ffffff; --sb-card-bg: rgba(255,255,255,0.6); --sb-shadow: 0 8px 32px 0 rgba(22,49,38,0.08); background-color: var(--sb-bg); color: var(--sb-primary); line-height: 1.6; padding-bottom: 60px; font-family: 'Assistant', sans-serif; }
.sb-page * { box-sizing: border-box; }
.sb-page .sb-hero { text-align: center; padding: 50px 20px; }
.sb-page .logo-container h1 { font-family: 'Platypi', serif; font-size: 4.5rem; font-weight: 600; letter-spacing: -1px; color: var(--sb-primary); line-height: 1; margin: 0; }
.sb-page .logo-container .subtitle { font-size: 1.5rem; font-weight: 600; margin-top: 10px; letter-spacing: 1px; }
.sb-page .container { max-width: 1100px; margin: 0 auto; padding: 20px; }
.sb-page .section-title { text-align: center; margin: 40px 0 20px; font-size: 2rem; font-weight: 700; color: var(--sb-primary); }
.sb-page .section-title::after { content: ''; display: block; width: 50px; height: 3px; background-color: var(--sb-primary); margin: 8px auto 0; border-radius: 2px; }
.sb-page .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 25px; margin-bottom: 40px; }
.sb-page .card { background: var(--sb-card-bg); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.4); border-radius: 20px; padding: 30px; box-shadow: var(--sb-shadow); transition: transform .3s, box-shadow .3s; display: flex; flex-direction: column; justify-content: space-between; }
.sb-page .card:hover { transform: translateY(-5px); box-shadow: 0 12px 40px 0 rgba(22,49,38,.15); }
.sb-page .card-header h3 { font-size: 1.6rem; margin-bottom: 10px; }
.sb-page .price { font-size: 2rem; font-weight: 700; margin-bottom: 15px; }
.sb-page .price span { font-size: 1rem; font-weight: 400; }
.sb-page .card-body ul { list-style: none; margin: 0 0 25px; padding: 0; }
.sb-page .card-body ul li { margin-bottom: 10px; position: relative; padding-right: 20px; }
.sb-page .card-body ul li::before { content: '✦'; position: absolute; right: 0; color: var(--sb-primary); }
.sb-page .booking-box { background: var(--sb-white); border-radius: 25px; padding: 40px; box-shadow: var(--sb-shadow); margin-top: 50px; }
.sb-page .booking-desc { margin-bottom: 25px; opacity: 0.8; text-align: center; }
.sb-page .booking-icon { font-size: 3rem; margin-bottom: 15px; text-align: center; }
.sb-page .info-strip { margin-top: 25px; text-align: center; font-size: 0.9rem; opacity: 0.75; }
.sb-page .info-strip a { color: var(--sb-primary); font-weight: 700; }
.sb-page .form-group { margin-bottom: 20px; }
.sb-page .booking-box label { display: block; font-weight: 600; margin-bottom: 8px; color: var(--sb-primary); }
.sb-page input[type=text], .sb-page input[type=tel] { width: 100%; padding: 12px 15px; border: 1px solid rgba(22,49,38,.2); border-radius: 10px; background-color: #fafafa; color: var(--sb-primary); font-size: 1rem; outline: none; transition: border-color .3s; font-family: inherit; }
.sb-page input:focus { border-color: var(--sb-primary); }
.sb-page .submit-btn { display: block; width: 100%; background-color: var(--sb-primary); color: var(--sb-bg); border: none; padding: 15px; font-size: 1.2rem; font-weight: 700; border-radius: 12px; cursor: pointer; margin-top: 20px; transition: opacity .3s; font-family: inherit; }
.sb-page .submit-btn:hover { opacity: .9; }
.sb-page .bg-secondary-box { background-color: #fdfaf7; border: 2px solid rgba(22,49,38,.15); }
.sb-page .catalog-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 15px; }
.sb-page .catalog-item { position: relative; background: #ffffff; border: 1px solid rgba(22,49,38,.15); border-radius: 15px; overflow: hidden; cursor: pointer; transition: all .3s ease; box-shadow: 0 4px 10px rgba(0,0,0,.02); display: flex; flex-direction: column; margin-bottom: 0; }
.sb-page .catalog-item input[type=checkbox] { position: absolute; top: 12px; right: 12px; width: 22px; height: 22px; accent-color: var(--sb-primary); z-index: 10; cursor: pointer; opacity: 1; }
.sb-page .catalog-img { width: 100%; height: 150px; object-fit: cover; background-color: #eaeaea; border-bottom: 1px solid rgba(22,49,38,.08); display: block; }
.sb-page .catalog-details { padding: 15px; text-align: center; display: flex; flex-direction: column; justify-content: space-between; flex-grow: 1; }
.sb-page .catalog-name { font-weight: 700; font-size: 1rem; color: var(--sb-primary); }
.sb-page .catalog-price { font-size: .85rem; color: #666; margin-top: 5px; font-weight: 600; }
.sb-page .catalog-item.catalog-checked { border: 2.5px solid var(--sb-primary); transform: scale(1.02); }
.sb-page .catalog-item.catalog-checked .catalog-details { background-color: rgba(22,49,38,.04); }
@media (max-width: 768px) {
  .sb-page .logo-container h1 { font-size: 3rem; }
  .sb-page .logo-container .subtitle { font-size: 1.2rem; }
  .sb-page .booking-box { padding: 25px; }
}
`;

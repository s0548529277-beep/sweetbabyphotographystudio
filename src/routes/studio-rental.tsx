import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/studio-rental")({
  head: () => ({
    meta: [
      { title: "השכרת סטודיו ואביזרים | Sweetbaby" },
      { name: "description", content: "השכרת סטודיו לצילום ואביזרים לצילומי ניו-בורן, משפחה והיריון. חבילות גמישות וקביעת תור אונליין." },
    ],
  }),
  component: StudioRentalPage,
});

const EMAIL_TO = "s0548529277@gmail.com";

type CatalogItem = { id: string; name: string; price: string };
const catalog: CatalogItem[] = [
  { id: "bed", name: "מיטה מעץ", price: "כלול בחבילה / 25 ₪ בודד" },
  { id: "basket", name: "סל קש מעוצב", price: "כלול בחבילה / 20 ₪ בודד" },
  { id: "bg", name: "רקע בד מבושל", price: "כלול בחבילה / 15 ₪ בודד" },
  { id: "outfit", name: "סט ביגוד סרוג", price: "כלול בחבילה / 30 ₪ בודד" },
];

function StudioRentalPage() {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const toggle = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }));

  const submit = () => {
    const items = catalog.filter((c) => selected[c.id]).map((c) => `• ${c.name}`).join("\n");
    if (!name || !phone || !items) {
      alert("יש למלא שם, טלפון ולבחור לפחות פריט אחד");
      return;
    }
    const subject = `דיווח אביזרים - ${name}`;
    const body = `שם: ${name}\nטלפון: ${phone}\n\nפריטים שנלקחו:\n${items}`;
    window.location.href = `mailto:${EMAIL_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="sr-page" dir="rtl">
      <style>{`
        .sr-page { --bg: #f5c5b3; --pc: #163126; --card: rgba(255,255,255,0.6); --shadow: 0 8px 32px rgba(22,49,38,0.08);
          background: var(--bg); color: var(--pc); font-family: 'Assistant', sans-serif; padding-bottom: 60px; }
        .sr-page * { box-sizing: border-box; }
        .sr-page header { text-align:center; padding: 50px 20px; }
        .sr-page h1.logo { font-family: 'Platypi', serif; font-size: 4.5rem; font-weight: 600; letter-spacing: -1px; margin:0; }
        .sr-page .subtitle { font-size: 1.5rem; font-weight: 600; margin-top: 10px; }
        .sr-container { max-width: 1100px; margin: 0 auto; padding: 20px; }
        .sr-title { text-align:center; margin: 40px 0 20px; font-size: 2rem; font-weight: 700; }
        .sr-title::after { content:''; display:block; width:50px; height:3px; background:var(--pc); margin: 8px auto 0; border-radius:2px; }
        .sr-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(300px,1fr)); gap: 25px; margin-bottom: 40px; }
        .sr-card { background: var(--card); backdrop-filter: blur(8px); border:1px solid rgba(255,255,255,0.4);
          border-radius: 20px; padding: 30px; box-shadow: var(--shadow); transition: transform .3s; }
        .sr-card:hover { transform: translateY(-5px); }
        .sr-card h3 { font-size: 1.6rem; margin-bottom: 10px; }
        .sr-price { font-size: 2rem; font-weight: 700; margin-bottom: 15px; }
        .sr-price span { font-size: 1rem; font-weight: 400; }
        .sr-card ul { list-style: none; padding: 0; margin: 0; }
        .sr-card ul li { margin-bottom: 10px; position: relative; padding-right: 20px; }
        .sr-card ul li::before { content:'✦'; position:absolute; right:0; color: var(--pc); }
        .sr-box { background:#fff; border-radius: 25px; padding: 40px; box-shadow: var(--shadow); margin-top: 50px; text-align:center; }
        .sr-box.alt { background:#fdfaf7; border: 2px solid rgba(22,49,38,0.15); text-align: right; }
        .sr-icon { font-size: 3rem; margin: 15px 0; }
        .sr-btn { display:inline-block; background: var(--pc); color: var(--bg); border:none; padding: 15px 30px;
          font-size: 1.1rem; font-weight: 700; border-radius: 12px; cursor:pointer; text-decoration:none; }
        .sr-btn:hover { opacity: 0.9; }
        .sr-form label { display:block; font-weight: 600; margin-bottom: 8px; }
        .sr-form input { width:100%; padding: 12px 15px; border:1px solid rgba(22,49,38,0.2); border-radius: 10px;
          background: #fafafa; color: var(--pc); font-size: 1rem; outline: none; margin-bottom: 20px; }
        .sr-form input:focus { border-color: var(--pc); }
        .cat-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(200px,1fr)); gap:15px; margin-top: 15px; }
        .cat-item { position:relative; background:#fff; border:1px solid rgba(22,49,38,0.15); border-radius:15px;
          overflow:hidden; cursor:pointer; transition: all .3s; }
        .cat-item.checked { border: 2.5px solid var(--pc); transform: scale(1.02); }
        .cat-item input { position:absolute; top:12px; right:12px; width:22px; height:22px; accent-color: var(--pc); z-index:2; }
        .cat-img { width:100%; height:150px; background:#eaeaea; display:flex; align-items:center; justify-content:center; color:#999; }
        .cat-details { padding:15px; text-align:center; }
        .cat-name { font-weight:700; font-size:1rem; }
        .cat-price { font-size:.9rem; color:#666; margin-top:5px; font-weight:600; }
        .info-strip { margin-top: 30px; text-align:center; font-size: .9rem; opacity:.75; }
        .info-strip a { color: var(--pc); font-weight: 700; }
        @media (max-width: 768px) { .sr-page h1.logo { font-size: 3rem; } .sr-page .subtitle { font-size: 1.2rem; } .sr-box { padding: 25px; } }
      `}</style>

      <header>
        <div>
          <h1 className="logo">Sweetbaby</h1>
          <div className="subtitle">התמונה הראשונה שלי</div>
        </div>
      </header>

      <div className="sr-container">
        <h2 className="sr-title">השכרת הסטודיו</h2>
        <div className="sr-grid">
          <div className="sr-card">
            <h3>שעתי גמיש</h3>
            <div className="sr-price">120 ₪ <span>/ שעה ראשונה</span></div>
            <ul>
              <li>כל שעה נוספת ב-90 ₪ בלבד</li>
              <li>מתאים לצילומי משפחה, היריון וילדים</li>
              <li>גישה מלאה לחלל הסטודיו והתאורה</li>
            </ul>
          </div>
          <div className="sr-card">
            <h3>מבצע בוקר ניו-בורן</h3>
            <div className="sr-price">240 ₪ <span>/ ל-3 שעות</span></div>
            <ul>
              <li>תקף בין השעות 8:00 ל-13:00 בלבד</li>
              <li>הזמן המושלם והשקט ביותר לצילומי ניו-בורן</li>
              <li>חיסכון משמעותי במחיר לשעה</li>
            </ul>
          </div>
        </div>

        <h2 className="sr-title">חבילות השכרת אביזרים</h2>
        <div className="sr-grid">
          <div className="sr-card">
            <h3>חבילת בסיס</h3>
            <div className="sr-price">100 ₪</div>
            <ul><li>8 אביזרים לבחירה</li><li>כולל אביזר גדול אחד</li></ul>
          </div>
          <div className="sr-card">
            <h3>חבילת פרימיום</h3>
            <div className="sr-price">150 ₪</div>
            <ul><li>15 אביזרים לבחירה</li><li>כולל 2 אביזרי עץ</li></ul>
          </div>
          <div className="sr-card">
            <h3>חבילת סוויט (Sweet)</h3>
            <div className="sr-price">350 ₪</div>
            <ul><li>אביזרים ללא הגבלה!</li><li>תקף עד ל-12 שעות שימוש</li></ul>
          </div>
        </div>

        <div className="sr-box">
          <h2 className="sr-title" style={{ marginTop: 0 }}>1. בדיקת זמינות וקביעת תור בסטודיו</h2>
          <p>בוחרים שעה פנויה שמתעדכנת בזמן אמת, וממלאים פרטים - התור נכנס אוטומטית ליומן שלנו.</p>
          <div className="sr-icon">📅</div>
          <iframe
            src="https://calendar.google.com/calendar/appointments/schedules/AcZssZ2J4Zlqx74R4VNrX-c1vMtFEW3R6nu0gtk_pOxYuNiBTAaR47teUZfy1T59zzhkaPB2wB_9ukBE?gv=true"
            style={{ border: 0, width: "100%", height: 600, borderRadius: 16, marginTop: 16 }}
            frameBorder={0}
            scrolling="no"
            title="קביעת תור בסטודיו"
          />
          <div className="info-strip">
            בכל שאלה לפני קביעת התור אפשר לכתוב לנו במייל: <a href={`mailto:${EMAIL_TO}`}>{EMAIL_TO}</a>
          </div>
        </div>

        <div className="sr-box alt sr-form">
          <h2 className="sr-title" style={{ marginTop: 0 }}>2. קטלוג דיווח אביזרים (בזמן השהות בסטודיו)</h2>
          <p style={{ textAlign: "center", marginBottom: 20 }}>סמנו בתוך הקטלוג את הפריטים שלקחתם לשימוש מהמדפים, והזינו שם וטלפון.</p>

          <label>שם מלא:</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          <label>מספר טלפון:</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />

          <label>קטלוג אביזרים ופריטים:</label>
          <div className="cat-grid">
            {catalog.map((item) => (
              <label key={item.id} className={`cat-item ${selected[item.id] ? "checked" : ""}`}>
                <input type="checkbox" checked={!!selected[item.id]} onChange={() => toggle(item.id)} />
                <div className="cat-img">תמונה</div>
                <div className="cat-details">
                  <div className="cat-name">{item.name}</div>
                  <div className="cat-price">{item.price}</div>
                </div>
              </label>
            ))}
          </div>

          <button type="button" className="sr-btn" style={{ width: "100%", marginTop: 24 }} onClick={submit}>
            שליחת דיווח אביזרים במייל
          </button>
        </div>
      </div>
    </div>
  );
}

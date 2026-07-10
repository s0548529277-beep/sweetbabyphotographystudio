import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import catalogData from "@/data/studio-catalog.json";

export const Route = createFileRoute("/studio-rental")({
  head: () => ({
    meta: [
      { title: "השכרת סטודיו ואביזרים | Sweetbaby" },
      {
        name: "description",
        content:
          "השכרת סטודיו לצילום ואביזרים לצילומי ניו-בורן, משפחה והיריון. קביעת תור אונליין וקטלוג אביזרים מלא.",
      },
    ],
  }),
  component: StudioRentalPage,
});

const EMAIL_TO = "s0548529277@gmail.com";
const SCHEDULING_SRC =
  "https://calendar.google.com/calendar/appointments/schedules/AcZssZ2J4Zlqx74R4VNrX-c1vMtFEW3R6nu0gtk_pOxYuNiBTAaR47teUZfy1T59zzhkaPB2wB_9ukBE?gv=true";

type Item = { sku: string; name: string; price: number; img: string; alt: string };
type Category = { title: string; items: Item[] };
const categories = catalogData as Category[];

function StudioRentalPage() {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [clientName, setClientName] = useState("");
  const [phone, setPhone] = useState("");
  const [hours, setHours] = useState("");

  const toggle = (sku: string) =>
    setSelected((s) => ({ ...s, [sku]: !s[sku] }));

  const allItems = useMemo(() => categories.flatMap((c) => c.items), []);
  const chosen = allItems.filter((i) => selected[i.sku]);
  const total = chosen.reduce((sum, i) => sum + i.price, 0);

  const submit = () => {
    if (!clientName.trim() || !phone.trim()) {
      alert("נא למלא שם וטלפון לפני השליחה.");
      return;
    }
    if (chosen.length === 0) {
      alert("נא לבחור לפחות אביזר אחד מהקטלוג.");
      return;
    }
    const lines = chosen.map((i) => `#${i.sku} - ${i.price} ₪`).join("\n");
    const subject = `בקשת השכרת אביזרים - ${clientName}`;
    let body = `שם מלא: ${clientName}\nטלפון: ${phone}\n`;
    if (hours) body += `משך ההשכרה המבוקש: ${hours}\n`;
    body += `\nפריטים נבחרים (${chosen.length}):\n${lines}\n\nסה"כ משוער: ${total} ₪`;
    window.location.href = `mailto:${EMAIL_TO}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="sb-rental" dir="rtl">
      <style>{css}</style>

      <header className="sb-header">
        <h1>Sweetbaby</h1>
        <div className="subtitle">התמונה הראשונה שלי</div>
      </header>

      <div className="sb-container">
        <h2 className="section-title">השכרת הסטודיו</h2>
        <div className="grid">
          <div className="card">
            <div className="card-header">
              <h3>שעתי גמיש</h3>
              <div className="price">
                120 ₪ <span>/ שעה ראשונה</span>
              </div>
            </div>
            <ul>
              <li>כל שעה נוספת ב-90 ₪ בלבד</li>
              <li>מתאים לצילומי משפחה, היריון וילדים</li>
              <li>גישה מלאה לחלל הסטודיו והתאורה</li>
            </ul>
          </div>
          <div className="card featured">
            <div className="card-header">
              <h3>מבצע בוקר ניו-בורן</h3>
              <div className="price">
                240 ₪ <span>/ ל-3 שעות</span>
              </div>
            </div>
            <ul>
              <li>תקף בין השעות 8:00 ל-13:00 בלבד</li>
              <li>הזמן המושלם והשקט ביותר לצילומי ניו-בורן</li>
              <li>חיסכון משמעותי במחיר לשעה</li>
            </ul>
          </div>
        </div>

        <div className="booking-box">
          <h2 style={{ marginBottom: 10 }}>1. בדיקת זמינות וקביעת תור בסטודיו</h2>
          <p className="booking-desc">
            בוחרים שעה פנויה שמתעדכנת בזמן אמת, וממלאים פרטים - התור נכנס אוטומטית ליומן שלנו.
          </p>
          <div className="calendar-frame-wrapper">
            <iframe
              src={SCHEDULING_SRC}
              style={{ border: 0 }}
              width="100%"
              height={600}
              title="Google Calendar Appointment Scheduling"
            />
          </div>
          <p className="info-strip">
            בכל שאלה לפני קביעת התור אפשר לכתוב לנו במייל:{" "}
            <a href={`mailto:${EMAIL_TO}`}>{EMAIL_TO}</a>
          </p>
        </div>

        <div className="catalog-box">
          <h2 className="section-title">2. קטלוג השכרת אביזרים</h2>
          <p className="booking-desc">
            סמנו את האביזרים שתרצו לשכור מתוך הקטלוג המלא, מלאו פרטים - והבקשה תישלח אלינו במייל.
          </p>

          {categories.map((cat) => (
            <div className="cat-block" key={cat.title}>
              <h3 className="cat-title">{cat.title}</h3>
              <div className="item-grid">
                {cat.items.map((it) => {
                  const on = !!selected[it.sku];
                  return (
                    <label
                      key={it.sku}
                      className={`item-card${on ? " checked" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(it.sku)}
                      />
                      <img src={it.img} alt={it.alt} loading="lazy" />
                      <div className="item-info">
                        <span>#{it.sku}</span>
                        <span>₪{it.price}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="cart-bar">
            <div>
              <div className="cart-count">{chosen.length} פריטים נבחרו</div>
              <div className="cart-total">סה"כ: {total} ₪</div>
            </div>
            <div className="cart-form">
              <input
                type="text"
                placeholder="שם מלא"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
              <input
                type="tel"
                placeholder="טלפון"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <select value={hours} onChange={(e) => setHours(e.target.value)}>
                <option value="">כמה זמן תזדקקו לאביזרים?</option>
                <option value="עד 24 שעות (סטנדרטי)">עד 24 שעות (סטנדרטי)</option>
                <option value="יומיים">יומיים</option>
                <option value="3 ימים">3 ימים</option>
              </select>
              <button type="button" className="submit-btn" onClick={submit}>
                שליחת בקשה במייל
              </button>
            </div>
          </div>
          <p className="info-strip" style={{ marginTop: 15 }}>
            מינימום הזמנה 50 ₪. התשלום מתבצע לפני לקיחת האביזרים. לפרטי מדיניות ההשכרה
            המלאה - <a href={`mailto:${EMAIL_TO}`}>כתבו לנו במייל</a>.
          </p>
        </div>
      </div>
    </div>
  );
}

const css = `
.sb-rental { --bg-color:#f5c5b3; --primary-color:#163126; --white:#fff; --card-bg:rgba(255,255,255,0.6); --shadow:0 8px 32px 0 rgba(22,49,38,0.08); background:var(--bg-color); color:var(--primary-color); font-family:'Assistant',sans-serif; line-height:1.6; padding-bottom:60px; }
.sb-rental * { box-sizing:border-box; }
.sb-header { text-align:center; padding:50px 20px; }
.sb-header h1 { font-family:'Platypi',serif; font-size:4.5rem; font-weight:600; letter-spacing:-1px; }
.sb-header .subtitle { font-size:1.5rem; font-weight:600; margin-top:10px; }
.sb-container { max-width:1100px; margin:0 auto; padding:20px; }
.sb-rental .section-title { text-align:center; margin:40px 0 20px; font-size:2rem; font-weight:700; }
.sb-rental .section-title::after { content:''; display:block; width:50px; height:3px; background:var(--primary-color); margin:8px auto 0; border-radius:2px; }
.sb-rental .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:25px; margin-bottom:40px; }
.sb-rental .card { background:var(--card-bg); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.4); border-radius:20px; padding:30px; box-shadow:var(--shadow); transition:transform .3s,box-shadow .3s; }
.sb-rental .card:hover { transform:translateY(-5px); box-shadow:0 12px 40px 0 rgba(22,49,38,0.15); }
.sb-rental .card.featured { border:2px solid var(--primary-color); }
.sb-rental .card h3 { font-size:1.6rem; margin-bottom:10px; }
.sb-rental .price { font-size:2rem; font-weight:700; margin-bottom:15px; }
.sb-rental .price span { font-size:1rem; font-weight:400; }
.sb-rental .card ul { list-style:none; padding:0; margin:0; }
.sb-rental .card ul li { margin-bottom:10px; position:relative; padding-right:20px; }
.sb-rental .card ul li::before { content:'✦'; position:absolute; right:0; color:var(--primary-color); }
.sb-rental .booking-box { background:var(--white); border-radius:25px; padding:40px; box-shadow:var(--shadow); margin-top:50px; text-align:center; }
.sb-rental .booking-desc { margin-bottom:20px; opacity:0.8; }
.sb-rental .calendar-frame-wrapper { width:100%; border-radius:15px; overflow:hidden; border:2px solid rgba(22,49,38,0.15); margin-bottom:10px; }
.sb-rental .calendar-frame-wrapper iframe { width:100%; display:block; }
.sb-rental .info-strip { text-align:center; font-size:0.9rem; opacity:0.75; }
.sb-rental .info-strip a { color:var(--primary-color); font-weight:700; }
.sb-rental .catalog-box { background:var(--white); border-radius:25px; padding:30px; box-shadow:var(--shadow); margin-top:50px; }
.sb-rental .cat-block { margin-bottom:35px; }
.sb-rental .cat-title { font-size:1.3rem; font-weight:700; color:var(--primary-color); margin-bottom:14px; border-bottom:2px solid rgba(22,49,38,0.15); padding-bottom:6px; }
.sb-rental .item-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:12px; }
.sb-rental .item-card { position:relative; display:block; cursor:pointer; border-radius:12px; overflow:hidden; border:2px solid rgba(22,49,38,0.1); background:#fafafa; transition:all .2s; }
.sb-rental .item-card img { width:100%; height:100px; object-fit:cover; display:block; }
.sb-rental .item-card input[type="checkbox"] { position:absolute; top:6px; left:6px; width:18px; height:18px; accent-color:var(--primary-color); z-index:2; }
.sb-rental .item-info { display:flex; justify-content:space-between; padding:6px 8px; font-size:0.75rem; font-weight:700; }
.sb-rental .item-card.checked { border-color:var(--primary-color); box-shadow:0 0 0 2px var(--primary-color); }
.sb-rental .item-card.checked .item-info { background:var(--primary-color); color:var(--bg-color); }
.sb-rental .cart-bar { position:sticky; bottom:0; background:var(--primary-color); color:var(--bg-color); padding:14px 20px; border-radius:16px; margin-top:25px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; box-shadow:0 -4px 20px rgba(0,0,0,0.15); z-index:5; }
.sb-rental .cart-count { font-weight:700; }
.sb-rental .cart-total { font-size:1.3rem; font-weight:700; }
.sb-rental .cart-form { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
.sb-rental .cart-form input, .sb-rental .cart-form select { padding:10px 12px; border:1px solid rgba(22,49,38,0.2); border-radius:10px; background:#fafafa; color:var(--primary-color); font-size:0.95rem; outline:none; min-width:140px; font-family:inherit; }
.sb-rental .submit-btn { background:var(--bg-color); color:var(--primary-color); border:none; padding:12px 22px; font-size:1rem; font-weight:700; border-radius:10px; cursor:pointer; }
.sb-rental .submit-btn:hover { opacity:0.9; }
@media (max-width:768px) {
  .sb-header h1 { font-size:3rem; }
  .sb-header .subtitle { font-size:1.2rem; }
  .sb-rental .booking-box { padding:25px; }
  .sb-rental .item-grid { grid-template-columns:repeat(auto-fill,minmax(95px,1fr)); }
  .sb-rental .item-card img { height:80px; }
  .sb-rental .cart-bar { flex-direction:column; align-items:stretch; }
}
`;

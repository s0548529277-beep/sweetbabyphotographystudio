import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Header } from "@/components/Header";

export const Route = createFileRoute("/studio-rental")({
  head: () => ({
    meta: [
      { title: "השכרת סטודיו | Sweetbaby" },
      {
        name: "description",
        content:
          "השכרת סטודיו לצילום ניו-בורן, משפחה והיריון. מחירון, כללי הסטודיו וקביעת תור אונליין.",
      },
    ],
  }),
  component: StudioRentalPage,
});

const EMAIL_TO = "s0548529277@gmail.com";
const SCHEDULING_SRC =
  "https://calendar.google.com/calendar/appointments/schedules/AcZssZ2J4Zlqx74R4VNrX-c1vMtFEW3R6nu0gtk_pOxYuNiBTAaR47teUZfy1T59zzhkaPB2wB_9ukBE?gv=true";

type IntakeForm = {
  clientName: string;
  phone: string;
  email: string;
  sessionType: string;
  sessionDate: string;
  peopleCount: string;
  babyAge: string;
  cameraBrand: string;
  flashExperience: string;
  needProps: string;
  specialRequests: string;
  agreed: boolean;
};

const emptyForm: IntakeForm = {
  clientName: "", phone: "", email: "", sessionType: "", sessionDate: "",
  peopleCount: "", babyAge: "", cameraBrand: "", flashExperience: "",
  needProps: "", specialRequests: "", agreed: false,
};

function StudioRentalPage() {
  const [showForm, setShowForm] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [form, setForm] = useState<IntakeForm>(emptyForm);
  const upd = <K extends keyof IntakeForm>(k: K, v: IntakeForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const sendIntake = () => {
    if (!form.clientName.trim() || !form.phone.trim() || !form.email.trim()) {
      alert("נא למלא שם, טלפון ואימייל.");
      return;
    }
    if (!form.agreed) {
      alert("יש לאשר את הסכם תיאום הציפיות לפני השליחה.");
      return;
    }
    const lines = [
      `שם מלא: ${form.clientName}`,
      `טלפון: ${form.phone}`,
      `אימייל: ${form.email}`,
      `סוג הצילום: ${form.sessionType}`,
      `תאריך/שעה מבוקשים: ${form.sessionDate}`,
      `מספר משתתפים: ${form.peopleCount}`,
      `גיל התינוק (אם רלוונטי): ${form.babyAge}`,
      `מותג מצלמה: ${form.cameraBrand}`,
      `ניסיון בעבודה עם פלאש/סטודיו: ${form.flashExperience}`,
      `זקוקה לאביזרים בהשכרה: ${form.needProps}`,
      `בקשות מיוחדות: ${form.specialRequests}`,
      ``,
      `אישרתי שקראתי והסכמתי להסכם תיאום הציפיות ולכללי הסטודיו.`,
    ].join("\n");
    const subject = `הסכם תיאום ציפיות - ${form.clientName}`;
    window.location.href = `mailto:${EMAIL_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines)}`;
  };

  return (
    <>
      <Header />
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
              <li>ניתן גם לחצאי שעות (חישוב יחסי)</li>
              <li>מינימום הזמנה: שעה (2 חצאי שעות)</li>
              <li>מתאים לצילומי משפחה, היריון וילדים</li>
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
              <li>הזמן השקט והמושלם לצילומי ניו-בורן</li>
              <li>חיסכון משמעותי במחיר לשעה</li>
            </ul>
          </div>
        </div>

        <div className="two-col">
          <div className="booking-box">
            <h2 style={{ marginBottom: 10 }}>קביעת תור בסטודיו</h2>
            <div className="agreement-banner">
              <strong>⚠️ חשוב:</strong> לא ניתן לקבוע תור לפני שליחת <b>הסכם תיאום ציפיות</b> במייל.
              קביעת שעה ביומן מהווה הסכמה מלאה לכללי הסטודיו וההסכם.
              <button type="button" className="agreement-btn" onClick={() => setShowForm(true)}>
                מילוי ושליחת הסכם תיאום ציפיות
              </button>
            </div>
            <p className="booking-desc">
              לאחר שליחת ההסכם - בוחרים שעה פנויה (מינימום 2 חצאי שעות) והתור נכנס אוטומטית ליומן שלנו.
            </p>
            <div className="calendar-frame-wrapper">
              <iframe
                src={SCHEDULING_SRC}
                style={{ border: 0 }}
                width="100%"
                height={640}
                title="Google Calendar Appointment Scheduling"
              />
            </div>
            <p className="info-strip">
              לשאלות לפני קביעת התור:{" "}
              <a href={`mailto:${EMAIL_TO}`}>{EMAIL_TO}</a>
            </p>
          </div>


          <aside className="info-col">
            <div className="info-card">
              <h3>👋 ברוכות הבאות לסטודיו שלנו!</h3>
              <p>
                איזה כיף שאת באה ליצור אצלנו! כדי שהשהות שלך תהיה הכי נעימה,
                זורמת ומוצלחת - ריכזנו כאן את כל הפרטים החשובים על הסטודיו,
                הציוד והכללים.
              </p>
            </div>

            <div className="info-card">
              <h3>🕒 שעות פעילות</h3>
              <ul className="clean">
                <li>ימים א'-ה': 8:00-23:00</li>
                <li>יום ו' / ערב חג: 8:00 עד שעתיים לפני כניסת השבת/חג</li>
                <li>מוצ"ש / חג: משעה אחרי צאת השבת/חג</li>
              </ul>
            </div>

            <div className="info-card">
              <h3>💳 מחירון וחישוב שעות</h3>
              <ul className="clean">
                <li>שעת השכרה ראשונה: 120 ₪</li>
                <li>כל שעה נוספת: 90 ₪</li>
                <li>מבצע 8:00-13:00 (ניו-בורן): 3 שעות ב-240 ₪</li>
                <li>מינימום: שעה (2 חצאי שעות)</li>
                <li>עיכוב של 15+ דקות מעבר לשעה - חצי שעה נוספת</li>
                <li>עיכוב של 45+ דקות - שעה מלאה נוספת</li>
                <li>ספירת הזמן כוללת התארגנות וניקיון בסיום</li>
              </ul>
            </div>

            <div className="info-card">
              <h3>📅 תשלום ומדיניות ביטולים</h3>
              <ul className="clean">
                <li>שריון מועד: מקדמה 90 ₪ בעת ההזמנה (לא מוחזרת בביטול)</li>
                <li>העברה בנקאית: בנק 12, סניף 533, חשבון 648912 (מיכל סיבוני)</li>
                <li>יש לשלוח צילום אישור העברה למייל הסטודיו</li>
                <li>הזמנה ליום ההגעה: תשלום מלא מראש</li>
                <li>יתרה: פייבוקס / העברה / מזומן בסיום ההשכרה</li>
                <li>ביטול/שינוי עד ליום האירוע: המקדמה לא מוחזרת</li>
                <li>ביטול ביום האירוע: חיוב מלא (100%)</li>
              </ul>
            </div>

            <div className="info-card">
              <h3>✨ מה מחכה לך בסטודיו</h3>
              <ul className="clean">
                <li>מיזוג אוויר + מפזר חום ייעודי לניו-בורן</li>
                <li>שידת החתלה חדשה עם עיטופים ובדים מותאמים</li>
                <li>קופסת ציוד: משדר, בטריה לפלאש, שוֶשר, דבקים, אטבים ועטים</li>
                <li>שירותים - בקומה 5 דירה 18</li>
              </ul>
            </div>

            <div className="info-card">
              <h3>💡 תאורה וציוד מקצועי</h3>
              <ul className="clean">
                <li>פלאש מקצועי Godox AD200 PRO (סוללה נטענת)</li>
                <li>משדרים ל-Canon ול-SONY</li>
                <li>סופטבוקס בקוטר 1.65 מטר</li>
                <li>* השימוש בפלאש דורש ידע מוקדם בתאורת סטודיו</li>
              </ul>
            </div>

            <div className="info-card">
              <h3>🎨 רקעים ורצפות</h3>
              <p><strong>הרקעים שיש לנו:</strong> ירוק, לבן (גודל 2.7), כחול, חום בהיר, חום כהה, צהוב (גודל 1.5).</p>
              <p><strong>חשוב:</strong> הרקעים מיועדים לקירות בלבד. אין להניח רקעי נייר על הרצפה - יש להדביק את קצה הרקע בגבול הרצפה ולהניח מעליו את קורות העץ שבמקום.</p>
              <p>שימוש ברקע נייר גם כרצפה - בתוספת 50 ₪ (בגין הבלאי).</p>
              <p>רקע נייר שהתלכלך/נהרס: 100 ₪ לכל מטר שניזוק.</p>
              <p><strong>רצפות ללא תוספת:</strong> פורמייקה לבנה, רצפת עץ לבנה/חומה, פרקט הסטודיו, קורות עץ דו-צדדיות (לבן/חום).</p>
            </div>

            <div className="info-card">
              <h3>🧹 סדר וניקיון</h3>
              <p>הסטודיו נמסר לך נקי ומסודר - נשמח שתחזירי אותו למצבו המקורי לטובת המשתמשות הבאות. סטודיו שיישאר מבולגן/מלוכלך יגרור חיוב של 150 ₪ דמי ניקיון.</p>
            </div>

            <div className="info-card">
              <h3>🛡️ אחריות ונזקים</h3>
              <ul className="clean">
                <li>נזק לרכוש/ציוד: השוכר יישא בעלות התיקון/רכישת מוצר חדש + 20% דמי טיפול</li>
                <li>הבטיחות באחריות השוכר בלבד (לכל צד ומטעמו)</li>
                <li>יש לוודא כיבוי אורות ומזגן ביציאה - השארה דולק תגרור 7 ₪ לכל שעה עד 8:00 למחרת</li>
                <li>חפצים שיישכחו ולא ייאספו תוך 30 יום - יעברו למאגר האביזרים</li>
              </ul>
            </div>

            <div className="info-card cta">
              <h3>🧺 צריכה גם אביזרים לצילומי חוץ?</h3>
              <p>מוזמנת לעבור לקטלוג האביזרים להשכרה ולסמן את הפריטים שתרצי לצלם איתם.</p>
              <Link to="/rental-catalog" className="cta-link">לקטלוג האביזרים ←</Link>
            </div>
          </aside>
        </div>
      </div>

      {showForm && (
        <div className="sr-modal" onClick={() => setShowForm(false)}>
          <div className="sr-modal-box" onClick={(e) => e.stopPropagation()}>
            <button className="sr-modal-close" onClick={() => setShowForm(false)} aria-label="סגירה">×</button>
            <h2>הסכם תיאום ציפיות</h2>
            <p className="sr-modal-intro">
              נא למלא את הפרטים ולשלוח במייל. <strong>שליחת ההסכם היא תנאי לקביעת התור.</strong>
              קביעת שעה ביומן מהווה הסכמה מלאה לכללי הסטודיו ולתנאים המפורטים בעמוד זה.
            </p>
            <div className="sr-form-grid">
              <label>שם מלא *<input value={form.clientName} onChange={(e) => upd("clientName", e.target.value)} /></label>
              <label>טלפון *<input type="tel" value={form.phone} onChange={(e) => upd("phone", e.target.value)} /></label>
              <label>אימייל *<input type="email" value={form.email} onChange={(e) => upd("email", e.target.value)} /></label>
              <label>סוג הצילום
                <select value={form.sessionType} onChange={(e) => upd("sessionType", e.target.value)}>
                  <option value="">בחרי...</option>
                  <option>ניו-בורן</option>
                  <option>גיל שנה / חלאקה</option>
                  <option>היריון</option>
                  <option>משפחה</option>
                  <option>ילדים</option>
                  <option>אחר</option>
                </select>
              </label>
              <label>תאריך ושעה מבוקשים<input value={form.sessionDate} onChange={(e) => upd("sessionDate", e.target.value)} placeholder="לדוגמה: 15.7.26 ב-10:00" /></label>
              <label>מספר משתתפים<input value={form.peopleCount} onChange={(e) => upd("peopleCount", e.target.value)} /></label>
              <label>גיל התינוק (אם רלוונטי)<input value={form.babyAge} onChange={(e) => upd("babyAge", e.target.value)} placeholder="לדוגמה: 10 ימים" /></label>
              <label>מותג מצלמה
                <select value={form.cameraBrand} onChange={(e) => upd("cameraBrand", e.target.value)}>
                  <option value="">בחרי...</option>
                  <option>Canon</option>
                  <option>Sony</option>
                  <option>Nikon</option>
                  <option>אחר</option>
                </select>
              </label>
              <label>ניסיון קודם בפלאש/סטודיו
                <select value={form.flashExperience} onChange={(e) => upd("flashExperience", e.target.value)}>
                  <option value="">בחרי...</option>
                  <option>כן, מנוסה</option>
                  <option>מעט ניסיון</option>
                  <option>אין ניסיון - אשתמש באור טבעי</option>
                </select>
              </label>
              <label>רקעים מבוקשים<input value={form.backdrops} onChange={(e) => upd("backdrops", e.target.value)} placeholder="ירוק / לבן / כחול / חום / צהוב" /></label>
              <label>רצפות מבוקשות<input value={form.floors} onChange={(e) => upd("floors", e.target.value)} placeholder="פורמייקה / עץ לבן / עץ חום / פרקט" /></label>
              <label>זקוקה גם לאביזרים בהשכרה?
                <select value={form.needProps} onChange={(e) => upd("needProps", e.target.value)}>
                  <option value="">בחרי...</option>
                  <option>כן - אעבור לקטלוג האביזרים</option>
                  <option>לא</option>
                </select>
              </label>
              <label className="sr-full">בקשות מיוחדות / הערות
                <textarea rows={3} value={form.specialRequests} onChange={(e) => upd("specialRequests", e.target.value)} />
              </label>
              <label className="sr-full sr-agree">
                <input type="checkbox" checked={form.agreed} onChange={(e) => upd("agreed", e.target.checked)} />
                קראתי והבנתי את כללי הסטודיו, המחירון, מדיניות הביטולים, האחריות לנזקים וההנחיות לניקיון. ידוע לי כי קביעת מועד ביומן מהווה הסכמה מלאה להסכם זה ולכל הכללים המפורטים בעמוד.
              </label>
            </div>
            <div className="sr-modal-actions">
              <button type="button" className="sr-send" onClick={sendIntake}>שליחת ההסכם במייל</button>
              <button type="button" className="sr-cancel" onClick={() => setShowForm(false)}>ביטול</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}


const css = `
.sb-rental { --bg-color:#f5c5b3; --primary-color:#163126; --white:#fff; --card-bg:rgba(255,255,255,0.6); --shadow:0 8px 32px 0 rgba(22,49,38,0.08); background:var(--bg-color); color:var(--primary-color); font-family:'Assistant',sans-serif; line-height:1.6; padding-bottom:60px; }
.sb-rental * { box-sizing:border-box; }
.sb-header { text-align:center; padding:50px 20px; }
.sb-header h1 { font-family:'Platypi',serif; font-size:4.5rem; font-weight:600; letter-spacing:-1px; }
.sb-header .subtitle { font-size:1.5rem; font-weight:600; margin-top:10px; }
.sb-container { max-width:1200px; margin:0 auto; padding:20px; }
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
.sb-rental .two-col { display:grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap:25px; align-items:start; }
.sb-rental .booking-box { background:var(--white); border-radius:25px; padding:30px; box-shadow:var(--shadow); text-align:center; position:sticky; top:20px; }
.sb-rental .booking-desc { margin-bottom:20px; opacity:0.8; }
.sb-rental .calendar-frame-wrapper { width:100%; border-radius:15px; overflow:hidden; border:2px solid rgba(22,49,38,0.15); margin-bottom:10px; }
.sb-rental .calendar-frame-wrapper iframe { width:100%; display:block; }
.sb-rental .info-strip { text-align:center; font-size:0.9rem; opacity:0.75; }
.sb-rental .info-strip a { color:var(--primary-color); font-weight:700; }
.sb-rental .info-col { display:flex; flex-direction:column; gap:16px; }
.sb-rental .info-card { background:var(--white); border-radius:20px; padding:22px 24px; box-shadow:var(--shadow); }
.sb-rental .info-card h3 { font-size:1.15rem; font-weight:700; margin-bottom:10px; }
.sb-rental .info-card p { margin-bottom:8px; font-size:0.95rem; }
.sb-rental ul.clean { list-style:none; padding:0; margin:0; }
.sb-rental ul.clean li { position:relative; padding-right:16px; margin-bottom:6px; font-size:0.95rem; }
.sb-rental ul.clean li::before { content:'•'; position:absolute; right:0; color:var(--primary-color); font-weight:700; }
.sb-rental .info-card.cta { background:var(--primary-color); color:var(--bg-color); }
.sb-rental .cta-link { display:inline-block; margin-top:8px; background:var(--bg-color); color:var(--primary-color); padding:10px 18px; border-radius:10px; font-weight:700; text-decoration:none; }
.sb-rental .agreement-banner { background:#fff4e6; border:2px solid #e67e22; border-radius:14px; padding:14px 16px; margin-bottom:16px; text-align:right; font-size:0.95rem; }
.sb-rental .agreement-btn { display:block; width:100%; margin-top:10px; background:var(--primary-color); color:var(--bg-color); border:none; padding:12px 18px; border-radius:10px; font-weight:700; font-size:1rem; cursor:pointer; font-family:inherit; }
.sb-rental .agreement-btn:hover { opacity:0.92; }
.sb-rental .sr-modal { position:fixed; inset:0; background:rgba(0,0,0,0.55); display:flex; align-items:center; justify-content:center; z-index:100; padding:20px; }
.sb-rental .sr-modal-box { background:var(--white); border-radius:20px; padding:28px; max-width:720px; width:100%; max-height:90vh; overflow-y:auto; position:relative; }
.sb-rental .sr-modal-box h2 { font-size:1.6rem; margin-bottom:8px; }
.sb-rental .sr-modal-intro { font-size:0.95rem; margin-bottom:18px; opacity:0.85; }
.sb-rental .sr-modal-close { position:absolute; top:12px; left:14px; background:none; border:none; font-size:1.8rem; cursor:pointer; color:var(--primary-color); }
.sb-rental .sr-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.sb-rental .sr-form-grid label { display:flex; flex-direction:column; gap:5px; font-size:0.9rem; font-weight:600; }
.sb-rental .sr-form-grid input, .sb-rental .sr-form-grid select, .sb-rental .sr-form-grid textarea { padding:10px 12px; border:1px solid rgba(22,49,38,0.2); border-radius:8px; font-family:inherit; font-size:0.95rem; background:#fafafa; outline:none; font-weight:400; }
.sb-rental .sr-form-grid input:focus, .sb-rental .sr-form-grid select:focus, .sb-rental .sr-form-grid textarea:focus { border-color:var(--primary-color); }
.sb-rental .sr-full { grid-column:1/-1; }
.sb-rental .sr-agree { flex-direction:row !important; align-items:flex-start; gap:8px; background:#fff9ec; padding:12px; border-radius:10px; border:1px solid rgba(230,126,34,0.35); font-weight:500 !important; }
.sb-rental .sr-agree input { flex-shrink:0; margin-top:3px; width:18px; height:18px; }
.sb-rental .sr-modal-actions { display:flex; gap:10px; margin-top:20px; justify-content:flex-start; }
.sb-rental .sr-send { background:var(--primary-color); color:var(--bg-color); border:none; padding:12px 24px; border-radius:10px; font-weight:700; cursor:pointer; font-size:1rem; font-family:inherit; }
.sb-rental .sr-cancel { background:transparent; border:1px solid rgba(22,49,38,0.3); color:var(--primary-color); padding:12px 24px; border-radius:10px; cursor:pointer; font-family:inherit; }
@media (max-width:600px) { .sb-rental .sr-form-grid { grid-template-columns:1fr; } }
@media (max-width:900px) {
  .sb-rental .two-col { grid-template-columns: 1fr; }
  .sb-rental .booking-box { position:static; }
}
@media (max-width:768px) {
  .sb-header h1 { font-size:3rem; }
  .sb-header .subtitle { font-size:1.2rem; }
  .sb-rental .booking-box { padding:22px; }
}
`;

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeImageUrl } from "@/lib/images";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

// ⚠️ עדכני כאן את מספר הוואטסאפ של הסטודיו (פורמט בינ״ל ללא +, לדוגמה 972501234567)
const WHATSAPP_NUMBER = "972500000000";

type CatalogItem = { id: string; sku: string; name: string; price: number; image_url: string | null };

const catalogQuery = queryOptions({
  queryKey: ["pricing-catalog"],
  queryFn: async () => {
    const { data } = await supabase
      .from("items")
      .select("id, sku, name, price, image_url")
      .eq("active", true)
      .order("sku");
    return (data ?? []) as CatalogItem[];
  },
});

export const Route = createFileRoute("/pricing")({
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQuery),
  component: PricingPage,
  head: () => ({
    meta: [
      { title: "מחירון והזמנה | Sweetbaby" },
      { name: "description", content: "מחירון שקוף להשכרת סטודיו ואביזרים בבית שמש — חבילות אביזרים, הדרכה, ומחשבון הזמנה מהיר בוואטסאפ." },
      { property: "og:title", content: "מחירון והזמנה | Sweetbaby" },
      { property: "og:description", content: "מחירון שקוף להשכרת סטודיו ואביזרים — מחשבון הזמנה מהיר בוואטסאפ." },
      { property: "og:url", content: "https://sweetbabyphotographystudio.lovable.app/pricing" },
    ],
    links: [
      { rel: "canonical", href: "https://sweetbabyphotographystudio.lovable.app/pricing" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;600;700&family=Platypi:ital,wght@0,300..800;1,300..800&display=swap" },
    ],
  }),
});

const hourlyPricing = { 1: 120, 2: 210, 3: 300, 4: 390, 5: 480 } as const;
const packagePrices = { none: 0, basic: 100, premium: 150, sweet: 350 } as const;
const guidancePrices = { none: 0, technical: 50, professional: 100, full: 150 } as const;

function PricingPage() {
  const { data: items } = useSuspenseQuery(catalogQuery);
  const featured = useMemo(() => items.slice(0, 12), [items]);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    date: "",
    studioType: "hourly" as "hourly" | "newborn",
    hours: 1 as 1 | 2 | 3 | 4 | 5,
    propsPackage: "none" as keyof typeof packagePrices,
    selectedItems: [] as string[],
    guidance: "none" as keyof typeof guidancePrices,
  });

  const [reportForm, setReportForm] = useState({
    name: "",
    phone: "",
    selectedItems: [] as string[],
  });

  const toggleReportItem = (id: string) =>
    setReportForm((f) => ({
      ...f,
      selectedItems: f.selectedItems.includes(id) ? f.selectedItems.filter((x) => x !== id) : [...f.selectedItems, id],
    }));

  const submitReport = (e: React.FormEvent) => {
    e.preventDefault();
    const list = reportForm.selectedItems
      .map((id) => items.find((i) => i.id === id))
      .filter(Boolean)
      .map((i) => `• ${i!.name} (${i!.sku}) — ${i!.price}₪`)
      .join("\n");
    const msg = [
      `דיווח שימוש באביזרים — Sweetbaby 🌸`,
      ``,
      `שם: ${reportForm.name}`,
      `טלפון: ${reportForm.phone}`,
      ``,
      `פריטים שנלקחו מהמדפים:`,
      list || "(לא סומנו פריטים)",
    ].join("\n");
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, "_blank");
  };


  const toggleItem = (id: string) =>
    setForm((f) => ({
      ...f,
      selectedItems: f.selectedItems.includes(id) ? f.selectedItems.filter((x) => x !== id) : [...f.selectedItems, id],
    }));

  const total = useMemo(() => {
    let t = form.studioType === "hourly" ? hourlyPricing[form.hours] : 240;
    t += packagePrices[form.propsPackage];
    t += guidancePrices[form.guidance];
    for (const id of form.selectedItems) {
      const it = items.find((i) => i.id === id);
      if (it) t += Number(it.price);
    }
    return t;
  }, [form, items]);

  const submitWhatsapp = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedNames = form.selectedItems
      .map((id) => items.find((i) => i.id === id))
      .filter(Boolean)
      .map((i) => `• ${i!.name} (${i!.sku}) — ${i!.price}₪`)
      .join("\n");
    const msg = [
      `שלום, אני מעוניינת לקבוע תור ב-Sweetbaby 🌸`,
      ``,
      `שם: ${form.name}`,
      `טלפון: ${form.phone}`,
      `תאריך: ${form.date}`,
      ``,
      `סוג השכרה: ${form.studioType === "hourly" ? "לפי שעה" : "מבצע בוקר ניו-בורן"}`,
      form.studioType === "hourly" ? `שעות: ${form.hours}` : `שעות: 3`,
      `חבילת אביזרים: ${{ none: "ללא", basic: "בסיס", premium: "פרימיום", sweet: "סוויט" }[form.propsPackage]}`,
      `הדרכה: ${{ none: "ללא", technical: "טכנית", professional: "מקצועית", full: "מעטפת מלאה" }[form.guidance]}`,
      selectedNames ? `\nמוצרים נבחרים:\n${selectedNames}` : "",
      ``,
      `סה"כ משוער: ${total}₪`,
    ].join("\n");
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, "_blank");
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
          <p style={{ textAlign: "center", marginBottom: 20 }}>מינימום הזמנת אביזרים בודדים שלא במסגרת חבילה: 50 ₪</p>
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

          <h2 className="section-title">ליווי והדרכה בסטודיו</h2>
          <div className="grid">
            <div className="card">
              <div className="card-header"><h3>הדרכה טכנית קצרה</h3><p className="price">50 ₪</p></div>
              <div className="card-body"><ul><li>סידור מהיר של הפלאש והמצלמה בכניסה</li></ul></div>
            </div>
            <div className="card">
              <div className="card-header"><h3>ליווי מקצועי ראשוני</h3><p className="price">100 ₪</p></div>
              <div className="card-body"><ul><li>התאמה מדויקת של 2 סטים לצילום לפי הצרכים שלך</li></ul></div>
            </div>
            <div className="card">
              <div className="card-header"><h3>מעטפת מלאה</h3><p className="price">150 ₪</p></div>
              <div className="card-body"><ul><li>הכנת החלל מאפס, הסבר טכני מפורט וזמינות מלאה במהלך השהות</li></ul></div>
            </div>
          </div>

          <div className="booking-box">
            <h2 className="section-title" style={{ marginTop: 0 }}>מערכת קביעת תורים ומחשבון מחיר</h2>
            <form onSubmit={submitWhatsapp}>
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <div className="form-group">
                  <label>שם מלא:</label>
                  <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>מספר טלפון:</label>
                  <input type="tel" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>תאריך מבוקש:</label>
                  <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
              </div>

              <div className="form-group">
                <label>סוג השכרת הסטודיו:</label>
                <div className="radio-selectors">
                  {[
                    { v: "hourly", label: "לפי שעה גמיש" },
                    { v: "newborn", label: "מבצע בוקר ניו-בורן (3 שעות)" },
                  ].map((o) => (
                    <div className="selector-item" key={o.v}>
                      <input type="radio" id={`st-${o.v}`} name="studioType" checked={form.studioType === o.v} onChange={() => setForm({ ...form, studioType: o.v as any })} />
                      <label htmlFor={`st-${o.v}`} className="selector-label">{o.label}</label>
                    </div>
                  ))}
                </div>
              </div>

              {form.studioType === "hourly" && (
                <div className="form-group">
                  <label>מספר שעות כולל בסטודיו:</label>
                  <select value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) as any })}>
                    <option value={1}>שעה אחת (120 ₪)</option>
                    <option value={2}>שעתיים (210 ₪)</option>
                    <option value={3}>3 שעות (300 ₪)</option>
                    <option value={4}>4 שעות (390 ₪)</option>
                    <option value={5}>5 שעות (480 ₪)</option>
                  </select>
                </div>
              )}

              <div className="form-group">
                <label>חבילת אביזרים:</label>
                <div className="radio-selectors">
                  {[
                    { v: "none", label: "ללא חבילה (0 ₪)" },
                    { v: "basic", label: "חבילת בסיס (100 ₪)" },
                    { v: "premium", label: "חבילת פרימיום (150 ₪)" },
                    { v: "sweet", label: "חבילת סוויט (350 ₪)" },
                  ].map((o) => (
                    <div className="selector-item" key={o.v}>
                      <input type="radio" id={`pk-${o.v}`} name="pk" checked={form.propsPackage === o.v} onChange={() => setForm({ ...form, propsPackage: o.v as any })} />
                      <label htmlFor={`pk-${o.v}`} className="selector-label">{o.label}</label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>הזמנת מוצרים מראש (אופציונלי):</label>
                <div className="products-grid">
                  {featured.map((it) => {
                    const src = normalizeImageUrl(it.image_url);
                    const checked = form.selectedItems.includes(it.id);
                    return (
                      <div key={it.id}>
                        <input type="checkbox" id={`p-${it.id}`} className="product-checkbox" checked={checked} onChange={() => toggleItem(it.id)} />
                        <label htmlFor={`p-${it.id}`} className="product-label">
                          {src && <img src={src} alt={it.name} className="prod-img" />}
                          <span className="prod-name">{it.name}</span>
                          <span className="prod-price">+{Number(it.price)} ₪</span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="form-group">
                <label>תוספת הדרכה וליווי:</label>
                <div className="radio-selectors">
                  {[
                    { v: "none", label: "ללא הדרכה (0 ₪)" },
                    { v: "technical", label: "הדרכה טכנית קצרה (50 ₪)" },
                    { v: "professional", label: "ליווי מקצועי ראשוני (100 ₪)" },
                    { v: "full", label: "מעטפת מלאה (150 ₪)" },
                  ].map((o) => (
                    <div className="selector-item" key={o.v}>
                      <input type="radio" id={`g-${o.v}`} name="g" checked={form.guidance === o.v} onChange={() => setForm({ ...form, guidance: o.v as any })} />
                      <label htmlFor={`g-${o.v}`} className="selector-label">{o.label}</label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="total-summary">
                <p>סה"כ משוער לתשלום:</p>
                <p className="total-price">{total} ₪</p>
              </div>

              <button type="submit" className="submit-btn">שליחת בקשת קביעת תור בוואטסאפ</button>
            </form>
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

              <button type="submit" className="submit-btn">שליחת דיווח אביזרים מהקטלוג לוואטסאפ</button>
            </form>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}

const pageCSS = `
.sb-page {
  --sb-bg: #f5c5b3;

  --sb-primary: #163126;
  --sb-white: #ffffff;
  --sb-card-bg: rgba(255, 255, 255, 0.6);
  --sb-shadow: 0 8px 32px 0 rgba(22, 49, 38, 0.08);
  background-color: var(--sb-bg);
  color: var(--sb-primary);
  line-height: 1.6;
  padding-bottom: 60px;
  font-family: 'Assistant', sans-serif;
}
.sb-page * { box-sizing: border-box; }
.sb-page .sb-hero { text-align: center; padding: 50px 20px; }
.sb-page .logo-container h1 { font-family: 'Platypi', serif; font-size: 4.5rem; font-weight: 600; letter-spacing: -1px; color: var(--sb-primary); line-height: 1; margin: 0; }
.sb-page .logo-container .subtitle { font-size: 1.5rem; font-weight: 600; margin-top: 10px; letter-spacing: 1px; }
.sb-page .container { max-width: 1100px; margin: 0 auto; padding: 20px; }
.sb-page .section-title { text-align: center; margin: 40px 0 20px; font-size: 2rem; font-weight: 700; color: var(--sb-primary); }
.sb-page .section-title::after { content: ''; display: block; width: 50px; height: 3px; background-color: var(--sb-primary); margin: 8px auto 0; border-radius: 2px; }
.sb-page .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 25px; margin-bottom: 40px; }
.sb-page .card { background: var(--sb-card-bg); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.4); border-radius: 20px; padding: 30px; box-shadow: var(--sb-shadow); transition: transform .3s, box-shadow .3s; display: flex; flex-direction: column; justify-content: space-between; }
.sb-page .card:hover { transform: translateY(-5px); box-shadow: 0 12px 40px 0 rgba(22,49,38,.15); }
.sb-page .card-header h3 { font-size: 1.6rem; margin-bottom: 10px; }
.sb-page .price { font-size: 2rem; font-weight: 700; margin-bottom: 15px; }
.sb-page .price span { font-size: 1rem; font-weight: 400; }
.sb-page .card-body ul { list-style: none; margin: 0 0 25px; padding: 0; }
.sb-page .card-body ul li { margin-bottom: 10px; position: relative; padding-right: 20px; }
.sb-page .card-body ul li::before { content: '✦'; position: absolute; right: 0; color: var(--sb-primary); }
.sb-page .booking-box { background: var(--sb-white); border-radius: 25px; padding: 40px; box-shadow: var(--sb-shadow); margin-top: 50px; }
.sb-page .form-group { margin-bottom: 20px; }
.sb-page .booking-box label { display: block; font-weight: 600; margin-bottom: 8px; color: var(--sb-primary); }
.sb-page input[type=text], .sb-page input[type=tel], .sb-page input[type=date], .sb-page select { width: 100%; padding: 12px 15px; border: 1px solid rgba(22,49,38,.2); border-radius: 10px; background-color: #fafafa; color: var(--sb-primary); font-size: 1rem; outline: none; transition: border-color .3s; font-family: inherit; }
.sb-page input:focus, .sb-page select:focus { border-color: var(--sb-primary); }
.sb-page .radio-selectors { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 10px; }
.sb-page .selector-item { position: relative; }
.sb-page .selector-item input { position: absolute; opacity: 0; cursor: pointer; }
.sb-page .selector-label { display: block; padding: 15px; border: 1px solid rgba(22,49,38,.2); border-radius: 12px; text-align: center; cursor: pointer; background-color: var(--sb-white); transition: all .3s; font-weight: 600; margin-bottom: 0; }
.sb-page .selector-item input:checked + .selector-label { background-color: var(--sb-primary); color: var(--sb-bg); border-color: var(--sb-primary); }
.sb-page .products-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 10px; }
.sb-page .product-checkbox { display: none; }
.sb-page .product-label { display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 15px; border: 1px dashed rgba(22,49,38,.3); border-radius: 12px; cursor: pointer; background-color: #fdfcfb; transition: all .3s; text-align: center; margin-bottom: 0; }
.sb-page .product-label .prod-img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px; margin-bottom: 8px; }
.sb-page .product-label .prod-name { font-weight: 600; font-size: .95rem; }
.sb-page .product-label .prod-price { font-size: .85rem; opacity: .8; margin-top: 4px; }
.sb-page .product-checkbox:checked + .product-label { background-color: rgba(22,49,38,.05); border: 2px solid var(--sb-primary); color: var(--sb-primary); }
.sb-page .total-summary { background-color: #f7ede9; border-radius: 15px; padding: 25px; margin-top: 30px; text-align: center; border: 2px dashed var(--sb-primary); }
.sb-page .total-price { font-size: 2.5rem; font-weight: 700; margin-top: 10px; }
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

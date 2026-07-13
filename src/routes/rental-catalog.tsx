import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import catalogData from "@/data/studio-catalog.json";
import { smartSearchItems } from "@/lib/ai.functions";

export const Route = createFileRoute("/rental-catalog")({
  head: () => ({
    meta: [
      { title: "קטלוג אביזרים להשכרה | Sweetbaby" },
      {
        name: "description",
        content:
          "קטלוג מלא של אביזרים להשכרה לצילומי ניו-בורן, משפחה וגיל שנה. סימון האביזרים ושליחת בקשה במייל.",
      },
    ],
  }),
  component: RentalCatalogPage,
});

const EMAIL_TO = "s0548529277@gmail.com";

type Item = { sku: string; name: string; price: number; img: string; alt: string; hasHand?: boolean };
type Category = { title: string; items: Item[] };
const categories = catalogData as Category[];

function RentalCatalogPage() {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [clientName, setClientName] = useState("");
  const [phone, setPhone] = useState("");
  const [hours, setHours] = useState("");
  const [query, setQuery] = useState("");
  const [aiSkus, setAiSkus] = useState<Set<string> | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [lightbox, setLightbox] = useState<Item | null>(null);
  const runSmartSearch = useServerFn(smartSearchItems);

  const toggle = (sku: string) =>
    setSelected((s) => ({ ...s, [sku]: !s[sku] }));

  const allItems = useMemo(() => categories.flatMap((c) => c.items), []);
  const chosen = allItems.filter((i) => selected[i.sku]);
  const total = chosen.reduce((sum, i) => sum + i.price, 0);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q && !aiSkus) return categories;
    return categories
      .map((c) => ({
        ...c,
        items: c.items.filter((it) => {
          if (aiSkus) return aiSkus.has(it.sku);
          return it.sku.includes(q) || it.name.includes(q) || it.alt.includes(q);
        }),
      }))
      .filter((c) => c.items.length > 0);
  }, [query, aiSkus]);

  const doAiSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setAiLoading(true);
    try {
      const { skus } = await runSmartSearch({ data: { query: q } });
      setAiSkus(new Set(skus));
    } catch {
      setAiSkus(null);
    } finally {
      setAiLoading(false);
    }
  };
  const clearAi = () => { setAiSkus(null); setQuery(""); };


  const submit = () => {
    if (!clientName.trim() || !phone.trim()) {
      alert("נא למלא שם וטלפון לפני השליחה.");
      return;
    }
    if (chosen.length === 0) {
      alert("נא לבחור לפחות אביזר אחד מהקטלוג.");
      return;
    }
    if (total < 50) {
      alert("מינימום הזמנה: 50 ₪.");
      return;
    }
    const lines = chosen
      .map((i) => `#${i.sku} - ${i.name} - ${i.price} ₪`)
      .join("\n");
    const subject = `בקשת השכרת אביזרים - ${clientName}`;
    let body = `שם מלא: ${clientName}\nטלפון: ${phone}\n`;
    if (hours) body += `משך ההשכרה המבוקש: ${hours}\n`;
    body += `\nפריטים נבחרים (${chosen.length}):\n${lines}\n\nסה"כ משוער: ${total} ₪`;
    window.location.href = `mailto:${EMAIL_TO}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
  };

  return (
    <>
      <Header />
      <div className="sb-rental-cat" dir="rtl">
      <style>{css}</style>

      <header className="sb-header">
        <h1>קטלוג אביזרים להשכרה</h1>
        <div className="subtitle">
          {allItems.length} אביזרים · {categories.length} קטגוריות
        </div>
      </header>

      <div className="sb-container">
        <div className="catalog-box">
          <p className="booking-desc">
            סמנו את האביזרים שתרצו לשכור, מלאו פרטים - והבקשה תישלח אלינו במייל.
            מינימום הזמנה 50 ₪.
          </p>

          <div className="search-row">
            <input
              type="search"
              placeholder='חיפוש חכם: "משהו ורוד לניו-בורן", "כובעים סרוגים", מק״ט...'
              value={query}
              onChange={(e) => { setQuery(e.target.value); if (aiSkus) setAiSkus(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") doAiSearch(); }}
            />
            <button type="button" className="ai-btn" onClick={doAiSearch} disabled={aiLoading || !query.trim()}>
              {aiLoading ? "מחפשת…" : "✨ חיפוש חכם"}
            </button>
            {aiSkus && (
              <button type="button" className="ai-clear" onClick={clearAi}>נקה</button>
            )}
          </div>
          {aiSkus && (
            <div className="ai-hint">תוצאות חיפוש חכם: {aiSkus.size} פריטים</div>
          )}

          {filtered.map((cat) => (
            <div className="cat-block" key={cat.title}>
              <h3 className="cat-title">
                {cat.title} <span className="cat-count">({cat.items.length})</span>
              </h3>
              <div className="item-grid">
                {cat.items.map((it) => {
                  const on = !!selected[it.sku];
                  return (
                    <div key={it.sku} className={`item-card${on ? " checked" : ""}`}>
                      <input
                        type="checkbox"
                        aria-label={`בחר ${it.name || it.sku}`}
                        checked={on}
                        onChange={() => toggle(it.sku)}
                      />
                      {it.img ? (
                        <button type="button" className="img-btn" onClick={() => setLightbox(it)} aria-label="הגדל תמונה">
                          <img src={it.img} alt={it.alt} loading="lazy" />
                        </button>
                      ) : (
                        <div className="no-img">אין תמונה</div>
                      )}
                      <div className="item-info" onClick={() => toggle(it.sku)}>
                        <span>#{it.sku}</span>
                        <span>₪{it.price}</span>
                      </div>
                    </div>
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
                <option value="">משך ההשכרה</option>
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
            מינימום הזמנה 50 ₪. התשלום מתבצע לפני לקיחת האביזרים. לפרטי מדיניות
            ההשכרה המלאה - <a href={`mailto:${EMAIL_TO}`}>כתבו לנו במייל</a>.
          </p>
        </div>
      </div>
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)} role="dialog" aria-modal="true">
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setLightbox(null)} aria-label="סגור">×</button>
            <img src={lightbox.img} alt={lightbox.alt} />
            <div className="lightbox-meta">
              <div><strong>#{lightbox.sku}</strong> · {lightbox.name || lightbox.alt}</div>
              <div>₪{lightbox.price}</div>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}

const css = `
.sb-rental-cat { --bg-color:#f5c5b3; --primary-color:#163126; --white:#fff; --shadow:0 8px 32px 0 rgba(22,49,38,0.08); background:var(--bg-color); color:var(--primary-color); font-family:'Assistant',sans-serif; line-height:1.6; padding-bottom:60px; min-height:100vh; }
.sb-rental-cat * { box-sizing:border-box; }
.sb-rental-cat .sb-header { text-align:center; padding:40px 20px 20px; }
.sb-rental-cat .sb-header h1 { font-family:'Platypi',serif; font-size:3rem; font-weight:600; }
.sb-rental-cat .sb-header .subtitle { font-size:1.1rem; font-weight:600; margin-top:8px; opacity:0.8; }
.sb-rental-cat .sb-container { max-width:1200px; margin:0 auto; padding:20px; }
.sb-rental-cat .catalog-box { background:var(--white); border-radius:25px; padding:30px; box-shadow:var(--shadow); }
.sb-rental-cat .booking-desc { text-align:center; margin-bottom:20px; opacity:0.85; }
.sb-rental-cat .search-row { margin-bottom:25px; }
.sb-rental-cat .search-row input { width:100%; padding:14px 18px; border:2px solid rgba(22,49,38,0.15); border-radius:12px; font-size:1rem; font-family:inherit; background:#fafafa; outline:none; }
.sb-rental-cat .search-row input:focus { border-color:var(--primary-color); }
.sb-rental-cat .cat-block { margin-bottom:35px; }
.sb-rental-cat .cat-title { font-size:1.3rem; font-weight:700; margin-bottom:14px; border-bottom:2px solid rgba(22,49,38,0.15); padding-bottom:6px; }
.sb-rental-cat .cat-count { font-weight:400; opacity:0.6; font-size:0.9rem; }
.sb-rental-cat .item-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:12px; }
.sb-rental-cat .item-card { position:relative; display:block; cursor:pointer; border-radius:12px; overflow:hidden; border:2px solid rgba(22,49,38,0.1); background:#fafafa; transition:all .2s; }
.sb-rental-cat .item-card img { width:100%; height:110px; object-fit:cover; display:block; }
.sb-rental-cat .item-card .no-img { width:100%; height:110px; display:flex; align-items:center; justify-content:center; font-size:0.8rem; opacity:0.4; }
.sb-rental-cat .item-card input[type="checkbox"] { position:absolute; top:6px; left:6px; width:18px; height:18px; accent-color:var(--primary-color); z-index:2; }
.sb-rental-cat .item-info { display:flex; justify-content:space-between; padding:6px 8px; font-size:0.78rem; font-weight:700; }
.sb-rental-cat .item-card.checked { border-color:var(--primary-color); box-shadow:0 0 0 2px var(--primary-color); }
.sb-rental-cat .item-card.checked .item-info { background:var(--primary-color); color:var(--bg-color); }
.sb-rental-cat .cart-bar { position:sticky; bottom:0; background:var(--primary-color); color:var(--bg-color); padding:14px 20px; border-radius:16px; margin-top:25px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; box-shadow:0 -4px 20px rgba(0,0,0,0.15); z-index:5; }
.sb-rental-cat .cart-count { font-weight:700; }
.sb-rental-cat .cart-total { font-size:1.3rem; font-weight:700; }
.sb-rental-cat .cart-form { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
.sb-rental-cat .cart-form input, .sb-rental-cat .cart-form select { padding:10px 12px; border:1px solid rgba(22,49,38,0.2); border-radius:10px; background:#fafafa; color:var(--primary-color); font-size:0.95rem; outline:none; min-width:140px; font-family:inherit; }
.sb-rental-cat .submit-btn { background:var(--bg-color); color:var(--primary-color); border:none; padding:12px 22px; font-size:1rem; font-weight:700; border-radius:10px; cursor:pointer; }
.sb-rental-cat .submit-btn:hover { opacity:0.9; }
.sb-rental-cat .info-strip { text-align:center; font-size:0.9rem; opacity:0.75; }
.sb-rental-cat .info-strip a { color:var(--primary-color); font-weight:700; }
@media (max-width:768px) {
  .sb-rental-cat .sb-header h1 { font-size:2rem; }
  .sb-rental-cat .item-grid { grid-template-columns:repeat(auto-fill,minmax(100px,1fr)); }
  .sb-rental-cat .item-card img, .sb-rental-cat .item-card .no-img { height:85px; }
  .sb-rental-cat .cart-bar { flex-direction:column; align-items:stretch; }
}
.sb-rental-cat .search-row { display:flex; gap:8px; align-items:center; }
.sb-rental-cat .search-row input { flex:1; }
.sb-rental-cat .ai-btn { background:var(--primary-color); color:var(--bg-color); border:none; padding:14px 18px; border-radius:12px; font-weight:700; cursor:pointer; white-space:nowrap; font-family:inherit; }
.sb-rental-cat .ai-btn:disabled { opacity:0.5; cursor:not-allowed; }
.sb-rental-cat .ai-clear { background:transparent; color:var(--primary-color); border:1px solid var(--primary-color); padding:12px 14px; border-radius:12px; font-weight:600; cursor:pointer; font-family:inherit; }
.sb-rental-cat .ai-hint { background:rgba(22,49,38,0.08); padding:8px 14px; border-radius:10px; margin-bottom:18px; font-size:0.9rem; font-weight:600; }
.sb-rental-cat .item-card { cursor:default; }
.sb-rental-cat .img-btn { display:block; width:100%; padding:0; border:none; background:none; cursor:zoom-in; }
.sb-rental-cat .item-info { cursor:pointer; }
.sb-rental-cat .lightbox { position:fixed; inset:0; background:rgba(0,0,0,0.85); z-index:200; display:flex; align-items:center; justify-content:center; padding:20px; }
.sb-rental-cat .lightbox-inner { position:relative; max-width:min(90vw,900px); max-height:90vh; background:#fff; border-radius:16px; overflow:hidden; display:flex; flex-direction:column; }
.sb-rental-cat .lightbox-inner img { max-width:100%; max-height:75vh; object-fit:contain; background:#000; }
.sb-rental-cat .lightbox-meta { padding:14px 20px; display:flex; justify-content:space-between; font-weight:700; font-size:1.05rem; }
.sb-rental-cat .lightbox-close { position:absolute; top:8px; left:8px; width:38px; height:38px; border-radius:50%; border:none; background:rgba(0,0,0,0.6); color:#fff; font-size:22px; cursor:pointer; z-index:2; }
`;

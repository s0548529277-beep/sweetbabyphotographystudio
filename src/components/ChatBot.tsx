import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { chatWithBot } from "@/lib/ai.functions";
import { checkItemsAvailability } from "@/lib/orders.functions";
import { useAuth } from "@/lib/auth";

type Msg = { role: "user" | "assistant"; content: string };

export function ChatBot() {
  const { user } = useAuth();
  const isAuth = !!user;
  const userName =
    (user?.user_metadata as { full_name?: string; name?: string } | null)?.full_name ||
    (user?.user_metadata as { full_name?: string; name?: string } | null)?.name ||
    user?.email?.split("@")[0] ||
    undefined;

  const [open, setOpen] = useState(false);
  const greeting = isAuth
    ? `שלום ${userName || ""} 💬 אני העוזרת של Sweetbaby. אפשר לשאול אותי ישירות "האם הסטודיו פנוי ב-12.8 בשעה 9:00?" או "האם מק״ט 461 פנוי בשבוע הבא?" — אני בודקת ביומן ובמלאי בזמן אמת.`
    : `שלום! אני העוזרת של Sweetbaby 💬 אפשר לשאול אותי ישירות "האם הסטודיו פנוי ב-12.8 בשעה 9:00?" או "האם מק״ט 461 פנוי מחר?" — אני בודקת ביומן ובמלאי בזמן אמת.`;

  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: greeting }]);
  // One id per browser tab's chat session (kept in sessionStorage so it
  // survives a page reload within the same visit) — lets the admin see the
  // whole conversation as one log entry instead of scattered messages.
  const [sessionId] = useState(() => {
    try {
      const key = "sweetbaby-chat-session-id";
      const existing = sessionStorage.getItem(key);
      if (existing) return existing;
      const fresh = crypto.randomUUID();
      sessionStorage.setItem(key, fresh);
      return fresh;
    } catch {
      return crypto.randomUUID();
    }
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [availOpen, setAvailOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [skuInput, setSkuInput] = useState("");
  const [availLoading, setAvailLoading] = useState(false);
  const chat = useServerFn(chatWithBot);
  const checkAvail = useServerFn(checkItemsAvailability);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, availOpen]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const { reply } = await chat({ data: { messages: next, userName, isAuthenticated: isAuth, sessionId } });
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "מצטערת, יש תקלה זמנית. נסי שוב." }]);
    } finally {
      setLoading(false);
    }
  };

  const runAvailability = async () => {
    if (!dateFrom || !dateTo) return;
    const skus = skuInput
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (skus.length === 0) {
      setMessages((m) => [...m, { role: "assistant", content: "רשמי מק״טים (מספרים) מופרדים בפסיק — לדוגמה: 461, 483, 510" }]);
      return;
    }
    setAvailLoading(true);
    try {
      const res = await checkAvail({ data: { skus, from: dateFrom, to: dateTo } });
      const lines: string[] = [`בדיקת זמינות ${dateFrom} → ${dateTo}:`];
      for (const sku of skus) {
        const r = res[sku];
        if (!r) lines.push(`• מק״ט ${sku}: לא נמצא בקטלוג`);
        else if (r.available > 0) lines.push(`• מק״ט ${sku}: פנוי ✓`);
        else lines.push(`• מק״ט ${sku}: תפוס ✗`);
      }
      lines.push("להזמנה: פתחי /rental-catalog, בחרי תאריכים והוסיפי אביזרים לעגלה.");
      setMessages((m) => [...m, { role: "assistant", content: lines.join("\n") }]);
      setAvailOpen(false);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: "לא הצלחתי לבדוק זמינות כרגע. נסי שוב בעוד רגע." }]);
    } finally {
      setAvailLoading(false);
    }
  };

  return (
    <div dir="rtl" style={{ position: "fixed", bottom: 20, left: 20, zIndex: 100 }}>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="פתח צ'אט"
          style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 20px 12px 14px", borderRadius: 999, border: "none",
            background: "#163126", color: "#f5c5b3", cursor: "pointer",
            boxShadow: "0 12px 32px rgba(22,49,38,0.4)",
            fontFamily: "'Assistant',sans-serif",
          }}
        >
          <span style={{
            width: 56, height: 56, borderRadius: "50%", background: "#f5c5b3",
            color: "#163126", fontSize: 30, display: "flex", alignItems: "center", justifyContent: "center",
          }}>💬</span>
          <span style={{ fontSize: "1rem", fontWeight: 700, paddingLeft: 6 }}>
            שאלי אותי כל דבר ✨
          </span>
        </button>
      )}

      {open && (
        <div style={{
          width: 360, height: 540, background: "#fff", borderRadius: 20,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column",
          overflow: "hidden", fontFamily: "'Assistant',sans-serif",
        }}>
          <div style={{ background: "#163126", color: "#f5c5b3", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 700 }}>Sweetbaby · עוזרת</div>
            <button onClick={() => setOpen(false)} aria-label="סגור" style={{ background: "none", border: "none", color: "#f5c5b3", fontSize: 22, cursor: "pointer" }}>×</button>
          </div>
          <div ref={scrollRef} style={{ flex: 1, padding: 14, overflowY: "auto", background: "#faf7f4" }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-start" : "flex-end", marginBottom: 8 }}>
                <div style={{
                  maxWidth: "82%", padding: "8px 12px", borderRadius: 14,
                  background: m.role === "user" ? "#163126" : "#f5c5b3",
                  color: m.role === "user" ? "#f5c5b3" : "#163126",
                  fontSize: "0.92rem", whiteSpace: "pre-wrap", lineHeight: 1.45,
                }}>{m.content}</div>
              </div>
            ))}
            {loading && <div style={{ opacity: 0.6, fontSize: "0.85rem", textAlign: "center" }}>מקלידה…</div>}
          </div>

          {(
            <div style={{ borderTop: "1px solid #eee", background: "#fff", padding: 10 }}>
              {!availOpen ? (
                <button
                  onClick={() => setAvailOpen(true)}
                  style={{
                    width: "100%", background: "#f5c5b3", color: "#163126", border: "none",
                    padding: "8px 12px", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: "0.9rem",
                  }}
                >
                  🔍 בדיקת זמינות מהירה
                </button>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                      style={{ flex: 1, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 8, fontSize: "0.85rem" }} />
                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                      style={{ flex: 1, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 8, fontSize: "0.85rem" }} />
                  </div>
                  <input
                    value={skuInput}
                    onChange={(e) => setSkuInput(e.target.value)}
                    placeholder="מק״טים לדוגמה: 461, 483"
                    style={{ padding: "6px 8px", border: "1px solid #ddd", borderRadius: 8, fontSize: "0.85rem" }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={runAvailability} disabled={availLoading}
                      style={{ flex: 1, background: "#163126", color: "#f5c5b3", border: "none", padding: "8px", borderRadius: 8, cursor: "pointer", fontSize: "0.85rem", fontWeight: 700 }}>
                      {availLoading ? "בודקת…" : "בדקי"}
                    </button>
                    <button onClick={() => setAvailOpen(false)}
                      style={{ background: "#eee", border: "none", padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: "0.85rem" }}>
                      ביטול
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ padding: 10, borderTop: "1px solid #eee", display: "flex", gap: 6 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder="שאלי אותי..."
              style={{ flex: 1, padding: "10px 12px", border: "1px solid #ddd", borderRadius: 10, outline: "none", fontFamily: "inherit", fontSize: "0.95rem" }}
            />
            <button onClick={send} disabled={loading} style={{ background: "#163126", color: "#f5c5b3", border: "none", padding: "0 16px", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>שלחי</button>
          </div>
        </div>
      )}
    </div>
  );
}

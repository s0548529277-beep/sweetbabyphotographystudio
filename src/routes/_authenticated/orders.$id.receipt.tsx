import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Printer, ArrowRight, Loader2, PlayCircle } from "lucide-react";
import { StudioGuideModal } from "@/components/StudioGuideModal";

export const Route = createFileRoute("/_authenticated/orders/$id/receipt")({
  component: ReceiptPage,
  head: () => ({
    meta: [
      { title: "אישור הזמנה | Sweetbaby" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const STATUS_HE: Record<string, string> = {
  pending: "ממתין לאישור",
  confirmed: "אושר",
  active: "בהשכרה",
  returned: "הוחזר",
  cancelled: "בוטל",
};

const TRACK_HE: Record<string, string> = {
  studio: "סטודיו",
  props: "השכרת אביזרים",
};

function ReceiptPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (error) setError(error.message);
      else if (!data) setError("ההזמנה לא נמצאה");
      else setOrder(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (error || !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <p className="text-muted-foreground">{error ?? "ההזמנה לא נמצאה"}</p>
        <Button onClick={() => nav({ to: "/account" })} className="rounded-full">
          חזרה לכרטיסייה
        </Button>
      </div>
    );
  }

  const items: any[] = order.order_items ?? [];
  const itemsTotal = items.reduce((s, it) => s + Number(it.price) * it.quantity, 0);
  const total = Number(order.total ?? 0);
  const deposit = Number(order.deposit_amount ?? 0);
  const balance = Number(order.balance_amount ?? Math.max(0, total - deposit));
  const overtime = Number(order.overtime_charge ?? 0);
  const cancellation = Number(order.cancellation_charge ?? 0);

  const fmt = (n: number) => `₪${n.toFixed(0)}`;
  const dateHe = (v?: string | null) =>
    v ? new Date(v).toLocaleDateString("he-IL") : "—";

  return (
    <div dir="rtl" className="min-h-screen bg-cream/40 print:bg-white">
      {/* Print styles */}
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          .no-print { display: none !important; }
          body { background: white !important; }
          .receipt-card {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="no-print flex items-center justify-between mb-6">
          <Link
            to="/account"
            className="inline-flex items-center gap-2 text-sm text-forest hover:text-primary"
          >
            <ArrowRight className="h-4 w-4" />
            חזרה לכרטיסייה
          </Link>
          <Button onClick={() => window.print()} className="rounded-full gap-2">
            <Printer className="h-4 w-4" />
            הורדה / הדפסה כ-PDF
          </Button>
        </div>

        <div className="receipt-card bg-card rounded-3xl p-10 border border-primary/10 shadow-[var(--shadow-soft)]">
          <div className="flex items-start justify-between border-b border-primary/10 pb-6 mb-6">
            <div>
              <div className="text-[10px] tracking-[0.35em] uppercase text-forest/70">
                Sweetbaby Photography Studio
              </div>
              <h1 className="font-display text-3xl text-primary mt-1">אישור הזמנה</h1>
              <div className="text-xs text-muted-foreground mt-1">בית שמש · sweetbaby</div>
            </div>
            <div className="text-left">
              <div className="text-xs text-muted-foreground">מספר הזמנה</div>
              <div className="font-mono text-sm">{order.id.slice(0, 8).toUpperCase()}</div>
              <div className="text-xs text-muted-foreground mt-2">תאריך הפקה</div>
              <div className="text-sm">{dateHe(order.created_at)}</div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-6 mb-8 text-sm">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                פרטי לקוח/ה
              </div>
              <div className="font-medium text-primary">
                {order.contact_name ?? "—"}
              </div>
              <div className="text-muted-foreground" dir="ltr">
                {order.contact_phone ?? user?.email ?? ""}
              </div>
              {user?.email && (
                <div className="text-muted-foreground" dir="ltr">
                  {user.email}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                פרטי ההזמנה
              </div>
              <div>
                מסלול: <span className="font-medium">{TRACK_HE[order.track] ?? order.track ?? "—"}</span>
              </div>
              <div>
                סטטוס: <span className="font-medium">{STATUS_HE[order.status] ?? order.status}</span>
              </div>
              {order.session_date && (
                <div>תאריך צילום: {dateHe(order.session_date)}</div>
              )}
              {order.scheduled_date && !order.session_date && (
                <div>תאריך יעד: {dateHe(order.scheduled_date)}</div>
              )}
              {order.return_date && <div>תאריך החזרה: {dateHe(order.return_date)}</div>}
              {order.camera_model && <div>מצלמה: {order.camera_model}</div>}
            </div>
          </div>

          {items.length > 0 && (
            <div className="mb-8">
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
                פריטים
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right border-b border-primary/10 text-muted-foreground">
                    <th className="py-2 font-normal">פריט</th>
                    <th className="py-2 font-normal">מק"ט</th>
                    <th className="py-2 font-normal text-center">כמות</th>
                    <th className="py-2 font-normal text-left">מחיר יח'</th>
                    <th className="py-2 font-normal text-left">סה"כ</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b border-primary/5">
                      <td className="py-2">{it.item_name}</td>
                      <td className="py-2 text-muted-foreground" dir="ltr">
                        {it.item_sku ?? "—"}
                      </td>
                      <td className="py-2 text-center">{it.quantity}</td>
                      <td className="py-2 text-left">{fmt(Number(it.price))}</td>
                      <td className="py-2 text-left">
                        {fmt(Number(it.price) * it.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="ml-auto max-w-xs text-sm space-y-1 border-t border-primary/10 pt-4">
            {items.length > 0 && (
              <Row label="סכום פריטים" value={fmt(itemsTotal)} />
            )}
            {overtime > 0 && <Row label="חיוב חריגה" value={fmt(overtime)} />}
            {cancellation > 0 && <Row label="דמי ביטול" value={fmt(cancellation)} />}
            <Row label='סה"כ לתשלום' value={fmt(total)} strong />
            {deposit > 0 && (
              <>
                <Row
                  label={`מקדמה (${order.deposit_status === "paid" ? "שולם" : "בהמתנה"})`}
                  value={fmt(deposit)}
                />
                <Row label="יתרה" value={fmt(balance)} />
              </>
            )}
          </div>

          {order.notes && (
            <div className="mt-8 pt-6 border-t border-primary/10 text-sm">
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
                הערות
              </div>
              <p className="whitespace-pre-wrap text-foreground/80">{order.notes}</p>
            </div>
          )}

          <div className="mt-10 pt-6 border-t border-primary/10 text-[11px] text-muted-foreground leading-relaxed">
            <p>
              מסמך זה משמש אישור הזמנה לצורכי תיעוד ואינו מהווה חשבונית מס. חשבונית מס-קבלה תופק בעת התשלום בפועל.
            </p>
            <p className="mt-1">
              לשאלות ניתן לפנות אלינו דרך דף &quot;צור קשר&quot; באתר.
            </p>
          </div>
        </div>

        {order.track === "studio" && (
          <div className="no-print flex flex-col items-center gap-2 mt-8 text-center">
            <button
              type="button"
              onClick={() => setShowGuide(true)}
              className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-[#2d3d2b] text-[#f8ede4] text-sm font-semibold hover:bg-[#2d3d2b]/90 transition-colors"
            >
              <PlayCircle className="h-4 w-4" /> הדרכה מהסטודיו
            </button>
            <p className="text-xs text-muted-foreground max-w-sm">
              לפני ההגעה, כדאי לצפות בהדרכה הקצרה שלנו — איך להשתמש בציוד ובחלל הסטודיו, כדי שהצילום יזרום בלי הפתעות.
            </p>
          </div>
        )}
      </div>

      <StudioGuideModal open={showGuide} onClose={() => setShowGuide(false)} />
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between ${strong ? "text-primary font-display text-lg pt-1" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span dir="ltr">{value}</span>
    </div>
  );
}

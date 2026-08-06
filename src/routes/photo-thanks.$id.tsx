import { heError } from "@/lib/he-errors";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ArrivalDirections } from "@/components/ArrivalDirections";
import { finalizePhotographySession } from "@/lib/photography.functions";
import { PAYMENT_LABELS } from "@/lib/photography-options";
import { Check, Clock, CalendarDays, Wallet, Mail } from "lucide-react";

export const Route = createFileRoute("/photo-thanks/$id")({
  component: PhotoThanks,
  head: () => ({ meta: [{ title: "הסשן נקבע | Sweetbaby" }, { name: "robots", content: "noindex, nofollow" }] }),
});

function PhotoThanks() {
  const { id } = Route.useParams();
  const [record, setRecord] = useState<any>(null);
  const [method, setMethod] = useState<"cash" | "transfer" | "bit" | "later">("cash");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const finalize = useServerFn(finalizePhotographySession);

  useEffect(() => {
    supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => setRecord(data));
  }, [id]);

  const hours = record ? `${String(record.start_time).slice(0, 5)}–${String(record.end_time).slice(0, 5)}` : "";

  const close = async () => {
    setBusy(true);
    try {
      await finalize({ data: { id, payment_method: method, email: email.trim() || null } });
      toast.success("ההזמנה אושרה ונשלחה במייל ✓");
      setDone(true);
    } catch (e) {
      toast.error(heError(e, "סגירת ההזמנה נכשלה"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <section className="container-page py-14 flex-1">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="text-center">
            <div className="mx-auto h-14 w-14 rounded-full bg-forest/10 flex items-center justify-center mb-4">
              <Check className="h-7 w-7 text-forest" />
            </div>
            <h1 className="font-display text-4xl md:text-5xl text-primary mb-2">שלום ותודה! הסשן נקבע ✓</h1>
            <p className="text-muted-foreground">
              המועד נשמר ביומן הסטודיו. <strong className="text-primary">המועד מאושר סופית לאחר תיאום עם הצלמת.</strong>
            </p>
          </div>

          {record && (
            <div className="glass-card rounded-3xl p-6 grid sm:grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2 text-primary">
                <CalendarDays className="h-4 w-4 text-peach-deep" /> תאריך: {record.session_date}
              </div>
              <div className="flex items-center gap-2 text-primary">
                <Clock className="h-4 w-4 text-peach-deep" /> שעות: <span dir="ltr">{hours}</span>
              </div>
              <div className="sm:col-span-2 text-muted-foreground">
                השעות שלך הן <span dir="ltr" className="text-primary font-medium">{hours}</span> — יש להקפיד על הזמנים.
              </div>
            </div>
          )}

          {done ? (
            <div className="glass-card rounded-3xl p-8 text-center space-y-3">
              <h2 className="font-display text-3xl text-primary">ההזמנה אושרה ונשלחה במייל</h2>
              <p className="text-muted-foreground">
                השעות שלך הן <span dir="ltr" className="text-primary font-medium">{hours}</span> — יש להקפיד על הזמנים.
              </p>
              <Link to="/account"><Button className="rounded-full">לכרטיסייה שלי</Button></Link>
            </div>
          ) : (
            <div className="glass-card rounded-3xl p-6 space-y-4">
              <h2 className="font-display text-2xl text-primary flex items-center gap-2">
                <Wallet className="h-5 w-5 text-peach-deep" /> סגירת ההזמנה ותשלום
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(["cash", "transfer", "bit", "later"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={`h-12 rounded-xl text-sm border transition-colors ${method === m ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card hover:border-primary"}`}
                  >
                    {m === "cash" ? "מזומן במקום" : PAYMENT_LABELS[m]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {method === "cash" ? "התשלום יתבצע במזומן במקום ביום הצילום." : "פרטי התשלום יישלחו במייל לאחר סגירת ההזמנה."}
              </p>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">אימייל לאישור (אופציונלי)</label>
                <input
                  dir="ltr"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1 w-full h-11 rounded-xl border border-border bg-card px-3"
                />
              </div>
              <Button onClick={close} disabled={busy} className="w-full h-12 rounded-full gap-2">
                <Mail className="h-4 w-4" /> {busy ? "שולח…" : "סגירת הזמנה ושליחת אישור למייל"}
              </Button>
            </div>
          )}

          <ArrivalDirections />
        </div>
      </section>
      <Footer />
    </div>
  );
}

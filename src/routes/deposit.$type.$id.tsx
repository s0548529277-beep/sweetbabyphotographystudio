import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Copy, Check, Upload, Banknote, CreditCard, Wallet } from "lucide-react";

export const Route = createFileRoute("/deposit/$type/$id")({
  component: Deposit,
  head: () => ({ meta: [{ title: "סיום תשלום | Sweetbaby" }, { name: "robots", content: "noindex, nofollow" }] }),
});

const BANK = { bank: "12", branch: "533", account: "648912", name: "מיכל סיבוני" };

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="w-full flex items-center justify-between p-4 rounded-2xl border border-border bg-card hover:border-primary transition-colors text-right"
    >
      <div>
        <div className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground">{label}</div>
        <div className="font-display text-2xl text-primary" dir="ltr">
          {value}
        </div>
      </div>
      {copied ? <Check className="h-5 w-5 text-forest" /> : <Copy className="h-5 w-5 text-muted-foreground" />}
    </button>
  );
}

function Deposit() {
  const { user } = useAuth();
  const { type, id } = Route.useParams();
  const isStudio = type === "booking";
  const [record, setRecord] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  // Studio rentals are digital-payment only — no cash deposit.
  const [method, setMethod] = useState<"cash" | "transfer" | "bit">(isStudio ? "transfer" : "cash");
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);


  useEffect(() => {
    const table = type === "booking" ? "bookings" : "orders";
    (supabase.from(table) as any)
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }: any) => setRecord(data));
  }, [type, id]);

  const total = record?.price ?? record?.total ?? 0;
  const needsReceipt = method !== "cash";

  const submit = async () => {
    if (!user) return;
    if (needsReceipt && !file) {
      toast.error("יש להעלות אסמכתא לתשלום שאינו במזומן");
      return;
    }
    setUploading(true);
    try {
      const table = type === "booking" ? "bookings" : "orders";
      let receiptPath: string | null = null;
      if (needsReceipt && file) {
        const ext =
          file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
        receiptPath = `${user.id}/${type}-${id}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("receipts").upload(receiptPath, file, { upsert: false });
        if (upErr) throw upErr;
      }
      const { error: updErr } = await (supabase.from(table) as any)
        .update({
          deposit_receipt_url: receiptPath,
          deposit_status: method === "cash" ? "cash_pending" : "submitted",
          balance_method: method,
          balance_amount: 0,
        })
        .eq("id", id);
      if (updErr) throw updErr;
      toast.success(
        method === "cash"
          ? "מעולה! נחכה לך עם התשלום במזומן ביום האיסוף."
          : "האסמכתא נשלחה. נאשר לך במייל תוך זמן קצר.",
      );
      setDone(true);
    } catch (err: any) {
      toast.error(err?.message ?? "שגיאה בשליחה");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <section className="container-page py-14 flex-1">
        <div className="max-w-4xl mx-auto">
          <div className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-3">Step 3 · Payment</div>
          <h1 className="font-display text-5xl text-primary mb-3">סיום תשלום</h1>
          <p className="text-muted-foreground max-w-2xl mb-10">
            
            לסיום ההזמנה יש להעביר תשלום מלא של <span className="text-primary font-semibold">{total}₪</span>.{" "}
            {isStudio
              ? "התשלום מתבצע בהעברה בנקאית או ב-Bit/PayBox עם צירוף אסמכתא."
              : "אפשר לשלם במזומן ביום האיסוף (ללא צורך באסמכתא) או בהעברה בנקאית / Bit עם צירוף אסמכתא."}
          </p>


          {done ? (
            <div className="glass-card rounded-3xl p-10 text-center">
              <div className="mx-auto h-14 w-14 rounded-full bg-forest/10 flex items-center justify-center mb-4">
                <Check className="h-7 w-7 text-forest" />
              </div>
              <h2 className="font-display text-3xl text-primary mb-2">
                {method === "cash" ? "ההזמנה נשמרה" : "קיבלנו את האסמכתא"}
              </h2>
              <p className="text-muted-foreground mb-6">
                {method === "cash"
                  ? "התשלום יבוצע במזומן ביום האיסוף. נשלח אישור למייל."
                  : "נשלח לך אישור סופי במייל. מחכות לפגוש אותך!"}
              </p>
              <Link to="/account">
                <Button className="rounded-full">לחשבון שלי</Button>
              </Link>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="glass-card rounded-3xl p-6 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="h-5 w-5 text-blush-deep" />
                  <h2 className="font-display text-xl text-primary">אופן תשלום</h2>
                </div>
                <div className={`grid gap-2 ${isStudio ? "grid-cols-2" : "grid-cols-3"}`}>
                  {(isStudio ? (["transfer", "bit"] as const) : (["cash", "transfer", "bit"] as const)).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(m)}
                      className={`h-12 rounded-xl text-sm border transition-colors ${method === m ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card hover:border-primary"}`}
                    >
                      {m === "cash" ? "מזומן" : m === "transfer" ? "העברה" : "Bit/PayBox"}
                    </button>
                  ))}
                </div>

                {method === "cash" ? (

                  <div className="mt-2 p-5 rounded-2xl bg-blush/40 text-primary text-sm space-y-2">
                    <div className="flex items-center gap-2 font-medium">
                      <Wallet className="h-4 w-4 text-blush-deep" /> תשלום במזומן ביום האיסוף
                    </div>
                    <p className="text-muted-foreground">
                      אין צורך באסמכתא — פשוט אישרי את ההזמנה ונחכה לך עם הסכום ({total}₪) ביום האיסוף.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 pt-2">
                    <CopyRow label="בנק" value={BANK.bank} />
                    <CopyRow label="סניף" value={BANK.branch} />
                    <CopyRow label="חשבון" value={BANK.account} />
                    <CopyRow label="על שם" value={BANK.name} />
                  </div>
                )}

                <div className="mt-2 p-4 rounded-2xl bg-primary text-primary-foreground text-center">
                  <div className="text-blush text-xs tracking-[0.3em] uppercase mb-1">סכום לתשלום</div>
                  <div className="font-display text-5xl text-blush">₪{total}</div>
                </div>
              </div>

              <div className="glass-card rounded-3xl p-6 space-y-4">
                <h2 className="font-display text-xl text-primary flex items-center gap-2">
                  <Upload className="h-5 w-5 text-blush-deep" />
                  {method === "cash" ? "אישור הזמנה" : "העלאת אסמכתא"}
                </h2>

                {method === "cash" ? (
                  <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    בחרת בתשלום במזומן — לא נדרשת אסמכתא.
                    <br />
                    לחצי על "אישור הזמנה" למטה ונמתין לך ביום האיסוף.
                  </div>
                ) : (
                  <label className="block border-2 border-dashed border-border rounded-2xl p-8 text-center cursor-pointer hover:border-primary transition-colors">
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                    {file ? (
                      <div className="text-primary font-medium">{file.name}</div>
                    ) : (
                      <>
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <div className="text-sm text-muted-foreground">צילום מסך של ההעברה (PDF/JPG/PNG)</div>
                      </>
                    )}
                  </label>
                )}

                <Button
                  disabled={uploading || (needsReceipt && !file)}
                  onClick={submit}
                  className="w-full h-12 rounded-full"
                >
                  {uploading ? "שולח…" : method === "cash" ? "אישור הזמנה במזומן" : "שליחת אסמכתא"}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center flex items-center justify-center gap-1">
                  <Banknote className="h-3 w-3" /> ביטול עד יום האירוע – ללא חיוב. ביום עצמו – חיוב מלא.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
      <Footer />
    </div>
  );
}

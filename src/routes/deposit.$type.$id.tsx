import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Copy, Check, Upload, Banknote, CreditCard } from "lucide-react";

export const Route = createFileRoute("/deposit/$type/$id")({
  component: Deposit,
  head: () => ({ meta: [{ title: "תשלום מקדמה | Sweetbaby" }] }),
});

const BANK = { bank: "12", branch: "533", account: "648912", name: "מיכל סיבוני" };

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="w-full flex items-center justify-between p-4 rounded-2xl border border-border bg-card hover:border-primary transition-colors text-right"
    >
      <div>
        <div className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground">{label}</div>
        <div className="font-display text-2xl text-primary" dir="ltr">{value}</div>
      </div>
      {copied ? <Check className="h-5 w-5 text-forest" /> : <Copy className="h-5 w-5 text-muted-foreground" />}
    </button>
  );
}

function Deposit() {
  const { user } = useAuth();
  const { type, id } = Route.useParams();
  const [record, setRecord] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [balanceMethod, setBalanceMethod] = useState<"cash" | "transfer" | "bit">("cash");
  const [balanceAmount, setBalanceAmount] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const table = type === "booking" ? "bookings" : "orders";
    supabase.from(table).select("*").eq("id", id).maybeSingle().then(({ data }) => {
      setRecord(data);
      if (data) setBalanceAmount(String(data.balance_amount ?? Math.max(0, (data.price ?? data.total_amount ?? 0) - (data.deposit_amount ?? 90))));
    });
  }, [type, id]);

  const submit = async () => {
    if (!file || !user) return;
    setUploading(true);
    try {
      const path = `${user.id}/${type}-${id}-${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("receipts").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const table = type === "booking" ? "bookings" : "orders";
      const { error: updErr } = await supabase.from(table).update({
        deposit_receipt_path: path,
        deposit_status: "submitted",
        balance_method: balanceMethod,
        balance_amount: Number(balanceAmount) || 0,
      }).eq("id", id);
      if (updErr) throw updErr;
      toast.success("האסמכתא נשלחה. נאשר לך במייל תוך זמן קצר.");
      setDone(true);
    } catch (err: any) {
      toast.error(err?.message ?? "שגיאה בהעלאה");
    } finally {
      setUploading(false);
    }
  };

  const depositAmount = record?.deposit_amount ?? 90;
  const total = record?.price ?? record?.total_amount ?? 0;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <section className="container-page py-14 flex-1">
        <div className="max-w-4xl mx-auto">
          <div className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-3">Step 3 · Deposit</div>
          <h1 className="font-display text-5xl text-primary mb-3">שריון סופי במקדמה</h1>
          <p className="text-muted-foreground max-w-2xl mb-10">
            להשלמת השריון יש להעביר <span className="text-primary font-semibold">{depositAmount}₪</span> בהעברה בנקאית ולהעלות אסמכתא. ההעתק יישלח אלינו אוטומטית.
          </p>

          {done ? (
            <div className="glass-card rounded-3xl p-10 text-center">
              <div className="mx-auto h-14 w-14 rounded-full bg-forest/10 flex items-center justify-center mb-4">
                <Check className="h-7 w-7 text-forest" />
              </div>
              <h2 className="font-display text-3xl text-primary mb-2">קיבלנו את האסמכתא</h2>
              <p className="text-muted-foreground mb-6">נשלח לך אישור סופי במייל. מחכות לפגוש אותך!</p>
              <Link to="/_authenticated/account"><Button className="rounded-full">לחשבון שלי</Button></Link>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="glass-card rounded-3xl p-6 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Banknote className="h-5 w-5 text-blush-deep" />
                  <h2 className="font-display text-xl text-primary">פרטי החשבון</h2>
                </div>
                <CopyRow label="בנק" value={BANK.bank} />
                <CopyRow label="סניף" value={BANK.branch} />
                <CopyRow label="חשבון" value={BANK.account} />
                <CopyRow label="על שם" value={BANK.name} />
                <div className="mt-4 p-4 rounded-2xl bg-primary text-primary-foreground text-center">
                  <div className="text-blush text-xs tracking-[0.3em] uppercase mb-1">סכום להעברה</div>
                  <div className="font-display text-5xl text-blush">₪{depositAmount}</div>
                  {total > depositAmount && <div className="text-primary-foreground/60 text-xs mt-2">יתרה לתשלום ביום הצילום: ₪{total - depositAmount}</div>}
                </div>
              </div>

              <div className="glass-card rounded-3xl p-6 space-y-4">
                <h2 className="font-display text-xl text-primary flex items-center gap-2">
                  <Upload className="h-5 w-5 text-blush-deep" /> העלאת אסמכתא
                </h2>
                <label className="block border-2 border-dashed border-border rounded-2xl p-8 text-center cursor-pointer hover:border-primary transition-colors">
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                  {file ? (
                    <div className="text-primary font-medium">{file.name}</div>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <div className="text-sm text-muted-foreground">צילום מסך של ההעברה (PDF/JPG/PNG)</div>
                    </>
                  )}
                </label>

                <div className="pt-2 border-t border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <CreditCard className="h-4 w-4 text-blush-deep" />
                    <span className="text-sm font-medium text-primary">אופן תשלום היתרה</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {(["cash", "transfer", "bit"] as const).map((m) => (
                      <button key={m} type="button" onClick={() => setBalanceMethod(m)}
                        className={`h-11 rounded-xl text-sm border transition-colors ${balanceMethod === m ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card hover:border-primary"}`}>
                        {m === "cash" ? "מזומן" : m === "transfer" ? "העברה" : "Bit/PayBox"}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">סכום היתרה *</label>
                    <Input type="number" min={0} required value={balanceAmount} onChange={(e) => setBalanceAmount(e.target.value)} className="mt-1" dir="ltr" />
                  </div>
                </div>

                <Button disabled={!file || uploading} onClick={submit} className="w-full h-12 rounded-full">
                  {uploading ? "מעלה…" : "שליחת אסמכתא ושריון"}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center">
                  ביטול עד יום האירוע – מקדמה לא מוחזרת. ביטול ביום עצמו – חיוב מלא.
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

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { ArrivalDirections } from "@/components/ArrivalDirections";
import { PayOnlineButton } from "@/components/PayOnlineButton";
import { confirmBookingDeposit } from "@/lib/bookings.functions";
import { Copy, Check, Upload, Banknote, CreditCard, Wallet, PlayCircle } from "lucide-react";
import { StudioGuideModal } from "@/components/StudioGuideModal";


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
  const [method, setMethod] = useState<"cash" | "transfer" | "bit" | "card">(isStudio ? "transfer" : "cash");
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [confirmedPaid, setConfirmedPaid] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const confirmDeposit = useServerFn(confirmBookingDeposit);



  useEffect(() => {
    const table = type === "booking" ? "bookings" : "orders";
    (supabase.from(table) as any)
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }: any) => setRecord(data));
  }, [type, id]);

  const total = record?.price ?? record?.total ?? 0;
  // Studio rentals only require a ₪90 deposit up front; the rest is paid at the studio.
  const payNow = isStudio ? Math.min(90, total) : total;
  const balanceLeft = Math.max(0, total - payNow);
  // Non-cash payments only reserve the date once a receipt is attached
  // OR the customer explicitly confirms the payment was made.
  const showReceiptUpload = method !== "cash";
  const pickupTime = record?.pickup_at
    ? new Date(record.pickup_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
    : null;
  const timeText = isStudio
    ? record?.start_time
      ? `${new Date(record.session_date ?? Date.now()).toLocaleDateString("he-IL")} · ${String(record.start_time).slice(0, 5)}–${String(record.end_time).slice(0, 5)}`
      : ""
    : record?.session_date || record?.scheduled_date
      ? `${new Date(record.session_date ?? record.scheduled_date).toLocaleDateString("he-IL")}${pickupTime ? ` · ${pickupTime}` : ""}`
      : "";


  const submit = async () => {
    if (!user) return;
    if (showReceiptUpload && !file && !confirmedPaid) {
      toast.error("יש לצרף אסמכתא או לאשר שהתשלום בוצע כדי לשריין את התאריך");
      return;
    }
    setUploading(true);
    try {
      const table = type === "booking" ? "bookings" : "orders";
      let receiptPath: string | null = null;
      if (showReceiptUpload && file) {
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
          deposit_amount: payNow,
          balance_amount: balanceLeft,
        })
        .eq("id", id);
      if (updErr) throw updErr;
      // The studio slot is written to the calendar only now — after the
      // deposit was actually transferred / a receipt was uploaded.
      if (isStudio && method !== "cash") {
        try {
          await confirmDeposit({ data: { id } });
        } catch (e) {
          console.error("[SWEETBABY] calendar sync after deposit failed", e);
        }
      }
      toast.success(
        method === "cash"
          ? "מעולה! נחכה לך עם התשלום במזומן ביום האיסוף."
          : receiptPath
            ? "האסמכתא נשלחה והמועד נשמר ביומן. נאשר לך במייל תוך זמן קצר."
            : "התאריך נשמר ביומן. התשלום יאומת ויסומן כ'שולם' בהמשך, עד לסיום ההזמנה.",
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
          <h1 className="font-display text-5xl text-primary mb-10">סיום תשלום</h1>


          {done ? (
            <div className="space-y-6">
              <div className="glass-card rounded-3xl p-10 text-center">
                <div className="mx-auto h-14 w-14 rounded-full bg-forest/10 flex items-center justify-center mb-4">
                  <Check className="h-7 w-7 text-forest" />
                </div>
                <h2 className="font-display text-3xl text-primary mb-2">ההזמנה אושרה ונשלחה במייל ✓</h2>
                {timeText && (
                  <p className="text-primary font-medium mb-2">
                    {isStudio ? "השעות שלך הן " : "שעת האיסוף שלך: "}
                    <span dir="ltr">{timeText}</span> — יש להקפיד על הזמנים.
                  </p>
                )}
                {!isStudio && (
                  <p className="text-sm text-primary/80 mb-2">נא לתאם טלפונית איסוף אביזרים בשעה הרצויה · <span dir="ltr">054-8529277</span></p>
                )}
                <p className="text-muted-foreground mb-6">
                  {method === "cash"
                    ? `התשלום מראש — נא לבוא עם הסכום ₪${payNow} ולהביא סכום מדויק. אישור נשלח למייל.`
                    : file
                      ? "קיבלנו את האסמכתא ואישור נשלח למייל. מחכות לפגוש אותך!"
                      : "התאריך נשמר ואישור נשלח למייל. התשלום יאומת ויסומן כ'שולם' בהמשך, עד לסיום ההזמנה."}
                </p>
                <Link to="/account">
                  <Button className="rounded-full">לחשבון שלי</Button>
                </Link>
                {isStudio && (
                  <div className="mt-6 pt-6 border-t border-primary/10 flex flex-col items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowGuide(true)}
                      className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-[#2d3d2b] text-[#f8ede4] text-sm font-semibold hover:bg-[#2d3d2b]/90 transition-colors"
                    >
                      <PlayCircle className="h-4 w-4" /> הדרכה מהסטודיו
                    </button>
                    <p className="text-xs text-muted-foreground max-w-sm text-center">
                      לפני ההגעה, כדאי לצפות בהדרכה הקצרה שלנו — איך להשתמש בציוד ובחלל הסטודיו.
                    </p>
                  </div>
                )}
              </div>
              <ArrivalDirections />
            </div>
          ) : (

            <div className="grid md:grid-cols-2 gap-6">
              <div className="glass-card rounded-3xl p-6 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="h-5 w-5 text-blush-deep" />
                  <h2 className="font-display text-xl text-primary">אופן תשלום</h2>
                </div>
                <div className={`grid gap-2 ${isStudio ? "grid-cols-3" : "grid-cols-4"}`}>
                  {(isStudio ? (["transfer", "bit", "card"] as const) : (["cash", "transfer", "bit", "card"] as const)).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(m)}
                      className={`h-12 rounded-xl text-sm border transition-colors ${method === m ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card hover:border-primary"}`}
                    >
                      {m === "cash" ? "מזומן" : m === "transfer" ? "העברה" : m === "bit" ? "Bit/PayBox" : "אשראי"}
                    </button>
                  ))}
                </div>

                {/* Secure card payment — studio rental and prop rental alike. */}
                <div className="rounded-2xl border border-border p-4">
                  <PayOnlineButton
                    className="w-full"
                    label={`תשלום מאובטח באשראי · ₪${payNow}`}
                    note="החלון נפתח בתוך האתר. מיד לאחר התשלום אפשר לצרף כאן את אישור התשלום ולסיים את ההזמנה."
                  />
                </div>





                {method === "cash" ? (

                  <div className="mt-2 p-5 rounded-2xl bg-blush/40 text-primary text-sm space-y-2">
                    <div className="flex items-center gap-2 font-medium">
                      <Wallet className="h-4 w-4 text-blush-deep" /> תשלום במזומן ביום האיסוף
                    </div>
                    <p className="text-muted-foreground">
                      התשלום מראש — נא לבוא עם הסכום <span className="text-primary font-semibold">{payNow}₪</span> ולהביא סכום מדויק. אין צורך באסמכתא.
                    </p>
                  </div>
                ) : (
                  method === "card" ? (
                  <div className="mt-2 p-5 rounded-2xl bg-blush/40 text-primary text-sm">
                    שילמתי באשראי דרך הכפתור למעלה — אפשר לצרף צילום מסך של אישור התשלום (מומלץ), או לאשר למטה שהתשלום בוצע. התאריך משתריין רק לאחר אחת מהשתיים.
                  </div>
                ) : (
                  <div className="space-y-3 pt-2">
                    <CopyRow label="בנק" value={BANK.bank} />
                    <CopyRow label="סניף" value={BANK.branch} />
                    <CopyRow label="חשבון" value={BANK.account} />
                    <CopyRow label="על שם" value={BANK.name} />
                  </div>
                ))}


                <div className="mt-2 p-4 rounded-2xl bg-primary text-primary-foreground text-center">
                  <div className="text-blush text-xs tracking-[0.3em] uppercase mb-1">{isStudio ? "מקדמה לתשלום עכשיו" : "סכום לתשלום"}</div>
                  <div className="font-display text-5xl text-blush">₪{payNow}</div>
                  {isStudio && balanceLeft > 0 && (
                    <div className="text-blush/80 text-xs mt-2">יתרה ₪{balanceLeft} תשולם ביום הצילום</div>
                  )}
                </div>
              </div>

              <div className="glass-card rounded-3xl p-6 space-y-4">
                <h2 className="font-display text-xl text-primary flex items-center gap-2">
                  <Upload className="h-5 w-5 text-blush-deep" />
                  {method === "cash" ? "אישור הזמנה" : "העלאת אסמכתא (מומלץ, לא חובה)"}
                </h2>

                {method === "cash" ? (
                  <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    בחרת בתשלום במזומן — לא נדרשת אסמכתא.
                    <br />
                    לחצי על "אישור הזמנה" למטה ונמתין לך ביום האיסוף.
                  </div>
                ) : (
                  <>
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
                          <div className="text-sm text-muted-foreground">צילום מסך של ההעברה (מומלץ, לא חובה)</div>
                        </>
                      )}
                    </label>

                    {!file && (
                      <label className="flex items-start gap-2 p-4 rounded-2xl border border-border bg-card cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={confirmedPaid}
                          onChange={(e) => setConfirmedPaid(e.target.checked)}
                          className="mt-0.5 h-4 w-4 accent-primary"
                        />
                        <span className="text-muted-foreground">
                          אני מאשר/ת שביצעתי את התשלום ({method === "card" ? "אשראי" : method === "bit" ? "Bit/PayBox" : "העברה בנקאית"}) — בלי לצרף אסמכתא כרגע.
                        </span>
                      </label>
                    )}

                    <p className="text-xs text-muted-foreground text-center">
                      התאריך משתריין רק לאחר צירוף אסמכתא או אישור שהתשלום בוצע. התשלום עצמו יסומן כ'שולם' בהמשך, עד לסיום ההזמנה.
                    </p>
                  </>
                )}

                <Button
                  disabled={uploading || (showReceiptUpload && !file && !confirmedPaid)}
                  onClick={submit}
                  className="w-full h-12 rounded-full"
                >
                  {uploading
                    ? "שולח…"
                    : method === "cash"
                      ? "אישור הזמנה במזומן"
                      : file
                        ? "שליחת אסמכתא"
                        : "אישור תשלום ושריון התאריך"}
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
      <StudioGuideModal open={showGuide} onClose={() => setShowGuide(false)} />
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { heError } from "@/lib/he-errors";
import { getEditableOrder, submitOrderEdit, previewOrderEdit, getFreeBookingStarts } from "@/lib/order-edit.functions";
import { EDIT_APPROVAL_WINDOW_HOURS } from "@/lib/order-edit";
import { PROPS_LATEST_HANDOFF } from "@/lib/props-hours";

const searchSchema = z.object({
  kind: z.enum(["booking", "order"]).catch("booking"),
  id: z.string().catch(""),
});

export const Route = createFileRoute("/_authenticated/edit-order")({
  validateSearch: searchSchema,
  component: EditOrder,
  head: () => ({ meta: [{ title: "עריכת הזמנה | Sweetbaby" }, { name: "robots", content: "noindex" }] }),
});

const TIME_OPTIONS = Array.from({ length: 29 }, (_, i) => {
  const m = 7 * 60 + i * 30; // 07:00 .. 21:00
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});

function EditOrder() {
  const { kind, id } = Route.useSearch();
  const getFn = useServerFn(getEditableOrder);
  const submitFn = useServerFn(submitOrderEdit);
  const previewFn = useServerFn(previewOrderEdit);
  const freeFn = useServerFn(getFreeBookingStarts);
  const validId = /^[0-9a-f-]{36}$/i.test(id);
  const q = useQuery({
    queryKey: ["editable-order", kind, id],
    queryFn: () => getFn({ data: { kind, id } }),
    enabled: validId,
    retry: false,
  });

  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [pickup, setPickup] = useState("");
  const [ret, setRet] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [removed, setRemoved] = useState<string[]>([]);
  const [preview, setPreview] = useState<null | { ok: boolean; error?: string; delta?: number; newTotal?: number; needsApproval?: boolean }>(null);
  const [freeTimes, setFreeTimes] = useState<string[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | "applied" | "pending_approval">(null);
  const [appliedWithin24, setAppliedWithin24] = useState(false);

  useEffect(() => {
    const d = q.data;
    if (!d) return;
    if (d.booking) { setDate(d.booking.session_date); setStart(d.booking.start_time); }
    if (d.order) {
      setPickup(d.order.pickup_time ?? ""); setRet(d.order.return_time ?? "");
      setPickupDate(d.order.session_date); setReturnDate(d.order.return_date);
    }
  }, [q.data]);

  // Studio: only the start times that are really free on the chosen date.
  useEffect(() => {
    if (kind !== "booking" || !validId || !date) return;
    let cancelled = false;
    setFreeTimes(null);
    freeFn({ data: { id, date } }).then((r) => { if (!cancelled) setFreeTimes(r.times); }).catch(() => { if (!cancelled) setFreeTimes([]); });
    return () => { cancelled = true; };
  }, [kind, validId, id, date]); // eslint-disable-line react-hooks/exhaustive-deps

  // Props: live check of the price change / availability for what she picked.
  useEffect(() => {
    const o = q.data?.order;
    if (kind !== "order" || !o) return;
    const changed = pickupDate !== o.session_date || returnDate !== o.return_date || pickup !== (o.pickup_time ?? "") || ret !== (o.return_time ?? "") || removed.length > 0;
    if (!changed) { setPreview(null); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      previewFn({ data: { kind, id, pickup_date: pickupDate || undefined, return_date: returnDate || undefined, pickup_time: pickup || undefined, return_time: ret || undefined, remove_skus: removed.length ? removed : undefined } })
        .then((r) => { if (!cancelled) setPreview(r); })
        .catch((e) => { if (!cancelled) setPreview({ ok: false, error: heError(e, "לא ניתן לבדוק את השינוי") }); });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [kind, id, q.data, pickupDate, returnDate, pickup, ret, removed]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!q.data) return;
    setBusy(true);
    try {
      const payload =
        kind === "booking"
          ? { kind, id, session_date: date || undefined, start_time: start || undefined, note: note || undefined }
          : {
              kind, id,
              pickup_time: pickup || undefined, return_time: ret || undefined,
              pickup_date: pickupDate || undefined, return_date: returnDate || undefined,
              remove_skus: removed.length ? removed : undefined,
              note: note || undefined,
            };
      const r = await submitFn({ data: payload });
      setResult(r.status);
      setAppliedWithin24(!!r.within24h && r.status === "applied");
      q.refetch();
    } catch (e) {
      toast.error(heError(e, "העריכה נכשלה"));
    } finally {
      setBusy(false);
    }
  };

  const title = kind === "booking" ? "עריכת שריון סטודיו" : "עריכת הזמנת אביזרים";
  const d = q.data;

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-10 max-w-xl">
        <h1 className="font-display text-4xl text-primary mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {kind === "booking"
            ? <>עריכה פחות מ-{EDIT_APPROVAL_WINDOW_HOURS} שעות לפני המועד טעונה אישור מנהל — הבקשה נשלחת אליה, וההזמנה נשארת כפי שהיא עד שתאושר.</>
            : <>שינוי שלא משנה את המחיר מתבצע מיד. שינוי שמשנה את המחיר (תאריכים אחרים או הסרת פריט) נשלח לאישור מנהל.</>}
        </p>

        {!validId ? (
          <div className="bg-card rounded-2xl p-6 border border-primary/10">הקישור אינו תקין. אפשר להיכנס להזמנה מהאזור האישי.</div>
        ) : q.isLoading ? (
          <div className="text-muted-foreground">טוען…</div>
        ) : q.isError || !d ? (
          <div className="bg-card rounded-2xl p-6 border border-primary/10">
            {heError(q.error, "לא הצלחנו לטעון את ההזמנה")}
            <div className="mt-4"><Link to="/account"><Button variant="outline" className="rounded-full">לאזור האישי</Button></Link></div>
          </div>
        ) : result === "applied" ? (
          <div className="bg-card rounded-2xl p-6 border border-primary/10">
            <div className="font-display text-2xl text-primary mb-2">ההזמנה עודכנה ✓</div>
            <p className="text-sm text-muted-foreground">שלחנו לך מייל עם הפרטים המעודכנים.</p>
            {appliedWithin24 && (
              <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3">
                📞 ההזמנה בתוך 24 שעות — אנא התקשרי אלינו לוודא שהכול תקין: <span dir="ltr">054-8529277</span>
              </div>
            )}
            <div className="mt-4"><Link to="/account"><Button className="rounded-full">לאזור האישי</Button></Link></div>
          </div>
        ) : result === "pending_approval" || d.pending ? (
          <div className="bg-card rounded-2xl p-6 border border-primary/10">
            <div className="font-display text-2xl text-primary mb-2">הבקשה נשלחה לאישור מנהל</div>
            <p className="text-sm text-muted-foreground">
              כי המועד קרוב (פחות מ-{EDIT_APPROVAL_WINDOW_HOURS} שעות), העריכה דורשת אישור. ההזמנה נשארת כפי שהיא עד שהבקשה תאושר, ונעדכן אותך במייל.
            </p>
            <div className="mt-4"><Link to="/account"><Button variant="outline" className="rounded-full">לאזור האישי</Button></Link></div>
          </div>
        ) : !d.editable ? (
          <div className="bg-card rounded-2xl p-6 border border-primary/10">
            <p>{d.blockedReason}</p>
            <p className="text-sm text-muted-foreground mt-2">לעזרה: 054-8529277 · s0548529277@gmail.com</p>
          </div>
        ) : (
          <div className="bg-card rounded-2xl p-6 border border-primary/10 space-y-5">
            {d.within24h && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3">
                {d.kind === "order" ? (
                  <>המועד בעוד פחות מ-{EDIT_APPROVAL_WINDOW_HOURS} שעות — השינוי יתבצע מיד, אך אנא התקשרי אלינו לוודא שהכול תקין: <span dir="ltr">054-8529277</span>. נשלח לך מייל שההזמנה עודכנה.</>
                ) : (
                  <>המועד בעוד פחות מ-{EDIT_APPROVAL_WINDOW_HOURS} שעות — העריכה תישלח לאישור מנהל ולא תתבצע מיד.</>
                )}
              </div>
            )}

            {d.booking && (
              <>
                {d.booking.hasReservedItems && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3">
                    בשריון הזה שוריינו אביזרים — שינוי מועד אפשרי דרך הצוות או הצ׳אט. אפשר להוסיף הערה בלבד.
                  </div>
                )}
                <div>
                  <Label htmlFor="eo-date">תאריך הצילום</Label>
                  <Input id="eo-date" type="date" value={date} min={new Date().toISOString().slice(0, 10)} disabled={d.booking.hasReservedItems} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="eo-start">שעת התחלה (משך השריון נשאר {d.booking.start_time}–{d.booking.end_time})</Label>
                  <select id="eo-start" className="w-full h-10 rounded-md border border-input bg-background px-3" value={start} disabled={d.booking.hasReservedItems} onChange={(e) => setStart(e.target.value)}>
                    {start && !(freeTimes ?? TIME_OPTIONS).includes(start) && <option value={start}>{start}</option>}
                    {(freeTimes ?? TIME_OPTIONS).map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {freeTimes && freeTimes.length === 0 && <p className="text-xs text-red-700 mt-1">אין שעות פנויות בתאריך הזה — נסי תאריך אחר.</p>}
                  {freeTimes && freeTimes.length > 0 && <p className="text-xs text-muted-foreground mt-1">מוצגות רק שעות פנויות בתאריך שנבחר.</p>}
                  <p className="text-xs text-muted-foreground mt-1">אורך השריון והמחיר נשארים אותו דבר. לשינוי משך או חבילה — צוות הסטודיו / הצ׳אט.</p>
                </div>
              </>
            )}

            {d.order && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="eo-pd">תאריך איסוף</Label>
                    <Input id="eo-pd" type="date" value={pickupDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => { setPickupDate(e.target.value); if (returnDate && e.target.value > returnDate) setReturnDate(e.target.value); }} />
                  </div>
                  <div>
                    <Label htmlFor="eo-rd">תאריך החזרה</Label>
                    <Input id="eo-rd" type="date" value={returnDate} min={pickupDate || undefined} onChange={(e) => setReturnDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="eo-pickup">שעת איסוף</Label>
                  <Input id="eo-pickup" type="time" max={PROPS_LATEST_HANDOFF} value={pickup} onChange={(e) => setPickup(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="eo-ret">שעת החזרה</Label>
                  <Input id="eo-ret" type="time" max={PROPS_LATEST_HANDOFF} value={ret} onChange={(e) => setRet(e.target.value)} />
                  <p className="text-xs text-muted-foreground mt-1">איסוף והחזרה עד {PROPS_LATEST_HANDOFF}.</p>
                </div>
                {d.order.lines.length > 1 && (
                  <div>
                    <Label>הסרת פריטים מההזמנה</Label>
                    <div className="mt-1 space-y-1">
                      {d.order.lines.filter((l) => l.sku).map((l) => (
                        <label key={l.sku as string} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={removed.includes(l.sku as string)}
                            disabled={!removed.includes(l.sku as string) && removed.length >= d.order!.lines.length - 1}
                            onChange={(e) => setRemoved((r) => (e.target.checked ? [...r, l.sku as string] : r.filter((x) => x !== l.sku)))}
                          />
                          <span>{l.name}{l.quantity > 1 ? ` ×${l.quantity}` : ""}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">אפשר להסיר פריטים; הוספת פריטים — דרך הצוות או הצ׳אט.</p>
                  </div>
                )}
                {preview && (
                  <div className={`rounded-xl border text-sm p-3 ${preview.ok ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-red-50 border-red-200 text-red-800"}`}>
                    {!preview.ok ? preview.error : preview.delta ? (
                      <>
                        השינוי {preview.delta > 0 ? "מייקר" : "מוזיל"} את ההזמנה ב-₪{Math.abs(preview.delta)} (סה״כ חדש: ₪{preview.newTotal}).
                        שינוי במחיר נשלח לאישור מנהל, וההזמנה נשארת כפי שהיא עד האישור.
                      </>
                    ) : "אין שינוי במחיר."}
                  </div>
                )}
              </>
            )}

            <div>
              <Label htmlFor="eo-note">הערה (רשות)</Label>
              <Textarea id="eo-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="מה חשוב שנדע על השינוי?" />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button className="rounded-full" disabled={busy || (kind === "order" && preview?.ok === false)} onClick={submit}>
                {busy ? "שולח…" : (d.within24h && d.kind === "booking") || (d.kind === "order" && preview?.needsApproval) ? "שליחת בקשה לאישור מנהל" : "שמירת השינויים"}
              </Button>
              <Link to="/account"><Button variant="outline" className="rounded-full">ביטול</Button></Link>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

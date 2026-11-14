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
import { getEditableOrder, submitOrderEdit } from "@/lib/order-edit.functions";
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
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | "applied" | "pending_approval">(null);
  const [appliedWithin24, setAppliedWithin24] = useState(false);

  useEffect(() => {
    const d = q.data;
    if (!d) return;
    if (d.booking) { setDate(d.booking.session_date); setStart(d.booking.start_time); }
    if (d.order) { setPickup(d.order.pickup_time ?? ""); setRet(d.order.return_time ?? ""); }
  }, [q.data]);

  const submit = async () => {
    if (!q.data) return;
    setBusy(true);
    try {
      const payload =
        kind === "booking"
          ? { kind, id, session_date: date || undefined, start_time: start || undefined, note: note || undefined }
          : { kind, id, pickup_time: pickup || undefined, return_time: ret || undefined, note: note || undefined };
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
          עריכה פחות מ-{EDIT_APPROVAL_WINDOW_HOURS} שעות לפני המועד טעונה אישור מנהל — הבקשה נשלחת אליה, וההזמנה נשארת כפי שהיא עד שתאושר.
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
                    {!TIME_OPTIONS.includes(start) && start && <option value={start}>{start}</option>}
                    {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">אורך השריון והמחיר נשארים אותו דבר. לשינוי משך או חבילה — צוות הסטודיו / הצ׳אט.</p>
                </div>
              </>
            )}

            {d.order && (
              <>
                <p className="text-sm text-muted-foreground">
                  איסוף: {d.order.session_date} · החזרה: {d.order.return_date}. שינוי תאריכים או פריטים — דרך הצוות או הצ׳אט (תלוי בזמינות המלאי).
                </p>
                <div>
                  <Label htmlFor="eo-pickup">שעת איסוף</Label>
                  <Input id="eo-pickup" type="time" max={PROPS_LATEST_HANDOFF} value={pickup} onChange={(e) => setPickup(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="eo-ret">שעת החזרה</Label>
                  <Input id="eo-ret" type="time" max={PROPS_LATEST_HANDOFF} value={ret} onChange={(e) => setRet(e.target.value)} />
                  <p className="text-xs text-muted-foreground mt-1">איסוף והחזרה עד {PROPS_LATEST_HANDOFF}. השינוי לא יכול לשנות את מספר ימי ההשכרה.</p>
                </div>
              </>
            )}

            <div>
              <Label htmlFor="eo-note">הערה (רשות)</Label>
              <Textarea id="eo-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="מה חשוב שנדע על השינוי?" />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button className="rounded-full" disabled={busy} onClick={submit}>
                {busy ? "שולח…" : d.within24h && d.kind === "booking" ? "שליחת בקשה לאישור מנהל" : "שמירת השינויים"}
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

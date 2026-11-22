import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { MIN_PIN } from "@/lib/password";
import { getGuestClaimInfo, claimGuestAccount } from "@/lib/guest-claim.functions";

export const Route = createFileRoute("/claim/$kind/$id")({
  validateSearch: z.object({ t: z.string().catch("") }),
  component: ClaimPage,
  head: () => ({ meta: [{ title: "הרשמה מהירה | Sweetbaby" }, { name: "robots", content: "noindex, nofollow" }] }),
});

function ClaimPage() {
  const { kind, id } = Route.useParams();
  const { t } = Route.useSearch();
  const nav = useNavigate();
  const info = useServerFn(getGuestClaimInfo);
  const claim = useServerFn(claimGuestAccount);
  const k = kind === "order" ? "order" : "booking";
  const [state, setState] = useState<"loading" | "ready" | "error" | "registered">("loading");
  const [message, setMessage] = useState("");
  const [credit, setCredit] = useState({ now: 0, expected: 0 });
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    info({ data: { kind: k, id, t } })
      .then((r) => {
        if (!r.ok) {
          if (r.error === "already_registered") setState("registered");
          else { setMessage(r.error); setState("error"); }
          return;
        }
        setForm((f) => ({ ...f, fullName: r.name, phone: r.phone, email: r.email }));
        setCredit({ now: r.creditNow, expected: r.creditExpected });
        setState("ready");
      })
      .catch(() => { setMessage("הקישור אינו תקף."); setState("error"); });
  }, [k, id, t, info]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await claim({ data: { kind: k, id, t, ...form } });
      if (!r.ok) { toast.error(r.error); return; }
      const { error } = await supabase.auth.setSession(r.session);
      if (error) throw error;
      toast.success("נרשמת! ההזמנה והקרדיט עברו לחשבון שלך.");
      nav({ to: "/account" });
    } catch {
      toast.error("ההרשמה נכשלה, נסי שוב.");
    } finally {
      setBusy(false);
    }
  };

  const total = credit.now + credit.expected;
  return (
    <div className="min-h-screen flex flex-col bg-[#f8ede4]" dir="rtl">
      <Header />
      <section className="container-page flex-1 py-14">
        <div className="mx-auto max-w-md rounded-3xl border border-[#2d3d2b]/10 bg-white p-8 shadow-sm">
          {state === "loading" && <p className="text-center text-sm text-muted-foreground">רגע…</p>}
          {state === "error" && <p className="text-center text-sm text-destructive">{message}</p>}
          {state === "registered" && (
            <p className="text-center text-sm">כבר יש חשבון להזמנה הזו. <a className="underline" href="/auth?redirect=/account">להתחברות</a></p>
          )}
          {state === "ready" && (
            <form onSubmit={submit} className="space-y-4">
              <h1 className="font-display text-3xl text-[#2d3d2b]">הרשמה מהירה</h1>
              {total > 0 && (
                <div className="rounded-2xl border-2 border-[#2d3d2b] bg-[#eef4ea] p-4 text-center">
                  <p className="text-2xl font-extrabold text-[#2d3d2b]">🎁 ₪{total} קרדיט מחכה לך</p>
                  <p className="mt-1 text-sm text-[#2d3d2b]/80">נרשמים עכשיו והקרדיט נשמר בחשבון להזמנה הבאה.</p>
                </div>
              )}
              <p className="text-sm text-[#2d3d2b]/75">
                ההזמנה שלך תישמר בחשבון{total > 0 ? <>, וכך גם <b>הקרדיט שלך{credit.now > 0 ? ` (₪${credit.now} שכבר נצבר)` : ""}{credit.expected > 0 ? ` + כ-₪${credit.expected} מההזמנה הזו` : ""}</b></> : ""}.
              </p>
              <div><Label>שם מלא</Label><Input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="mt-1" /></div>
              <div><Label>טלפון</Label><Input required type="tel" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" /></div>
              <div><Label>אימייל</Label><Input required type="email" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" /></div>
              <div>
                <Label>קוד כניסה (לפחות {MIN_PIN} תווים)</Label>
                <Input required minLength={MIN_PIN} type="password" dir="ltr" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1" />
              </div>
              <Button type="submit" disabled={busy} className="w-full rounded-full bg-[#2d3d2b] text-[#f8ede4]">{busy ? "נרשמת…" : "הרשמה ושמירת הקרדיט"}</Button>
            </form>
          )}
        </div>
      </section>
      <Footer />
    </div>
  );
}

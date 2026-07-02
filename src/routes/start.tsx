import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Camera, Sparkles } from "lucide-react";

export const Route = createFileRoute("/start")({
  component: Start,
  head: () => ({ meta: [
    { title: "בואי נכיר | Sweetbaby" },
    { name: "description", content: "התחילו את החוויה ב-Sweetbaby — טופס פתיחה קצר לתיאום צילומי ניוברן, גיל שנה וסשן סטודיו בבית שמש." },
    { property: "og:title", content: "בואי נכיר | Sweetbaby" },
    { property: "og:description", content: "התחילו את החוויה ב-Sweetbaby — טופס פתיחה קצר לתיאום צילומי ניוברן, גיל שנה וסשן סטודיו בבית שמש." },
    { property: "og:url", content: "https://sweetbabyphotographystudio.lovable.app/start" },
  ], links: [{ rel: "canonical", href: "https://sweetbabyphotographystudio.lovable.app/start" }] }),
});

const KEY = "sweetbaby.lead.v1";

function Start() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", referral_source: "" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.from("leads").insert({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        referral_source: form.referral_source.trim(),
      });
      if (error) throw new Error(error.message);
      try { localStorage.setItem(KEY, JSON.stringify({ ...form, ts: Date.now() })); } catch {}
      toast.success("נעים מאוד! בואי נבחר מסלול.");
      nav({ to: "/track" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בשליחה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <section className="container-page py-14 flex-1">
        <div className="grid lg:grid-cols-[1fr_1.1fr] gap-10 lg:gap-16 items-start">
          <div className="space-y-6 lg:pt-8">
            <div className="text-xs tracking-[0.35em] uppercase text-forest/70">Sweetbaby · Studio</div>
            <h1 className="font-display text-5xl md:text-6xl leading-[1.05] text-primary">
              בואי נכיר
              <br />
              <span className="italic text-blush-deep">לפני שנתחיל</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-md leading-relaxed">
              נשמח לשמוע כמה מילים עלייך כדי להתאים את החוויה. הפרטים נשמרים אצלנו בלבד ומשמשים לתיאום הצילום.
            </p>
            <div className="flex flex-col gap-3 pt-2 text-sm text-forest">
              <div className="flex items-center gap-3"><Camera className="h-4 w-4 text-blush-deep" /> סטודיו ניוברן ולייף סטייל בבית שמש</div>
              <div className="flex items-center gap-3"><Sparkles className="h-4 w-4 text-blush-deep" /> מאות אביזרים מעוצבים ויומן שריון פתוח</div>
            </div>
          </div>

          <form onSubmit={submit} className="glass-card rounded-3xl p-8 md:p-10 space-y-5">
            <h2 className="font-display text-2xl text-primary">פרטים ראשוניים</h2>
            <div>
              <Label>שם מלא <span className="text-blush-deep">*</span></Label>
              <Input required autoFocus value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="mt-1 h-11" />
            </div>
            <div>
              <Label>אימייל <span className="text-blush-deep">*</span></Label>
              <Input required type="email" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 h-11" />
            </div>
            <div>
              <Label>מספר טלפון <span className="text-blush-deep">*</span></Label>
              <Input required type="tel" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1 h-11" />
            </div>
            <div>
              <Label>איך הגעתם אלינו? <span className="text-blush-deep">*</span></Label>
              <Input required placeholder="חברה, אינסטגרם, גוגל, המלצה..." value={form.referral_source} onChange={(e) => setForm({ ...form, referral_source: e.target.value })} className="mt-1 h-11" />
            </div>
            <Button type="submit" disabled={busy} className="w-full h-12 rounded-full text-base">
              {busy ? "רגע…" : "המשך לבחירת מסלול"}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              בשליחה את מאשרת קבלת עדכונים בנוגע להזמנה. יש לך חשבון?{" "}
              <Link to="/auth" className="underline">להתחברות</Link>
            </p>
          </form>
        </div>
      </section>
      <Footer />
    </div>
  );
}

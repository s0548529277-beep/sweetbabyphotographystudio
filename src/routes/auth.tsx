import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  component: AuthPage,
  head: () => ({ meta: [
    { title: "התחברות | Sweetbaby" },
    { name: "description", content: "התחברו או צרו חשבון ב-Sweetbaby — כניסה מאובטחת לכרטיסיית לקוח, הזמנות ושריון סטודיו בבית שמש." },
    { property: "og:title", content: "התחברות | Sweetbaby" },
    { property: "og:description", content: "התחברו או צרו חשבון ב-Sweetbaby — כניסה מאובטחת לכרטיסיית לקוח, הזמנות ושריון סטודיו בבית שמש." },
    { property: "og:url", content: "https://sweetbabyphoto.shop/auth" },
    { name: "robots", content: "noindex, follow" },
  ], links: [{ rel: "canonical", href: "https://sweetbabyphoto.shop/auth" }] }),
});

function AuthPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { redirect } = useSearch({ from: "/auth" });
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  useEffect(() => {
    if (user) nav({ to: (redirect as any) || "/account" });
  }, [user, nav, redirect]);

  const signIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
    });
    setBusy(false);
    if (error) toast.error(error.message);
  };

  const sendReset = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = forgotEmail.trim();
    if (!email) return;
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("שלחנו קישור לאיפוס סיסמה למייל שלך");
      setForgotOpen(false);
    }
  };


  const signUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.auth.signUp({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: String(fd.get("full_name")),
          phone: String(fd.get("phone")),
        },
      },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("החשבון נוצר! ניתן להתחבר.");
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) toast.error("שגיאה בהתחברות עם Google");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <section className="container-page py-14 flex-1 flex items-center justify-center">
        <div className="w-full max-w-md bg-card rounded-3xl p-8 md:p-10 border border-primary/10 shadow-[var(--shadow-soft)]">
          <div className="text-center mb-8">
            <div className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-2">Sweetbaby</div>
            <h1 className="font-display text-4xl text-primary">ברוכים הבאים</h1>
            <p className="text-muted-foreground text-sm mt-2">כרטיסיית לקוח מסודרת, היסטוריית הזמנות ואיסוף מהיר.</p>
          </div>

          <Button type="button" onClick={google} variant="outline" className="w-full h-11 rounded-full border-primary/20 gap-2">
            <GoogleIcon /> התחברות עם Google
          </Button>
          <div className="flex items-center gap-3 my-6 text-xs text-muted-foreground">
            <span className="flex-1 h-px bg-border" /> או <span className="flex-1 h-px bg-border" />
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="w-full grid grid-cols-2 bg-cream">
              <TabsTrigger value="signin">כניסה</TabsTrigger>
              <TabsTrigger value="signup">חשבון חדש</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={signIn} className="space-y-4 mt-6">
                <Field label="אימייל" name="email" type="email" required />
                <Field label="סיסמה" name="password" type="password" required />
                <Button type="submit" disabled={busy} className="w-full rounded-full h-11">
                  {busy ? "…" : "כניסה"}
                </Button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setForgotOpen((v) => !v)}
                    className="text-xs text-forest/80 hover:text-primary underline underline-offset-4"
                  >
                    שכחתי סיסמה
                  </button>
                </div>
              </form>
              {forgotOpen && (
                <form onSubmit={sendReset} className="space-y-3 mt-4 p-4 rounded-2xl bg-cream border border-primary/10">
                  <p className="text-xs text-muted-foreground">
                    הזינו את כתובת המייל ונשלח קישור לאיפוס סיסמה.
                  </p>
                  <Input
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                  />
                  <Button type="submit" disabled={busy} className="w-full rounded-full h-10">
                    {busy ? "שולח…" : "שליחת קישור איפוס"}
                  </Button>
                </form>
              )}
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={signUp} className="space-y-4 mt-6">
                <Field label="שם מלא" name="full_name" required />
                <Field label="טלפון" name="phone" type="tel" required dir="ltr" />
                <Field label="אימייל" name="email" type="email" required />
                <Field label="סיסמה" name="password" type="password" required minLength={6} />
                <Button type="submit" disabled={busy} className="w-full rounded-full h-11">
                  {busy ? "…" : "צור חשבון"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <p className="text-[11px] text-center text-muted-foreground mt-6">
            הרשמה מהווה הסכמה ל<Link to="/" className="underline">תנאי השימוש</Link>.
          </p>
        </div>
      </section>
      <Footer />
    </div>
  );
}

function Field({ label, name, ...rest }: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} className="mt-1" {...rest} />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

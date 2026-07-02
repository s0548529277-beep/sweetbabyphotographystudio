import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "איפוס סיסמה | Sweetbaby" },
      { name: "description", content: "בחרו סיסמה חדשה לחשבון שלכם ב-Sweetbaby." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function ResetPasswordPage() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    // Supabase places the recovery session in the URL hash; the client
    // parses it automatically on load. Wait until a session exists.
    let cancelled = false;

    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) setReady(true);
    };

    check();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("הסיסמה חייבת להכיל לפחות 6 תווים");
      return;
    }
    if (password !== confirm) {
      toast.error("הסיסמאות אינן תואמות");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("הסיסמה עודכנה");
    nav({ to: "/account" });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <section className="container-page py-14 flex-1 flex items-center justify-center">
        <div className="w-full max-w-md bg-card rounded-3xl p-8 md:p-10 border border-primary/10 shadow-[var(--shadow-soft)]">
          <div className="text-center mb-8">
            <div className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-2">Sweetbaby</div>
            <h1 className="font-display text-4xl text-primary">איפוס סיסמה</h1>
            <p className="text-muted-foreground text-sm mt-2">
              בחרו סיסמה חדשה. הקישור בתוקף לזמן מוגבל.
            </p>
          </div>

          {!ready ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              <p>הקישור אינו תקף או שפג תוקפו.</p>
              <p className="mt-2">
                <Link to="/auth" className="underline text-primary">
                  חזרה למסך ההתחברות
                </Link>
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="password">סיסמה חדשה</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="confirm">אימות סיסמה</Label>
                <Input
                  id="confirm"
                  type="password"
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="mt-1"
                />
              </div>
              <Button type="submit" disabled={busy} className="w-full rounded-full h-11">
                {busy ? "מעדכן…" : "עדכון סיסמה"}
              </Button>
            </form>
          )}
        </div>
      </section>
      <Footer />
    </div>
  );
}

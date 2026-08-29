import { heError } from "@/lib/he-errors";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { isPlaceholderEmail } from "@/lib/auth.functions";
import { ShieldCheck, X } from "lucide-react";

/**
 * Customers who signed up by phone only (see auth.functions.ts's
 * signUpWithPhoneOrEmail) get an internal placeholder email, never a real
 * one — they can never receive a "forgot password" reset link, and nothing
 * ever gets sent to their address. This recommends (never requires) adding
 * a real one. supabase.auth.updateUser({ email }) is standard Supabase
 * self-service email change — it sends a confirmation link to the NEW
 * address, and the account keeps its current identity until that's
 * clicked, so this never silently swaps anything.
 */
export function AddEmailCard() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user || !isPlaceholderEmail(user.email) || dismissed) return null;

  const save = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: trimmed });
      if (error) throw error;
      toast.success("שלחנו קישור אישור לכתובת החדשה — אחרי הלחיצה עליו האימייל יתעדכן.");
      setDismissed(true);
    } catch (e) {
      toast.error(heError(e, "השמירה נכשלה"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative bg-blush/40 rounded-3xl p-6 border border-primary/10">
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="absolute left-4 top-4 text-muted-foreground hover:text-primary"
        aria-label="סגירה"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="h-5 w-5 text-peach-deep" />
        <h3 className="font-display text-2xl text-primary">מומלץ: הוספת אימייל</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        נרשמת עם טלפון בלבד. הוספת אימייל תאפשר לך לקבל עדכונים ואישורי הזמנה, ולשחזר סיסמה אם תשכחי אותה — לא חובה, אבל ממש מומלץ.
      </p>
      <div>
        <Label>אימייל</Label>
        <Input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" placeholder="you@example.com" />
      </div>
      <div className="flex gap-2 mt-4">
        <Button onClick={save} disabled={busy || !email.trim()} className="rounded-full">
          {busy ? "שומר…" : "שמירה"}
        </Button>
        <Button variant="ghost" className="rounded-full" onClick={() => setDismissed(true)}>
          לא עכשיו
        </Button>
      </div>
    </div>
  );
}

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toAuthPassword, MIN_PIN } from "@/lib/password";
import { ShieldCheck, X } from "lucide-react";

/**
 * Customers who signed in with Google have no phone and no password.
 * We recommend (but never require) adding both so they can also sign in
 * with email + code if Google is unavailable.
 */
export function GoogleCompleteCard({
  phone,
  onPhoneSaved,
}: {
  phone: string;
  onPhoneSaved: (phone: string) => void;
}) {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [p, setP] = useState(phone);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const isGoogle =
    !!user &&
    ((user.app_metadata as any)?.provider === "google" ||
      (user.identities ?? []).some((i: any) => i.provider === "google"));
  if (!user || !isGoogle || dismissed) return null;

  const save = async () => {
    setBusy(true);
    try {
      if (p.trim()) {
        const { error } = await supabase.from("profiles").upsert({ id: user.id, phone: p.trim() });
        if (error) throw error;
        onPhoneSaved(p.trim());
      }
      if (pin.trim()) {
        const { error } = await supabase.auth.updateUser({ password: toAuthPassword(pin) });
        if (error) throw error;
      }
      toast.success("הפרטים נשמרו — אפשר להתחבר גם בלי Google");
      setDismissed(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "השמירה נכשלה");
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
        <h3 className="font-display text-2xl text-primary">מומלץ: השלמת טלפון וקוד סודי</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        התחברת עם Google. הוספת טלפון וקוד סודי תאפשר לך להתחבר גם בלי Google — לא חובה, אבל ממש מומלץ.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label>טלפון</Label>
          <Input dir="ltr" type="tel" value={p} onChange={(e) => setP(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label>קוד סודי ({MIN_PIN} ספרות ומעלה)</Label>
          <Input
            dir="ltr"
            type="password"
            inputMode="numeric"
            minLength={MIN_PIN}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="mt-1"
            placeholder="למשל 1234"
          />
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <Button onClick={save} disabled={busy || (!p.trim() && !pin.trim())} className="rounded-full">
          {busy ? "שומר…" : "שמירה"}
        </Button>
        <Button variant="ghost" className="rounded-full" onClick={() => setDismissed(true)}>
          לא עכשיו
        </Button>
      </div>
    </div>
  );
}

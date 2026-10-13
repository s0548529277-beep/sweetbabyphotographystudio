import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mail } from "lucide-react";
import { spinNewsletterWheel } from "@/lib/newsletter-wheel.functions";
import { NewsletterWheel } from "@/components/NewsletterWheel";
import { useAuth } from "@/lib/auth";
import { EmailDatalist } from "@/components/EmailDatalist";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Footer newsletter signup — per explicit request, now routes through the
 * SAME one-time wheel spin as the popup (spinNewsletterWheel +
 * NewsletterWheel, see NewsletterPopup.tsx) instead of a separate flat
 * "X% off" coupon. Already single-use by construction: spinNewsletterWheel
 * keys on `newsletter_signups.wheel_spun_at` per email — a second spin
 * attempt for the same email (reopening this form, or the popup, on any
 * device) just replays the SAME saved result, never grants a new prize.
 */
export function NewsletterSignup({ className = "" }: { className?: string }) {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const runSpin = useServerFn(spinNewsletterWheel);

  // A logged-in customer — no need to make her retype her own email.
  useEffect(() => {
    if (user && !user.is_anonymous && user.email) setEmail((v) => v || user.email!);
  }, [user]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    try {
      setStarted(true);
    } finally {
      setLoading(false);
    }
  };

  const spin = async () => {
    const trimmed = email.trim();
    try {
      return await runSpin({ data: { email: trimmed } });
    } catch (e) {
      toast.error("לא הצלחנו לרשום אותך, נסי שוב בעוד רגע");
      throw e;
    }
  };

  if (started) {
    return (
      <div className={className}>
        <h4 className="text-[10px] tracking-[0.35em] uppercase text-sand mb-4">🎡 קבלי הטבה בגלגל המתנות</h4>
        <NewsletterWheel onSpin={spin} />
      </div>
    );
  }

  return (
    <div className={className}>
      <h4 className="text-[10px] tracking-[0.35em] uppercase text-sand mb-4">קבלי הטבה בגלגל המתנות 🎡</h4>
      <p className="text-background/70 text-sm mb-3 max-w-xs leading-relaxed">
        הצטרפי לרשימת התפוצה וסובבי את הגלגל — הנחה או קרדיט מתנה, חד פעמי לכל כתובת מייל.
      </p>
      <form onSubmit={submit} className="flex gap-2 max-w-xs">
        <Input
          type="email"
          required
          list="email-suggest-newsletter-footer"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="האימייל שלך"
          dir="ltr"
          aria-label="אימייל להרשמה לרשימת התפוצה"
          className="bg-background/10 border-background/25 text-background placeholder:text-background/50"
        />
        <EmailDatalist id="email-suggest-newsletter-footer" value={email} />
        <Button
          type="submit"
          disabled={loading}
          size="icon"
          aria-label="הרשמה"
          className="shrink-0 rounded-full bg-peach-deep text-primary hover:bg-peach-deep/90"
        >
          <Mail className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

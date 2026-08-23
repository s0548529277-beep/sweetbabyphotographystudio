import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mail, Check, Copy } from "lucide-react";
import { subscribeNewsletter } from "@/lib/newsletter.functions";
import { useFeaturedCoupon, discountLabel } from "@/hooks/use-featured-coupon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function NewsletterSignup({ className = "" }: { className?: string }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  // Which coupon (if any) to advertise/reveal is picked by an admin from
  // /admin/coupons ("newsletter_default"), not hardcoded here.
  const coupon = useFeaturedCoupon();
  const subscribe = useServerFn(subscribeNewsletter);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    try {
      await subscribe({ data: { email: trimmed, source: "footer" } });
      setDone(true);
    } catch {
      toast.error("לא הצלחנו לרשום אותך, נסי שוב בעוד רגע");
    } finally {
      setLoading(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("הקוד הועתק");
    } catch {
      // clipboard API unavailable — the code is already visible on screen
    }
  };

  if (done) {
    return (
      <div className={className}>
        <h4 className="text-[10px] tracking-[0.35em] uppercase text-sand mb-4">תודה שנרשמת!</h4>
        {coupon ? (
          <>
            <p className="text-background/85 text-sm mb-3">קוד ההנחה שלך ({discountLabel(coupon)}):</p>
            <button
              type="button"
              onClick={() => copyCode(coupon.code)}
              className="inline-flex items-center gap-2 rounded-full border border-background/30 px-4 py-2 text-sm font-medium hover:bg-background/10 transition-colors"
              dir="ltr"
            >
              <Check className="h-3.5 w-3.5" /> {coupon.code} <Copy className="h-3.5 w-3.5 opacity-60" />
            </button>
          </>
        ) : (
          <p className="text-background/85 text-sm">נעדכן אותך במבצעים ובהטבות חדשות.</p>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <h4 className="text-[10px] tracking-[0.35em] uppercase text-sand mb-4">
        {coupon ? `קבלי ${discountLabel(coupon)} הנחה` : "הצטרפי לרשימת התפוצה"}
      </h4>
      <p className="text-background/70 text-sm mb-3 max-w-xs leading-relaxed">
        {coupon
          ? "הצטרפי לרשימת התפוצה ותקבלי מיד קוד הנחה להשכרת אביזרים."
          : "עדכונים על מבצעים, אביזרים חדשים והטבות — ישירות למייל."}
      </p>
      <form onSubmit={submit} className="flex gap-2 max-w-xs">
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="האימייל שלך"
          dir="ltr"
          aria-label="אימייל להרשמה לרשימת התפוצה"
          className="bg-background/10 border-background/25 text-background placeholder:text-background/50"
        />
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

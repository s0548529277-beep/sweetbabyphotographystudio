import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import { Mail, Check, Copy, Sparkles } from "lucide-react";
import { subscribeNewsletter } from "@/lib/newsletter.functions";
import { useFeaturedCoupon, discountLabel } from "@/hooks/use-featured-coupon";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const POPUP_KEY = "sweetbaby-newsletter-popup-shown";
const DELAY_MS = 4000;
// Skip on transactional/private flows — a marketing popup there is just
// noise (or actively unwanted, e.g. mid-checkout).
const SKIP_PREFIXES = ["/admin", "/auth", "/checkout", "/cart", "/account", "/reset-password"];

export function NewsletterPopup() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const coupon = useFeaturedCoupon();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const subscribe = useServerFn(subscribeNewsletter);

  useEffect(() => {
    if (SKIP_PREFIXES.some((p) => pathname.startsWith(p))) return;
    if (!coupon) return; // nothing to offer -> don't interrupt visitors
    try {
      if (localStorage.getItem(POPUP_KEY)) return;
    } catch {
      return;
    }
    const t = setTimeout(() => setOpen(true), DELAY_MS);
    return () => clearTimeout(t);
    // Only re-evaluate when the coupon first loads or the route changes —
    // not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coupon, pathname]);

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(POPUP_KEY, "1");
    } catch {
      // private browsing etc. — worst case it can show again next visit
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    try {
      await subscribe({ data: { email: trimmed, source: "popup" } });
      setDone(true);
      try {
        localStorage.setItem(POPUP_KEY, "1");
      } catch {
        // ignore
      }
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

  if (!coupon) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && dismiss()}>
      <DialogContent className="max-w-sm p-0 overflow-hidden text-center" dir="rtl">
        <div className="bg-[#2d3d2b] text-[#f8ede4] px-6 py-8">
          <Sparkles className="h-6 w-6 mx-auto mb-3 text-[#f5d5cf]" />
          <h3 className="font-display text-2xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
            {done ? "תודה שנרשמת!" : `קבלי ${discountLabel(coupon)} הנחה`}
          </h3>
        </div>
        <div className="px-6 py-6">
          {done ? (
            <>
              <p className="text-sm text-muted-foreground mb-3">קוד ההנחה שלך:</p>
              <button
                type="button"
                onClick={() => copyCode(coupon.code)}
                className="inline-flex items-center gap-2 rounded-full border border-input px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
                dir="ltr"
              >
                <Check className="h-3.5 w-3.5" /> {coupon.code} <Copy className="h-3.5 w-3.5 opacity-60" />
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                הצטרפי לרשימת התפוצה ותקבלי מיד קוד הנחה להשכרת אביזרים.
              </p>
              <form onSubmit={submit} className="flex gap-2">
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="האימייל שלך"
                  dir="ltr"
                  aria-label="אימייל להרשמה לרשימת התפוצה"
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
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

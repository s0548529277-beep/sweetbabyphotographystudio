import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import { Mail, Check, Copy, Sparkles } from "lucide-react";
import { subscribeNewsletter, isNewsletterSubscribed } from "@/lib/newsletter.functions";
import { useFeaturedCoupon, discountLabel, type FeaturedCoupon } from "@/hooks/use-featured-coupon";
import { useAuth } from "@/lib/auth";
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
  const featured = useFeaturedCoupon();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [issued, setIssued] = useState<FeaturedCoupon | null>(null);
  const coupon = done ? (issued ?? featured) : featured;
  const subscribe = useServerFn(subscribeNewsletter);
  const checkSubscribed = useServerFn(isNewsletterSubscribed);

  useEffect(() => {
    if (SKIP_PREFIXES.some((p) => pathname.startsWith(p))) return;
    if (!featured) return; // nothing to offer -> don't interrupt visitors
    try {
      if (localStorage.getItem(POPUP_KEY)) return;
    } catch {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      timer = setTimeout(() => {
        if (!cancelled) setOpen(true);
      }, DELAY_MS);
    };

    // A real (non-guest) account with an email — sync with the server
    // instead of only trusting this browser's flag, so a customer who
    // already joined (on another device/browser, or via the footer form)
    // doesn't get pitched again.
    if (user && !user.is_anonymous && user.email) {
      checkSubscribed({ data: { email: user.email } })
        .then((res) => {
          if (cancelled) return;
          if (res.subscribed) {
            try {
              localStorage.setItem(POPUP_KEY, "1");
            } catch {
              // ignore
            }
            return;
          }
          schedule();
        })
        .catch(() => {
          // best-effort sync only — fall back to showing the popup
          if (!cancelled) schedule();
        });
    } else {
      schedule();
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Only re-evaluate when the coupon first loads, the route changes, or
    // the login state settles — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featured, pathname, user]);

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
      const res = await subscribe({ data: { email: trimmed, source: "popup" } });
      setIssued(res.coupon ?? null);
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
      <DialogContent
        className="max-w-sm p-0 overflow-hidden text-center border-2 border-[#f5d5cf] shadow-[0_0_0_6px_rgba(245,213,207,0.35)]"
        closeClassName="text-[#f8ede4] opacity-90 hover:opacity-100 hover:bg-white/15 rounded-full"
        dir="rtl"
      >
        <div className="bg-[#2d3d2b] text-[#f8ede4] px-6 py-8">
          <Sparkles className="h-6 w-6 mx-auto mb-3 text-[#f5d5cf]" />
          <h3 className="font-display text-2xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
            {done ? "תודה שהצטרפת! 💗" : `קבלי ${discountLabel(coupon)} הנחה`}
          </h3>
        </div>
        <div className="px-6 py-6 bg-[#fdf1ee]">
          {done ? (
            <>
              <p className="text-sm text-[#6b5b53] mb-3">מתרגשות שהצטרפת אלינו! הנה קוד ההנחה שלך:</p>
              <button
                type="button"
                onClick={() => copyCode(coupon.code)}
                className="inline-flex items-center gap-2 rounded-full border-2 border-[#f5d5cf] bg-white px-4 py-2 text-sm font-medium hover:bg-[#f5d5cf]/30 transition-colors"
                dir="ltr"
              >
                <Check className="h-3.5 w-3.5" /> {coupon.code} <Copy className="h-3.5 w-3.5 opacity-60" />
              </button>
              <p className="text-xs text-[#6b5b53] mt-3">שווה לשמור אותו — הוא מחכה להזמנה הראשונה שלך 🎁</p>
            </>
          ) : (
            <>
              <p className="text-sm text-[#6b5b53] mb-4 leading-relaxed">
                אוהבות שאת כאן! הצטרפי למשפחת Sweetbaby ותקבלי מיד קוד הנחה אישי לצילומים ולהשכרת אביזרים — בלי
                התחייבות, רק עדכונים והשראה שכיף לקבל 💕
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
                  className="bg-white border-[#f5d5cf] focus-visible:ring-[#f5d5cf]"
                />
                <Button
                  type="submit"
                  disabled={loading}
                  size="icon"
                  aria-label="הרשמה"
                  className="shrink-0 rounded-full bg-[#e8a99c] text-[#2d3d2b] hover:bg-[#e8a99c]/90"
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

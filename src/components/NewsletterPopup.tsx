// Newsletter signup popup — for a visitor who isn't registered yet, this
// doubles as a real account-registration form (name/phone/email/password),
// per explicit request. Checking the newsletter opt-in checkbox is what
// triggers the "spin the wheel" discount (see NewsletterWheel.tsx +
// spinNewsletterWheel) — leaving it unchecked just creates the account,
// no wheel, no discount. An already-logged-in visitor who hasn't
// subscribed yet skips straight to the checkbox+wheel (no need to
// re-collect her name/phone/password).
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import { Check, Mail, Sparkles } from "lucide-react";
import { isNewsletterSubscribed } from "@/lib/newsletter.functions";
import { spinNewsletterWheel } from "@/lib/newsletter-wheel.functions";
import { signUpWithPhoneOrEmail } from "@/lib/auth.functions";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { EmailDatalist } from "@/components/EmailDatalist";
import { NewsletterWheel } from "@/components/NewsletterWheel";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { heError } from "@/lib/he-errors";
import { toast } from "sonner";

const POPUP_KEY = "sweetbaby-newsletter-popup-shown";
const DELAY_MS = 4000;
// Skip on transactional/private flows — a marketing popup there is just
// noise (or actively unwanted, e.g. mid-checkout).
const SKIP_PREFIXES = ["/admin", "/auth", "/checkout", "/cart", "/account", "/reset-password"];

// Explicit phase, not a value derived from other state (e.g. "registered &&
// optIn") — a derived flag meant an unrelated re-render (checking the
// checkbox) could silently swap the whole view out from under an unrelated
// button before it was ever clicked. Every transition below happens from
// one, and only one, explicit place: a real submit/click handler.
type Phase = "form" | "wheel" | "done";

export function NewsletterPopup() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const checkSubscribed = useServerFn(isNewsletterSubscribed);
  const doSignUp = useServerFn(signUpWithPhoneOrEmail);
  const runSpin = useServerFn(spinNewsletterWheel);

  const isRegistered = !!user && !user.is_anonymous;
  // A logged-in customer who hasn't subscribed yet — no need to make her
  // retype her own email address.
  useEffect(() => {
    if (isRegistered && user!.email) setEmail((v) => v || user!.email!);
  }, [isRegistered, user]);

  useEffect(() => {
    if (SKIP_PREFIXES.some((p) => pathname.startsWith(p))) return;
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
    if (isRegistered && user!.email) {
      checkSubscribed({ data: { email: user!.email } })
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
          if (!cancelled) schedule();
        });
    } else {
      schedule();
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, isRegistered]);

  const markSeen = () => {
    try {
      localStorage.setItem(POPUP_KEY, "1");
    } catch {
      // private browsing etc. — worst case it can show again next visit
    }
  };

  const dismiss = () => {
    setOpen(false);
    markSeen();
  };

  const submitRegistration = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName || !trimmedPhone || !trimmedEmail || !password) {
      toast.error("שם, טלפון, אימייל וסיסמה הם שדות חובה");
      return;
    }
    setLoading(true);
    try {
      const res = await doSignUp({ data: { fullName: trimmedName, phone: trimmedPhone, email: trimmedEmail, password } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { error } = await supabase.auth.setSession(res.session);
      if (error) {
        toast.error(heError(error));
        return;
      }
      if (optIn) {
        setPhase("wheel");
      } else {
        toast.success("החשבון נוצר בהצלחה! 💗");
        setPhase("done");
        markSeen();
      }
    } catch (e2) {
      toast.error(heError(e2, "יצירת החשבון נכשלה"));
    } finally {
      setLoading(false);
    }
  };

  // Already-registered visitor — no account to create, just confirm the opt-in.
  const confirmOptIn = () => {
    if (!optIn) return;
    setPhase("wheel");
  };

  const spin = async () => {
    const res = await runSpin({ data: { email: email.trim() } });
    markSeen();
    return res;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && dismiss()}>
      <DialogContent
        className="max-w-sm p-0 overflow-hidden text-center border-2 border-[#f5d5cf] shadow-[0_0_0_6px_rgba(245,213,207,0.35)]"
        closeClassName="text-[#f8ede4] opacity-90 hover:opacity-100 hover:bg-white/15 rounded-full"
        dir="rtl"
      >
        <div className="bg-[#2d3d2b] text-[#f8ede4] px-6 py-6">
          <Sparkles className="h-6 w-6 mx-auto mb-2 text-[#f5d5cf]" />
          <h3 className="font-display text-xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
            {phase === "wheel"
              ? "כיף שהצטרפת! סובבו לפרס 🎁"
              : phase === "done"
                ? "תודה שהצטרפת! 💗"
                : isRegistered
                  ? "הצטרפי לניוזלטר וקבלי הנחה"
                  : "ברוכה הבאה למשפחת Sweetbaby"}
          </h3>
        </div>
        <div className="px-6 py-6 bg-[#fdf1ee]">
          {phase === "wheel" ? (
            <NewsletterWheel onSpin={spin} />
          ) : phase === "done" ? (
            <div className="flex flex-col items-center gap-2">
              <div className="h-10 w-10 rounded-full bg-forest/10 flex items-center justify-center">
                <Check className="h-5 w-5 text-forest" />
              </div>
              <p className="text-sm text-[#6b5b53]">אפשר להתחבר עם הפרטים שנרשמו בכל עת מהאזור האישי.</p>
            </div>
          ) : isRegistered ? (
            <>
              <p className="text-sm text-[#6b5b53] mb-4 leading-relaxed">
                מוזמנת להצטרף לניוזלטר שלנו — עדכונים, מבצעים והשראה. סימון ה-וי למטה פותח לך סיבוב בגלגל המתנות 🎡
              </p>
              <label className="flex items-center gap-2 justify-center mb-4 text-sm text-[#2d3d2b] cursor-pointer">
                <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="h-4 w-4 accent-[#e8a99c]" />
                מצטרפת לניוזלטר ורוצה לסובב את הגלגל
              </label>
              <Button
                type="button"
                onClick={confirmOptIn}
                disabled={!optIn}
                className="w-full h-11 rounded-full bg-[#e8a99c] text-[#2d3d2b] hover:bg-[#e8a99c]/90"
              >
                <Mail className="h-4 w-4 ml-2" /> הצטרפות
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-[#6b5b53] mb-4 leading-relaxed">
                עדיין אין לך חשבון אצלנו — פותחים אחד בשנייה, ומצטרפות גם לניוזלטר (עדכונים, מבצעים והשראה) מקבלות סיבוב בגלגל המתנות 🎡, עם
                הנחות ואפילו קרדיט מתנה.
              </p>
              <form onSubmit={submitRegistration} className="space-y-2.5 text-right">
                <Input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="שם מלא"
                  aria-label="שם מלא"
                  className="bg-white border-[#f5d5cf] focus-visible:ring-[#f5d5cf]"
                />
                <Input
                  required
                  dir="ltr"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="טלפון"
                  aria-label="טלפון"
                  className="bg-white border-[#f5d5cf] focus-visible:ring-[#f5d5cf]"
                />
                <div className="relative">
                  <Input
                    required
                    type="email"
                    list="email-suggest-newsletter-popup"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="אימייל"
                    dir="ltr"
                    aria-label="אימייל"
                    className="bg-white border-[#f5d5cf] focus-visible:ring-[#f5d5cf]"
                  />
                  <EmailDatalist id="email-suggest-newsletter-popup" value={email} />
                </div>
                <Input
                  required
                  dir="ltr"
                  type="password"
                  minLength={4}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="סיסמה"
                  aria-label="סיסמה"
                  className="bg-white border-[#f5d5cf] focus-visible:ring-[#f5d5cf]"
                />
                <label className="flex items-center gap-2 justify-center pt-1 text-sm text-[#2d3d2b] cursor-pointer">
                  <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="h-4 w-4 accent-[#e8a99c]" />
                  מצטרפת גם לניוזלטר — הנחה על ה-וי הקטן הזה 🎡
                </label>
                <Button type="submit" disabled={loading} className="w-full h-11 rounded-full bg-[#e8a99c] text-[#2d3d2b] hover:bg-[#e8a99c]/90 mt-1">
                  {loading ? "רק רגע…" : "יצירת חשבון"}
                </Button>
              </form>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

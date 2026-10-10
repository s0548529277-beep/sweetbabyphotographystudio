// Cookie / local-storage consent banner — required by Israel's Protection
// of Privacy Law Amendment 13 (בתוקף מ-14.8.2025) for any site that stores
// data in the visitor's browser for analytics/marketing. See
// cookie-consent.ts for the storage + pub/sub, and SiteTracking /
// Analytics for the two consumers gated on it.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Cookie } from "lucide-react";
import { getCookieConsent, setCookieConsent, type ConsentChoice } from "@/lib/cookie-consent";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getCookieConsent() === null) setVisible(true);
  }, []);

  const choose = (choice: ConsentChoice) => {
    setCookieConsent(choice);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      dir="rtl"
      role="region"
      aria-label="הסכמה לשימוש באחסון מקומי"
      className="fixed inset-x-0 bottom-0 z-[120] px-3 pb-3 sm:px-6 sm:pb-6 font-body animate-in slide-in-from-bottom-4 fade-in duration-300"
    >
      <div className="mx-auto max-w-2xl rounded-2xl border border-secondary bg-card/97 backdrop-blur-sm shadow-[0_20px_55px_-18px_color-mix(in_oklab,var(--color-primary)_38%,transparent)] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Cookie className="h-5 w-5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground leading-relaxed">
              האתר משתמש באחסון מקומי בדפדפן (בדומה לעוגיות) כדי להבין איך גולשים משתמשים באתר ולשפר את החוויה.
              אין שיתוף עם צדדים שלישיים ללא הסכמה. פרטים נוספים ב
              <Link to="/terms" className="underline underline-offset-4 text-primary hover:text-peach-deep">
                {" "}מדיניות הפרטיות
              </Link>
              .
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => choose("accepted")}
                className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                מאשר/ת
              </button>
              <button
                type="button"
                onClick={() => choose("rejected")}
                className="rounded-full border border-border px-5 py-2 text-sm text-foreground hover:bg-cream transition-colors"
              >
                רק הכרחי
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

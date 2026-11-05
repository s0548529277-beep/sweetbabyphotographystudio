import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
}

/**
 * "התקנת האפליקציה" — optional install of the site as an app on phone or
 * computer. Android / desktop Chrome & Edge: the browser's own install prompt.
 * iPhone / iPad (Safari has no prompt): a short how-to. Hidden when the site
 * already runs as an installed app.
 */
export function InstallAppButton({ className = "" }: { className?: string }) {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIos());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const onClick = async () => {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice.catch(() => undefined);
      setDeferred(null);
      return;
    }
    setHelp(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center justify-center gap-2 h-11 px-4 rounded-full border border-current/20 text-sm font-medium transition hover:opacity-80 ${className}`}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        התקנת האפליקציה
      </button>
      {help && (
        <div
          dir="rtl"
          role="dialog"
          aria-label="התקנת האפליקציה"
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setHelp(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl bg-background p-5 text-foreground shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setHelp(false)}
              aria-label="סגירה"
              className="absolute left-3 top-3 flex size-8 items-center justify-center rounded-full hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="mb-3 text-lg font-semibold">התקנת האפליקציה</h3>
            {ios ? (
              <ol className="list-decimal space-y-2 pr-5 text-sm leading-6">
                <li>
                  לחצי על כפתור השיתוף <Share className="inline h-4 w-4 align-text-bottom" /> בתחתית Safari.
                </li>
                <li>בחרי &quot;הוסף למסך הבית&quot;.</li>
                <li>לחצי &quot;הוסף&quot; — האייקון יופיע בין האפליקציות.</li>
              </ol>
            ) : (
              <ol className="list-decimal space-y-2 pr-5 text-sm leading-6">
                <li>בכרום / אדג׳ במחשב: לחצי על סמל ההתקנה בצד שורת הכתובת.</li>
                <li>בטלפון אנדרואיד: תפריט הדפדפן (⋮) ← &quot;התקנת אפליקציה&quot; או &quot;הוספה למסך הבית&quot;.</li>
                <li>אם אין אפשרות כזו, פתחי את האתר בכרום או בספארי ונסי שוב.</li>
              </ol>
            )}
          </div>
        </div>
      )}
    </>
  );
}

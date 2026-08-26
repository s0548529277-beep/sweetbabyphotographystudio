import { useState } from "react";
import { CreditCard, X, ExternalLink } from "lucide-react";
import { TAKBULL_PAY_URL as PAY_URL } from "@/lib/orderSummary";

type Props = {
  className?: string;
  label?: string;
  note?: string | null;
  /** Called once the payment window was opened (used to release the calendar hold flow). */
  onOpened?: () => void;
};

/** Secure payment link — opens inside the site in a modal window. */
export function PayOnlineButton({
  className = "",
  label = "מעבר לתשלום מקוון",
  note = "לתשלום מאובטח באשראי/ביט לחצו כאן",
  onOpened,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`flex flex-col items-start gap-2 ${className}`} dir="rtl">
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          onOpened?.();
        }}
        className="inline-flex items-center gap-2 rounded-full bg-[#2d3d2b] text-[#f8ede4] px-7 h-12 text-sm font-semibold hover:bg-[#3d5039] transition-colors"
      >
        <CreditCard className="h-4 w-4" />
        {label}
      </button>
      {note ? <span className="text-xs text-[#2d3d2b]/70">{note}</span> : null}

      {open && (
        <div
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-2xl h-[85vh] bg-background rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-5 h-14 border-b border-border bg-card">
              <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                <CreditCard className="h-4 w-4" /> תשלום מאובטח
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={PAY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" /> פתיחה בחלון חדש
                </a>
                <button
                  type="button"
                  aria-label="סגירה"
                  onClick={() => setOpen(false)}
                  className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <iframe
              src={PAY_URL}
              title="תשלום מאובטח"
              className="flex-1 w-full border-0 bg-white"
              allow="payment"
            />
          </div>
        </div>
      )}
    </div>
  );
}

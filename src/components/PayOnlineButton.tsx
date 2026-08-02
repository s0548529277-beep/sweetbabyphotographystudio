import { CreditCard } from "lucide-react";

export const PAY_URL = "https://paypage.takbull.co.il/40KSd";

type Props = {
  className?: string;
  label?: string;
  note?: string | null;
};

/** Secure external payment link (deposit / rental fee) — opens in a new tab. */
export function PayOnlineButton({ className = "", label = "מעבר לתשלום מקוון", note = "לתשלום מאובטח באשראי/ביט לחצו כאן" }: Props) {
  return (
    <div className={`flex flex-col items-start gap-2 ${className}`} dir="rtl">
      <a
        href={PAY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-full bg-[#2d3d2b] text-[#f8ede4] px-7 h-12 text-sm font-semibold hover:bg-[#3d5039] transition-colors"
      >
        <CreditCard className="h-4 w-4" />
        {label}
      </a>
      {note ? <span className="text-xs text-[#2d3d2b]/70">{note}</span> : null}
    </div>
  );
}

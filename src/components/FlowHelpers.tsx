import { Link, useRouter } from "@tanstack/react-router";
import { ArrowRight, Info } from "lucide-react";

/**
 * Small helpers for the booking / checkout flow pages (2026-11-03, owner request: a back button on the
 * existing studio-flow pages and an explanation of why the "continue" button is inactive).
 */

/** "חזרה" — goes one step back in the browser history, or to `fallback` when there is no history (opened from a link/email). */
export function BackButton({
  fallback,
  label = "חזרה",
  className = "",
}: {
  fallback: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <Link
      to={fallback as any}
      onClick={(e) => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          e.preventDefault();
          router.history.back();
        }
      }}
      className={`inline-flex items-center gap-1.5 rounded-full border border-current/25 px-4 py-1.5 text-sm font-medium opacity-80 hover:opacity-100 transition ${className}`}
    >
      <ArrowRight className="h-4 w-4" />
      {label}
    </Link>
  );
}

/** Shown above/below a disabled "continue" button: lists exactly what is still missing. Renders nothing when `items` is empty. */
export function MissingList({
  items,
  onDark = false,
  className = "",
}: {
  items: string[];
  onDark?: boolean;
  className?: string;
}) {
  if (!items.length) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-xl px-3 py-2.5 text-xs leading-relaxed ${
        onDark ? "bg-white/10 text-[#f8ede4] border border-[#f5d5cf]/40" : "bg-[#fff6e8] text-[#6b4f1d] border border-[#e8c98a]"
      } ${className}`}
    >
      <div className="flex items-center gap-1.5 font-semibold mb-1">
        <Info className="h-3.5 w-3.5 shrink-0" /> כדי להמשיך עוד חסר:
      </div>
      <ul className="list-disc pr-5 space-y-0.5">
        {items.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </div>
  );
}

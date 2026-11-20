import type { ReactNode } from "react";

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-3xl border border-newborn-rose/20 bg-white/90 shadow-[0_8px_30px_-18px_rgba(120,60,70,0.35)] ${className}`}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          {title ? <h3 className="font-display text-lg text-newborn-ink">{title}</h3> : <span />}
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

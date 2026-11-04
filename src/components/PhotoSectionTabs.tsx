import { Link, useRouterState } from "@tanstack/react-router";
import { Baby, Trees, GalleryVerticalEnd } from "lucide-react";

/**
 * One admin menu button ("חבילות צילום") covers three pages that used to be
 * separate buttons: newborn packages, outdoor packages and photo clients
 * (galleries). This tab bar switches between them at the top of each page.
 */
export const PHOTO_SECTION_PATHS = [
  "/admin/newborn-packages",
  "/admin/outdoor-packages",
  "/admin/photo-clients",
];

const TABS = [
  { to: "/admin/newborn-packages", label: "ניו-בורן", icon: Baby },
  { to: "/admin/outdoor-packages", label: "צילומי חוץ", icon: Trees },
  { to: "/admin/photo-clients", label: "לקוחות צילום וגלריות", icon: GalleryVerticalEnd },
] as const;

export function PhotoSectionTabs({ className = "" }: { className?: string }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className={`flex flex-wrap gap-2 ${className}`} aria-label="חבילות צילום">
      {TABS.map((t) => {
        const active = path === t.to || path.startsWith(`${t.to}/`);
        const Icon = t.icon;
        return (
          <Link
            key={t.to}
            to={t.to}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm transition-colors ${
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-primary border-primary/20 hover:bg-primary/5"
            }`}
          >
            <Icon className="h-4 w-4" /> {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

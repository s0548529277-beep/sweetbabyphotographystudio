import { Link, useRouterState } from "@tanstack/react-router";
import { Baby, Trees, GalleryVerticalEnd, ContactRound, Send } from "lucide-react";

/**
 * One admin menu button ("ניהול לקוחות") covers client management plus three pages that used to be
 * separate buttons: newborn packages, outdoor packages and photo clients
 * (galleries). This tab bar switches between them at the top of each page.
 */
export const PHOTO_SECTION_PATHS = [
  "/admin/client-management",
  "/admin/newborn-packages",
  "/admin/outdoor-packages",
  "/admin/photo-clients",
];

const TABS = [
  { to: "/admin/client-management", label: "ניהול לקוחות — מסך ראשי", icon: ContactRound },
  { to: "/admin/newborn-packages", label: "ניו-בורן", icon: Baby },
  { to: "/admin/outdoor-packages", label: "צילומי חוץ", icon: Trees },
  { to: "/admin/photo-clients", kind: "general", label: "לקוחות צילום כללי", icon: GalleryVerticalEnd },
  { to: "/admin/photo-clients", kind: "send", label: "שליחת תמונות בלבד", icon: Send },
] as const;

export function PhotoSectionTabs({ className = "" }: { className?: string }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search }) as { kind?: string };
  return (
    <nav className={`flex flex-wrap gap-2 ${className}`} aria-label="חבילות צילום">
      {TABS.map((t) => {
        const kind = "kind" in t ? t.kind : null;
        const onPath = path === t.to || path.startsWith(`${t.to}/`);
        const active = kind ? onPath && (search?.kind === "send" ? "send" : "general") === kind : onPath;
        const Icon = t.icon;
        return (
          <Link
            key={`${t.to}-${kind ?? ""}`}
            to={t.to}
            search={(kind ? { kind } : undefined) as any}
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

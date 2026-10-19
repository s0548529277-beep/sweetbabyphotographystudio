import { useState } from "react";
import { createFileRoute, Outlet, Link, redirect, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { countUnreadAdminNotifications } from "@/lib/admin-notifications.functions";
import { countPendingOrders } from "@/lib/admin-orders.functions";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import {
  Package,
  Users,
  CalendarDays,
  ShoppingBag,
  LayoutDashboard,
  Images,
  Camera,
  Wallet,
  Cloud,
  Ticket,
  Bot,
  MessageCircleQuestion,
  Mail,
  CreditCard,
  MessageCircle,
  Wand2,
  Sliders,
  GalleryVerticalEnd,
  Sparkles,
  Bell,
  Mic,
  ChevronDown,
  Gift,
  Inbox,
  BrainCircuit,
  Baby,
  Phone,
  BarChart3,
  Droplets,
  FileText,
  MessageSquare,
  Menu,
  X,
  BellRing,
  Disc3,
  Trees,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    if (!roles?.some((r) => r.role === "admin")) throw redirect({ to: "/account" });
  },
  component: AdminLayout,
});

type NavLink = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
type NavGroup = { key: string; label: string; icon: typeof LayoutDashboard; items: NavLink[] };
type NavEntry = NavLink | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

// Bot-related and photo/gallery-related admin pages are grouped under one
// collapsible button each instead of cluttering the sidebar with every page
// flat — click the group to expand/collapse its own pages.
const links: NavEntry[] = [
  { to: "/admin", label: "סקירה", icon: LayoutDashboard, exact: true },
  { to: "/admin/analytics", label: "אנליטיקס", icon: BarChart3 },
  { to: "/admin/items", label: "אביזרים", icon: Package },
  { to: "/admin/orders", label: "הזמנות", icon: ShoppingBag },
  { to: "/admin/calendar", label: "יומן", icon: CalendarDays },
  { to: "/admin/clients", label: "לקוחות", icon: Users },
  { to: "/admin/whatsapp", label: "וואטסאפ", icon: MessageSquare },
  { to: "/admin/newborn-packages", label: "חבילות ניו-בורן", icon: Baby },
  { to: "/admin/outdoor-packages", label: "חבילות צילומי חוץ", icon: Trees },
  { to: "/admin/newborn-contract-text", label: "מלל הכנה+חוזה ניו-בורן", icon: FileText },
  { to: "/admin/birth-basket-text", label: "מלל מימוש סל לידה", icon: Gift },
  { to: "/admin/finance", label: "הכנסות והוצאות", icon: Wallet },
  { to: "/admin/backup", label: "גיבוי נתונים", icon: Cloud },
  {
    key: "club",
    label: "מועדון",
    icon: Gift,
    items: [
      { to: "/admin/coupons", label: "קופונים", icon: Ticket },
      { to: "/admin/subscriptions", label: "מנויים (כרטיסיות)", icon: CreditCard },
      { to: "/admin/newsletter", label: "ניוזלטר", icon: Mail },
      { to: "/admin/waitlist", label: "רשימת המתנה", icon: BellRing },
      { to: "/admin/prize-wheel", label: "גלגל מתנות", icon: Disc3 },
    ],
  },
  {
    key: "bots",
    label: "בוטים",
    icon: Bot,
    items: [
      { to: "/admin/site-bot", label: "בוט עריכה", icon: Bot },
      { to: "/admin/site-bot-ask", label: "בוט מידע כללי", icon: MessageCircleQuestion },
      { to: "/admin/chat-logs", label: "שיחות בוט (צ'אט וטלפון)", icon: MessageCircle },
      { to: "/admin/voice-bot-text", label: "מלל בוט הטלפון", icon: Mic },
      { to: "/admin/voice-bot", label: "קול בוט הטלפון (Twilio)", icon: Phone },
      { to: "/admin/email-assistant", label: "בוט ניהול מייל", icon: Inbox },
      { to: "/admin/bot-knowledge", label: "מידע לבוט", icon: BrainCircuit },
    ],
  },
  {
    key: "photos",
    label: "עיבוד תמונות וגלריות",
    icon: Images,
    items: [
      { to: "/admin/gallery", label: "גלריות", icon: Images },
      { to: "/admin/inspiration", label: "השראה למק״ט", icon: Camera },
      { to: "/admin/photo-editor", label: "עריכת תמונות (AI)", icon: Wand2 },
      { to: "/admin/photo-batch", label: "כיוונון תמונות (כמות גדולה)", icon: Sliders },
      { to: "/admin/photo-resize", label: "הקטנת תמונות וסימן מים", icon: Droplets },
      { to: "/admin/photo-clients", label: "לקוחות צילום", icon: GalleryVerticalEnd },
      { to: "/admin/retouch-presets", label: "עיבוד AI ללקוחות (פריסטים)", icon: Sparkles },
    ],
  },
];

function isLinkActive(path: string, l: NavLink) {
  return l.exact ? path === l.to : path === l.to || path.startsWith(`${l.to}/`);
}

function NavLinkRow({
  l,
  active,
  indent,
  onNavigate,
}: {
  l: NavLink;
  active: boolean;
  indent?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={l.to}
      onClick={onNavigate}
      className={`flex items-center gap-3 h-11 rounded-xl text-sm transition-colors ${indent ? "px-4 mr-3" : "px-4"} ${
        active ? "bg-primary text-primary-foreground" : "hover:bg-cream text-foreground"
      }`}
    >
      <l.icon className="h-4 w-4" /> {l.label}
    </Link>
  );
}

/** The currently-active link's own label (incl. sub-items inside a group) — shown on the mobile menu toggle so it's clear which admin page is open. */
function currentPageLabel(path: string): string {
  for (const entry of links) {
    if (!isGroup(entry)) {
      if (isLinkActive(path, entry)) return entry.label;
      continue;
    }
    const match = entry.items.find((l) => isLinkActive(path, l));
    if (match) return match.label;
  }
  return "ניהול";
}

/**
 * Persistent bell button shown at the top of every admin page (not buried
 * in the nav list anymore, see the removed "הודעות מערכת" link above) —
 * per direct report that it was too easy to forget the notifications page
 * existed. Polls every 15s, same interval as the notifications page itself.
 */
function NotificationBell() {
  const fetchCount = useServerFn(countUnreadAdminNotifications);
  const q = useQuery({
    queryKey: ["admin-unread-notifications-count"],
    queryFn: () => fetchCount({}),
    refetchInterval: 15000,
  });
  const unread = q.data?.count ?? 0;
  return (
    <Link
      to="/admin/notifications"
      className="relative inline-flex items-center justify-center h-9 w-9 rounded-full bg-card border border-primary/10 text-primary hover:bg-cream transition-colors shrink-0"
      aria-label={unread > 0 ? `הודעות מערכת — ${unread} לא נקראו` : "הודעות מערכת"}
    >
      <Bell className="h-4 w-4" />
      {unread > 0 && (
        <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}

/**
 * Second bell next to NotificationBell, specifically for orders awaiting
 * confirmation — per explicit request, since the dashboard's old dedicated
 * "recent orders" section was replaced by the general notifications feed
 * (admin.index.tsx) and orders needed their own always-visible indicator
 * again, separate from the general notifications bell.
 */
function OrdersBell() {
  const fetchCount = useServerFn(countPendingOrders);
  const q = useQuery({
    queryKey: ["admin-pending-orders-count"],
    queryFn: () => fetchCount({}),
    refetchInterval: 15000,
  });
  const pending = q.data?.count ?? 0;
  return (
    <Link
      to="/admin/orders"
      className="relative inline-flex items-center justify-center h-9 w-9 rounded-full bg-card border border-primary/10 text-primary hover:bg-cream transition-colors shrink-0"
      aria-label={pending > 0 ? `הזמנות ממתינות — ${pending}` : "הזמנות"}
    >
      <ShoppingBag className="h-4 w-4" />
      {pending > 0 && (
        <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
          {pending > 99 ? "99+" : pending}
        </span>
      )}
    </Link>
  );
}

function AdminLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const entry of links) {
      if (isGroup(entry) && entry.items.some((l) => isLinkActive(path, l)))
        initial[entry.key] = true;
    }
    return initial;
  });
  // The sidebar lists 15+ links — on a phone that's taller than the
  // viewport, so it's collapsed behind this toggle by default there
  // (always expanded on lg: and up, see the aside's own classes below).
  // Per explicit report: without this, the nav list alone filled the whole
  // screen and a page like "לקוחות" never had room to actually show.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeMobileNav = () => setMobileNavOpen(false);

  return (
    <div className="min-h-screen flex flex-col bg-cream/40">
      <Header />
      <section className="container-page py-10 flex-1">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="text-xs tracking-[0.3em] uppercase text-forest/70">Admin</div>
          <div className="flex items-center gap-2">
            <OrdersBell />
            <NotificationBell />
          </div>
        </div>
        <h1 className="font-display text-4xl text-primary mb-8">ניהול סטודיו</h1>

        <div className="grid lg:grid-cols-[220px_1fr] gap-8">
          <div className="lg:hidden">
            <button
              type="button"
              onClick={() => setMobileNavOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-3 px-4 h-12 rounded-xl bg-card border border-primary/5 text-sm font-medium text-primary"
            >
              <span className="flex items-center gap-2">
                {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                תפריט ניהול
              </span>
              <span className="text-forest/60">{currentPageLabel(path)}</span>
            </button>
          </div>
          <aside
            className={`bg-card rounded-2xl p-3 border border-primary/5 h-fit lg:sticky lg:top-24 ${
              mobileNavOpen ? "block" : "hidden"
            } lg:block`}
          >
            <nav className="flex flex-col gap-1">
              {links.map((entry) => {
                if (!isGroup(entry)) {
                  return (
                    <NavLinkRow
                      key={entry.to}
                      l={entry}
                      active={isLinkActive(path, entry)}
                      onNavigate={closeMobileNav}
                    />
                  );
                }
                const isOpen = !!openGroups[entry.key];
                const hasActiveChild = entry.items.some((l) => isLinkActive(path, l));
                return (
                  <div key={entry.key}>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenGroups((prev) => ({ ...prev, [entry.key]: !prev[entry.key] }))
                      }
                      className={`w-full flex items-center gap-3 px-4 h-11 rounded-xl text-sm transition-colors ${
                        hasActiveChild && !isOpen
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-cream text-foreground"
                      }`}
                    >
                      <entry.icon className="h-4 w-4" />
                      <span className="flex-1 text-right">{entry.label}</span>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    {isOpen && (
                      <div className="flex flex-col gap-1 mt-1">
                        {entry.items.map((l) => (
                          <NavLinkRow
                            key={l.to}
                            l={l}
                            active={isLinkActive(path, l)}
                            indent
                            onNavigate={closeMobileNav}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </aside>
          <div className="min-w-0">
            <Outlet />
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}

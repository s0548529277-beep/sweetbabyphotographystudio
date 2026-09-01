import { useState } from "react";
import { createFileRoute, Outlet, Link, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
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
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
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
  { to: "/admin/items", label: "אביזרים", icon: Package },
  { to: "/admin/orders", label: "הזמנות", icon: ShoppingBag },
  { to: "/admin/calendar", label: "יומן", icon: CalendarDays },
  { to: "/admin/clients", label: "לקוחות", icon: Users },
  { to: "/admin/newborn-packages", label: "חבילות ניו-בורן", icon: Baby },
  { to: "/admin/finance", label: "הכנסות והוצאות", icon: Wallet },
  {
    key: "club",
    label: "מועדון",
    icon: Gift,
    items: [
      { to: "/admin/coupons", label: "קופונים", icon: Ticket },
      { to: "/admin/subscriptions", label: "כרטיסיות SWEET 10+1", icon: CreditCard },
      { to: "/admin/newsletter", label: "ניוזלטר", icon: Mail },
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
      { to: "/admin/notifications", label: "הודעות מערכת", icon: Bell },
      { to: "/admin/voice-bot-text", label: "מלל בוט הטלפון", icon: Mic },
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
      { to: "/admin/photo-clients", label: "לקוחות צילום", icon: GalleryVerticalEnd },
      { to: "/admin/retouch-presets", label: "עיבוד AI ללקוחות (פריסטים)", icon: Sparkles },
    ],
  },
];

function isLinkActive(path: string, l: NavLink) {
  return l.exact ? path === l.to : path === l.to || path.startsWith(`${l.to}/`);
}

function NavLinkRow({ l, active, indent }: { l: NavLink; active: boolean; indent?: boolean }) {
  return (
    <Link
      to={l.to}
      className={`flex items-center gap-3 h-11 rounded-xl text-sm transition-colors ${indent ? "px-4 mr-3" : "px-4"} ${
        active ? "bg-primary text-primary-foreground" : "hover:bg-cream text-foreground"
      }`}
    >
      <l.icon className="h-4 w-4" /> {l.label}
    </Link>
  );
}

function AdminLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const entry of links) {
      if (isGroup(entry) && entry.items.some((l) => isLinkActive(path, l))) initial[entry.key] = true;
    }
    return initial;
  });

  return (
    <div className="min-h-screen flex flex-col bg-cream/40">
      <Header />
      <section className="container-page py-10 flex-1">
        <div className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-3">Admin</div>
        <h1 className="font-display text-4xl text-primary mb-8">ניהול סטודיו</h1>

        <div className="grid lg:grid-cols-[220px_1fr] gap-8">
          <aside className="bg-card rounded-2xl p-3 border border-primary/5 h-fit sticky top-24">
            <nav className="flex flex-col gap-1">
              {links.map((entry) => {
                if (!isGroup(entry)) {
                  return <NavLinkRow key={entry.to} l={entry} active={isLinkActive(path, entry)} />;
                }
                const isOpen = !!openGroups[entry.key];
                const hasActiveChild = entry.items.some((l) => isLinkActive(path, l));
                return (
                  <div key={entry.key}>
                    <button
                      type="button"
                      onClick={() => setOpenGroups((prev) => ({ ...prev, [entry.key]: !prev[entry.key] }))}
                      className={`w-full flex items-center gap-3 px-4 h-11 rounded-xl text-sm transition-colors ${
                        hasActiveChild && !isOpen ? "bg-primary/10 text-primary" : "hover:bg-cream text-foreground"
                      }`}
                    >
                      <entry.icon className="h-4 w-4" />
                      <span className="flex-1 text-right">{entry.label}</span>
                      <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    {isOpen && (
                      <div className="flex flex-col gap-1 mt-1">
                        {entry.items.map((l) => (
                          <NavLinkRow key={l.to} l={l} active={isLinkActive(path, l)} indent />
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

import { createFileRoute, Outlet, Link, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Package, Users, CalendarDays, ShoppingBag, LayoutDashboard, Images, Camera, Wallet, Ticket, Bot, MessageCircleQuestion } from "lucide-react";

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

const links = [
  { to: "/admin", label: "סקירה", icon: LayoutDashboard, exact: true },
  { to: "/admin/items", label: "אביזרים", icon: Package },
  { to: "/admin/orders", label: "הזמנות", icon: ShoppingBag },
  { to: "/admin/calendar", label: "יומן", icon: CalendarDays },
  { to: "/admin/clients", label: "לקוחות", icon: Users },
  { to: "/admin/finance", label: "הכנסות והוצאות", icon: Wallet },
  { to: "/admin/coupons", label: "קופונים", icon: Ticket },
  { to: "/admin/site-bot", label: "בוט עריכה", icon: Bot },
  { to: "/admin/site-bot-ask", label: "בוט מידע כללי", icon: MessageCircleQuestion },
  { to: "/admin/gallery", label: "גלריות", icon: Images },
  { to: "/admin/inspiration", label: "השראה למק״ט", icon: Camera },
];

function AdminLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen flex flex-col bg-cream/40">
      <Header />
      <section className="container-page py-10 flex-1">
        <div className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-3">Admin</div>
        <h1 className="font-display text-4xl text-primary mb-8">ניהול סטודיו</h1>

        <div className="grid lg:grid-cols-[220px_1fr] gap-8">
          <aside className="bg-card rounded-2xl p-3 border border-primary/5 h-fit sticky top-24">
            <nav className="flex flex-col gap-1">
              {links.map((l) => {
                const isActive = l.exact ? path === l.to : path === l.to || path.startsWith(`${l.to}/`);
                return (
                  <Link
                    key={l.to}
                    to={l.to}
                    className={`flex items-center gap-3 px-4 h-11 rounded-xl text-sm transition-colors ${
                      isActive ? "bg-primary text-primary-foreground" : "hover:bg-cream text-foreground"
                    }`}
                  >
                    <l.icon className="h-4 w-4" /> {l.label}
                  </Link>
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

import { Link, useRouter } from "@tanstack/react-router";
import { ShoppingBag, User as UserIcon, LogOut, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo-green.png";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const nav = [
  { to: "/", label: "בית" },
  { to: "/studio-photography", label: "צילומים בסטודיו" },
  { to: "/studio-rental", label: "השכרת סטודיו" },
  { to: "/rental-catalog", label: "קטלוג אביזרים להשכרה" },
  { to: "/about", label: "אודות" },
  { to: "/contact", label: "יצירת קשר" },
];


export function Header() {
  const { count } = useCart();
  const { user, isAdmin, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    if (!user) { setDisplayName(""); return; }
    (async () => {
      const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      if (!mounted) return;
      const meta = (user.user_metadata as { full_name?: string; name?: string } | null) ?? null;
      setDisplayName(data?.full_name || meta?.full_name || meta?.name || user.email?.split("@")[0] || "");
    })();
    return () => { mounted = false; };
  }, [user]);

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/80 border-b border-border">
      <div className="container-page flex items-center justify-between h-28 gap-6">
        <Link to="/" className="flex items-center gap-3 shrink-0">
          <img src={logo} alt="Sweetbaby" className="h-16 md:h-20 w-auto" />
        </Link>

        <nav className="hidden md:flex items-center gap-10 text-[13px] tracking-[0.28em] uppercase">

          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="text-foreground/70 hover:text-foreground transition-colors relative py-1"
              activeProps={{ className: "text-foreground" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link to="/cart" className="relative" aria-label={`עגלת קניות${count > 0 ? ` (${count} פריטים)` : ""}`}>
            <Button variant="ghost" size="icon" className="rounded-full h-12 w-12" aria-label="עגלת קניות">
              <ShoppingBag className="!h-6 !w-6" />
              {count > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-peach-deep text-primary text-[11px] font-medium flex items-center justify-center">
                  {count}
                </span>
              )}
            </Button>
          </Link>


          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full h-12 w-12" aria-label="תפריט משתמש">
                  <UserIcon className="!h-6 !w-6" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => router.navigate({ to: "/account" })}>
                  הכרטיסייה שלי
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onClick={() => router.navigate({ to: "/admin" })}>
                    ניהול מערכת
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut className="h-4 w-4 ml-2" /> יציאה
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link to="/auth" className="hidden sm:block">
              <Button variant="default" className="rounded-full h-12 px-6 text-base">התחברות</Button>
            </Link>
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden rounded-full h-12 w-12" aria-label="פתיחת תפריט ניווט">
                <Menu className="!h-6 !w-6" />
              </Button>
            </SheetTrigger>

            <SheetContent side="right" className="w-72">
              <div className="flex flex-col gap-4 pt-8">
                {nav.map((n) => (
                  <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className="text-lg font-display">
                    {n.label}
                  </Link>
                ))}
                {!user && (
                  <Link to="/auth" onClick={() => setOpen(false)}>
                    <Button className="w-full mt-4 rounded-full">התחברות</Button>
                  </Link>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

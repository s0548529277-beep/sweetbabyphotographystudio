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
                <Button variant="ghost" className="rounded-full h-12 pl-2 pr-3 gap-2 border border-peach-deep/40 bg-peach/30 hover:bg-peach/50" aria-label="אזור אישי">
                  <span className="hidden sm:flex flex-col items-end leading-tight text-right">
                    <span className="text-[10px] tracking-[0.25em] uppercase text-foreground/60">אזור אישי</span>
                    <span className="text-sm font-medium text-foreground max-w-[140px] truncate">{displayName || "שלום"}</span>
                  </span>
                  <span className="h-10 w-10 rounded-full bg-peach-deep text-primary flex items-center justify-center shrink-0">
                    <UserIcon className="!h-5 !w-5" />
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="text-right">
                  <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">אזור אישי</div>
                  <div className="font-display text-base text-primary truncate">{displayName || "לקוח/ה"}</div>
                  <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.navigate({ to: "/account" })}>
                  הכרטיסייה שלי
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.navigate({ to: "/cart" })}>
                  העגלה שלי
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
            <Link to="/auth" aria-label="כניסה לאזור אישי" title="אזור אישי">
              <Button variant="default" size="icon" className="rounded-full h-12 w-12 bg-peach-deep text-primary hover:bg-peach-deep/90 shadow-md">
                <UserIcon className="!h-5 !w-5" />
              </Button>
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

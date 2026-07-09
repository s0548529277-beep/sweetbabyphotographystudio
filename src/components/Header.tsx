import { Link, useRouter } from "@tanstack/react-router";
import { ShoppingBag, User as UserIcon, LogOut, Menu } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import logo from "@/assets/logo-green.png";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const nav = [
  { to: "/", label: "בית" },
  { to: "/catalog", label: "קטלוג" },
  { to: "/pricing", label: "מחירון והזמנה" },
  { to: "/prop-booking", label: "הזמנת אביזרים" },

  { to: "/about", label: "אודות" },
  { to: "/contact", label: "יצירת קשר" },
];


export function Header() {
  const { count } = useCart();
  const { user, isAdmin, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/80 border-b border-border">
      <div className="container-page flex items-center justify-between h-20 gap-6">
        <Link to="/" className="flex items-center gap-3 shrink-0">
          <img src={logo} alt="Sweetbaby" className="h-10 w-auto" />
        </Link>

        <nav className="hidden md:flex items-center gap-10 text-[11px] tracking-[0.28em] uppercase">
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

        <div className="flex items-center gap-2">
          <Link to="/cart" className="relative" aria-label={`עגלת קניות${count > 0 ? ` (${count} פריטים)` : ""}`}>
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="עגלת קניות">
              <ShoppingBag className="h-5 w-5" />
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
                <Button variant="ghost" size="icon" className="rounded-full" aria-label="תפריט משתמש">
                  <UserIcon className="h-5 w-5" />
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
              <Button variant="default" className="rounded-full">התחברות</Button>
            </Link>
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden rounded-full" aria-label="פתיחת תפריט ניווט">
                <Menu className="h-5 w-5" />
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

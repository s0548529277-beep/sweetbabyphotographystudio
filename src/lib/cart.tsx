import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CartLine = {
  id: string;
  name: string;
  sku: string;
  price: number;
  image_url: string | null;
  quantity: number;
};

export type AppliedCoupon = {
  code: string;
  discount_percent: number;
  discount_amount: number;
};

type CartContextValue = {
  lines: CartLine[];
  add: (line: Omit<CartLine, "quantity">) => void;
  remove: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  clear: () => void;
  count: number;
  subtotal: number;
  coupon: AppliedCoupon | null;
  applyCoupon: (code: string) => Promise<{ ok: boolean; message: string }>;
  removeCoupon: () => void;
  discount: number;
  total: number;
};

const CartContext = createContext<CartContextValue | null>(null);
const KEY = "sweetbaby.cart.v1";
const COUPON_KEY = "sweetbaby.coupon.v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setLines(JSON.parse(raw));
      const c = localStorage.getItem(COUPON_KEY);
      if (c) setCoupon(JSON.parse(c));
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch {}
  }, [lines]);

  useEffect(() => {
    try {
      if (coupon) localStorage.setItem(COUPON_KEY, JSON.stringify(coupon));
      else localStorage.removeItem(COUPON_KEY);
    } catch {}
  }, [coupon]);

  const add: CartContextValue["add"] = (line) =>
    setLines((prev) => {
      const found = prev.find((l) => l.id === line.id);
      if (found) return prev.map((l) => (l.id === line.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { ...line, quantity: 1 }];
    });

  const remove = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id));
  const setQty = (id: string, qty: number) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, quantity: Math.max(1, qty) } : l)));
  const clear = () => { setLines([]); setCoupon(null); };

  const count = lines.reduce((a, l) => a + l.quantity, 0);
  const subtotal = lines.reduce((a, l) => a + l.quantity * l.price, 0);
  const discount = coupon
    ? Math.min(subtotal, (subtotal * (coupon.discount_percent || 0)) / 100 + (coupon.discount_amount || 0))
    : 0;
  const total = Math.max(0, subtotal - discount);

  const applyCoupon: CartContextValue["applyCoupon"] = async (raw) => {
    const code = raw.trim().toUpperCase();
    if (!code) return { ok: false, message: "יש להזין קוד" };
    const { data, error } = await supabase
      .from("coupons")
      .select("code, discount_percent, discount_amount, active, expires_at, single_use, redeemed_at")
      .eq("code", code)
      .maybeSingle();
    if (error || !data) return { ok: false, message: "קוד לא נמצא" };
    if (!data.active) return { ok: false, message: "הקוד אינו פעיל" };
    if (data.expires_at && new Date(data.expires_at) < new Date())
      return { ok: false, message: "פג תוקף הקוד" };
    if (data.single_use && data.redeemed_at) return { ok: false, message: "הקוד כבר נוצל בעבר" };
    setCoupon({
      code: data.code,
      discount_percent: Number(data.discount_percent) || 0,
      discount_amount: Number(data.discount_amount) || 0,
    });
    return { ok: true, message: `קוד ${data.code} הופעל` };
  };

  const removeCoupon = () => setCoupon(null);

  return (
    <CartContext.Provider value={{ lines, add, remove, setQty, clear, count, subtotal, coupon, applyCoupon, removeCoupon, discount, total }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

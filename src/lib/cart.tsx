import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type CartLine = {
  id: string;
  name: string;
  sku: string;
  price: number;
  image_url: string | null;
  quantity: number;
};

type CartContextValue = {
  lines: CartLine[];
  add: (line: Omit<CartLine, "quantity">) => void;
  remove: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  clear: () => void;
  count: number;
  subtotal: number;
};

const CartContext = createContext<CartContextValue | null>(null);
const KEY = "sweetbaby.cart.v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setLines(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch {}
  }, [lines]);

  const add: CartContextValue["add"] = (line) =>
    setLines((prev) => {
      const found = prev.find((l) => l.id === line.id);
      if (found) return prev.map((l) => (l.id === line.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { ...line, quantity: 1 }];
    });

  const remove = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id));
  const setQty = (id: string, qty: number) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, quantity: Math.max(1, qty) } : l)));
  const clear = () => setLines([]);

  const count = lines.reduce((a, l) => a + l.quantity, 0);
  const subtotal = lines.reduce((a, l) => a + l.quantity * l.price, 0);

  return (
    <CartContext.Provider value={{ lines, add, remove, setQty, clear, count, subtotal }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type WishlistItem = {
  id: string;
  name: string;
  sku: string;
  price: number;
  image_url: string | null;
};

type WishlistContextValue = {
  items: WishlistItem[];
  has: (id: string) => boolean;
  toggle: (item: WishlistItem) => void;
  remove: (id: string) => void;
  count: number;
};

const WishlistContext = createContext<WishlistContextValue | null>(null);
const KEY = "sweetbaby.wishlist.v1";

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<WishlistItem[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {}
  }, [items]);

  const has = (id: string) => items.some((i) => i.id === id);

  const toggle = (item: WishlistItem) =>
    setItems((prev) =>
      prev.some((i) => i.id === item.id) ? prev.filter((i) => i.id !== item.id) : [...prev, item],
    );

  const remove = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  return (
    <WishlistContext.Provider value={{ items, has, toggle, remove, count: items.length }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used within WishlistProvider");
  return ctx;
}

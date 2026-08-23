import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FeaturedCoupon = { code: string; discount_percent: number; discount_amount: number };

export function discountLabel(c: FeaturedCoupon): string {
  const parts: string[] = [];
  if (c.discount_percent > 0) parts.push(`${c.discount_percent}%`);
  if (c.discount_amount > 0) parts.push(`₪${c.discount_amount}`);
  return parts.join(" + ");
}

// Whichever coupon an admin flagged as "newsletter_default" in
// /admin/coupons — shared by the footer signup form and the popup, so
// there's one place that decides what incentive (if any) is advertised.
export function useFeaturedCoupon(): FeaturedCoupon | null {
  const [coupon, setCoupon] = useState<FeaturedCoupon | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("coupons")
        .select("code, discount_percent, discount_amount")
        .eq("newsletter_default", true)
        .eq("active", true)
        .maybeSingle();
      if (mounted && data) setCoupon(data as FeaturedCoupon);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return coupon;
}

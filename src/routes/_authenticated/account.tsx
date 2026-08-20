import { heError } from "@/lib/he-errors";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { ProductImage } from "@/components/ProductImage";
import { GoogleCompleteCard } from "@/components/GoogleCompleteCard";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { cancelBooking, cancelOrder } from "@/lib/bookings.functions";
import { Package, Calendar as CalIcon, User as UserIcon, FileText, ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/_authenticated/account")({
  component: Account,
  head: () => ({ meta: [{ title: "הכרטיסייה שלי | Sweetbaby" }] }),
});

const STATUS_HE: Record<string, string> = {
  pending: "ממתין לאישור",
  confirmed: "אושר",
  active: "בהשכרה",
  returned: "הוחזר",
  cancelled: "בוטל",
};

function Account() {
  const { user } = useAuth();
  const { lines: cartLines, subtotal: cartSubtotal, count: cartCount, remove: removeFromCart } = useCart();
  const [profile, setProfile] = useState({ full_name: "", phone: "", address: "", city: "", discount_code: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const cancelB = useServerFn(cancelBooking);
  const cancelO = useServerFn(cancelOrder);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const doCancelBooking = async (id: string) => {
    if (!confirm("לבטל את השריון?")) return;
    setCancelling(id);
    try { await cancelB({ data: { id } }); toast.success("השריון בוטל"); bookings.refetch(); }
    catch (e) { toast.error(heError(e, "ביטול נכשל")); }
    finally { setCancelling(null); }
  };
  const doCancelOrder = async (id: string) => {
    if (!confirm("לבטל את ההזמנה?")) return;
    setCancelling(id);
    try { await cancelO({ data: { id } }); toast.success("ההזמנה בוטלה"); orders.refetch(); }
    catch (e) { toast.error(heError(e, "ביטול נכשל")); }
    finally { setCancelling(null); }
  };

  const profileQ = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (profileQ.data) {
      setProfile({
        full_name: profileQ.data.full_name ?? "",
        phone: profileQ.data.phone ?? "",
        address: profileQ.data.address ?? "",
        city: (profileQ.data as any).city ?? "",
        discount_code: (profileQ.data as any).discount_code ?? "",
        notes: profileQ.data.notes ?? "",
      });
    }
  }, [profileQ.data]);

  const orders = useQuery({
    queryKey: ["my-orders", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const bookings = useQuery({
    queryKey: ["my-bookings", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .order("session_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const loyaltyQ = useQuery({
    queryKey: ["my-loyalty", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("customer_loyalty").select("credit_balance").eq("user_id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from("profiles").upsert({ id: user!.id, ...profile });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("הפרטים נשמרו");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <section className="container-page py-14 flex-1">
        <div className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-3">My Account</div>
        <h1 className="font-display text-5xl text-primary mb-10">הכרטיסייה שלי</h1>

        <div className="grid lg:grid-cols-[380px_1fr] gap-8">
          <aside className="bg-card rounded-3xl p-7 border border-primary/5 h-fit">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-12 w-12 rounded-full bg-peach text-primary flex items-center justify-center">
                <UserIcon className="h-5 w-5" />
              </div>
              <div>
                <div className="font-display text-xl text-primary">{profile.full_name || "לקוח/ה חדש/ה"}</div>
                <div className="text-xs text-muted-foreground">{user?.email}</div>
              </div>
            </div>
            {Number(loyaltyQ.data?.credit_balance ?? 0) > 0 && (
              <div className="mb-4 rounded-2xl bg-peach/30 border border-peach px-4 py-3">
                <div className="text-xs text-muted-foreground">קרדיט זמין להזמנות הבאות</div>
                <div className="font-display text-2xl text-primary">₪{Number(loyaltyQ.data!.credit_balance).toFixed(0)}</div>
              </div>
            )}
            <div className="space-y-3">
              <div><Label>שם מלא</Label><Input value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} className="mt-1" /></div>
              <div><Label>טלפון</Label><Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className="mt-1" dir="ltr" /></div>
              <div><Label>כתובת</Label><Input value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} className="mt-1" /></div>
              <div><Label>עיר / יישוב</Label><Input value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} className="mt-1" /></div>
              <div><Label>קוד הנחה (אם יש)</Label><Input value={profile.discount_code} onChange={(e) => setProfile({ ...profile, discount_code: e.target.value })} className="mt-1" dir="ltr" placeholder="SWEET10" /></div>
              <div><Label>הערות</Label><Textarea rows={2} value={profile.notes} onChange={(e) => setProfile({ ...profile, notes: e.target.value })} className="mt-1" /></div>
              <Button onClick={save} disabled={busy} className="w-full rounded-full mt-2">שמור שינויים</Button>
            </div>
          </aside>

          <div className="space-y-8">
            <GoogleCompleteCard phone={profile.phone} onPhoneSaved={(p: string) => setProfile((x) => ({ ...x, phone: p }))} />
            {/* Current cart */}

            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-3xl text-primary flex items-center gap-2">
                  <ShoppingBag className="h-6 w-6" /> הסל שלי
                </h2>
                {cartCount > 0 && (
                  <Link to="/cart"><Button className="rounded-full">מעבר לסל ({cartCount})</Button></Link>
                )}
              </div>
              {cartLines.length === 0 ? (
                <div className="bg-cream/60 rounded-3xl p-8 text-center border border-primary/10">
                  <ShoppingBag className="h-7 w-7 text-primary/40 mx-auto mb-2" />
                  <div className="text-muted-foreground text-sm">הסל כרגע ריק. <Link to="/rental-catalog" className="text-forest underline underline-offset-4">גלי את הקטלוג</Link></div>
                </div>
              ) : (
                <div className="bg-card rounded-2xl p-5 border border-primary/5 space-y-3">
                  {cartLines.map((l) => (
                    <div key={l.id} className="flex items-center gap-3">
                      <div className="h-14 w-14 rounded-xl overflow-hidden bg-cream shrink-0">
                        <ProductImage imageUrl={l.image_url} alt={l.name} fallbackClassName="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-display text-sm text-primary truncate">{l.name}</div>
                        <div className="text-xs text-muted-foreground">מק״ט {l.sku} · ₪{l.price} × {l.quantity}</div>
                      </div>
                      <div className="font-display text-peach-deep">₪{(l.price * l.quantity).toFixed(0)}</div>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeFromCart(l.id)}>הסירי</Button>
                    </div>
                  ))}
                  <div className="pt-3 border-t border-primary/5 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">סכום ביניים</span>
                    <span className="font-display text-2xl text-primary">₪{cartSubtotal.toFixed(0)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Studio bookings */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-3xl text-primary flex items-center gap-2">
                  <CalIcon className="h-6 w-6" /> השכרת סטודיו
                </h2>
                <Link to="/studio-rental"><Button variant="outline" className="rounded-full">שריון חדש</Button></Link>
              </div>
              {bookings.isLoading ? (
                <div className="text-muted-foreground">טוען…</div>
              ) : (bookings.data?.length ?? 0) === 0 ? (
                <div className="bg-cream/60 rounded-3xl p-6 text-center border border-primary/10 text-sm text-muted-foreground">
                  אין עדיין שריוני סטודיו.
                </div>
              ) : (
                <div className="space-y-3">
                  {bookings.data!.map((b: any) => (
                    <div key={b.id} className="bg-card rounded-2xl p-5 border border-primary/5 flex flex-wrap justify-between gap-3">
                      <div>
                        <div className="font-display text-lg text-primary">
                          {new Date(b.session_date).toLocaleDateString("he-IL")} · {String(b.start_time).slice(0,5)}–{String(b.end_time).slice(0,5)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {b.package === "morning" ? "מבצע בוקר ניו-בורן" : `${b.slots} חצאי שעות`} · סטטוס: {STATUS_HE[b.status] ?? b.status}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="font-display text-2xl text-peach-deep">₪{Number(b.price).toFixed(0)}</div>
                        {b.status === "pending" && (
                          <Button variant="outline" size="sm" className="rounded-full text-xs" disabled={cancelling === b.id} onClick={() => doCancelBooking(b.id)}>
                            {cancelling === b.id ? "מבטל…" : "ביטול"}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <h2 className="font-display text-3xl text-primary">היסטוריית הזמנות אביזרים</h2>
              <Link to="/rental-catalog"><Button variant="outline" className="rounded-full">הזמנה חדשה</Button></Link>
            </div>



            {orders.isLoading ? (
              <div className="text-muted-foreground">טוען…</div>
            ) : (orders.data?.length ?? 0) === 0 ? (
              <div className="bg-cream/60 rounded-3xl p-10 text-center border border-primary/10">
                <Package className="h-8 w-8 text-primary/40 mx-auto mb-3" />
                <div className="font-display text-2xl text-primary">אין עדיין הזמנות</div>
                <p className="text-muted-foreground text-sm mt-1 mb-6">התחילו לגלות את הקטלוג.</p>
                <Link to="/rental-catalog"><Button className="rounded-full">לקטלוג</Button></Link>
              </div>
            ) : (
              orders.data!.map((o: any) => (
                <div key={o.id} className="bg-card rounded-2xl p-6 border border-primary/5">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div>
                      <div className="font-display text-xl text-primary">הזמנה #{o.id.slice(0, 8)}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <CalIcon className="h-3 w-3" /> {new Date(o.created_at).toLocaleDateString("he-IL")}
                        {o.scheduled_date && <> · צילום {new Date(o.scheduled_date).toLocaleDateString("he-IL")}</>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="rounded-full">{STATUS_HE[o.status] ?? o.status}</Badge>
                      <div className="font-display text-2xl text-peach-deep">₪{Number(o.total).toFixed(0)}</div>
                      {o.status === "pending" && (
                        <Button variant="outline" size="sm" className="rounded-full text-xs" disabled={cancelling === o.id} onClick={() => doCancelOrder(o.id)}>
                          {cancelling === o.id ? "מבטל…" : "ביטול"}
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                    {o.order_items?.map((oi: any) => (
                      <span key={oi.id}>{oi.item_name} × {oi.quantity}</span>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-primary/5 flex justify-end">
                    <Link
                      to="/orders/$id/receipt"
                      params={{ id: o.id }}
                      className="inline-flex items-center gap-2 text-sm text-forest hover:text-primary"
                    >
                      <FileText className="h-4 w-4" />
                      צפייה / הורדת אישור הזמנה (PDF)
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}

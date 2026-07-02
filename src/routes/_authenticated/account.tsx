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
import { toast } from "sonner";
import { Package, Calendar as CalIcon, User as UserIcon, FileText } from "lucide-react";

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
  const [profile, setProfile] = useState({ full_name: "", phone: "", address: "", notes: "" });
  const [busy, setBusy] = useState(false);

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
            <div className="space-y-3">
              <div><Label>שם מלא</Label><Input value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} className="mt-1" /></div>
              <div><Label>טלפון</Label><Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className="mt-1" dir="ltr" /></div>
              <div><Label>כתובת</Label><Input value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} className="mt-1" /></div>
              <div><Label>הערות</Label><Textarea rows={2} value={profile.notes} onChange={(e) => setProfile({ ...profile, notes: e.target.value })} className="mt-1" /></div>
              <Button onClick={save} disabled={busy} className="w-full rounded-full mt-2">שמור שינויים</Button>
            </div>
          </aside>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-3xl text-primary">היסטוריית הזמנות</h2>
              <Link to="/catalog"><Button variant="outline" className="rounded-full">הזמנה חדשה</Button></Link>
            </div>

            {orders.isLoading ? (
              <div className="text-muted-foreground">טוען…</div>
            ) : (orders.data?.length ?? 0) === 0 ? (
              <div className="bg-cream/60 rounded-3xl p-10 text-center border border-primary/10">
                <Package className="h-8 w-8 text-primary/40 mx-auto mb-3" />
                <div className="font-display text-2xl text-primary">אין עדיין הזמנות</div>
                <p className="text-muted-foreground text-sm mt-1 mb-6">התחילו לגלות את הקטלוג.</p>
                <Link to="/catalog"><Button className="rounded-full">לקטלוג</Button></Link>
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
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                    {o.order_items?.map((oi: any) => (
                      <span key={oi.id}>{oi.item_name} × {oi.quantity}</span>
                    ))}
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

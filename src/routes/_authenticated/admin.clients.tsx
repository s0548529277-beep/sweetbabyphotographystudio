import { heError } from "@/lib/he-errors";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listClientEmails, setClientPassword, updateClientProfile, setCustomerLoyalty, grantManualCredit } from "@/lib/admin-clients.functions";
import { Camera, Package, Pencil, Gift, Tag, Wand2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/clients")({
  component: ClientsAdmin,
});

function ClientsAdmin() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<{ id: string; view: "order" | "booking" | "edit" } | null>(null);
  const fetchEmails = useServerFn(listClientEmails);
  const emailsQ = useQuery({ queryKey: ["admin-client-emails"], queryFn: () => fetchEmails({ data: {} } as any) });
  const emails: Record<string, string> = (emailsQ.data as any) ?? {};

  const clients = useQuery({
    queryKey: ["admin-clients"],
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const [profilesRes, ordersRes, bookingsRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("orders").select("id, user_id, total, status, scheduled_date, session_date, created_at"),
        supabase.from("bookings").select("id, user_id, price, status, session_date, start_time, end_time, package, created_at"),
      ]);
      return (profilesRes.data ?? []).map((p: any) => ({
        ...p,
        orders: (ordersRes.data ?? []).filter((o: any) => o.user_id === p.id),
        bookings: (bookingsRes.data ?? []).filter((b: any) => b.user_id === p.id),
      }));
    },
  });


  const filtered = (clients.data ?? []).filter((c: any) =>
    !q ||
    (c.full_name ?? "").toLowerCase().includes(q.toLowerCase()) ||
    (c.phone ?? "").includes(q) ||
    (emails[c.id] ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <Input placeholder="חיפוש שם, טלפון או אימייל…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm rounded-full" />
      <div className="bg-card rounded-2xl border border-primary/5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cream/60 text-right">
            <tr>
              <th className="p-3 font-medium">שם</th>
              <th className="p-3 font-medium">טלפון</th>
              <th className="p-3 font-medium">אימייל</th>
              <th className="p-3 font-medium">כתובת</th>
              <th className="p-3 font-medium">צפייה</th>
              <th className="p-3 font-medium">סה״כ צריכה</th>
              <th className="p-3 font-medium">הצטרפות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c: any) => {
              const orders = c.orders ?? [];
              const bookings = c.bookings ?? [];
              const total =
                orders.reduce((s: number, o: any) => s + Number(o.total ?? 0), 0) +
                bookings.reduce((s: number, b: any) => s + Number(b.price ?? 0), 0);
              const isOpen = open?.id === c.id;
              const list = isOpen ? (open!.view === "order" ? orders : bookings) : [];
              return (
                <>
                  <tr key={c.id} className="border-t border-border">
                    <td className="p-3 font-medium">{c.full_name || "—"}</td>
                    <td className="p-3" dir="ltr">{c.phone || "—"}</td>
                    <td className="p-3 text-muted-foreground" dir="ltr">{emails[c.id] || "—"}</td>
                    <td className="p-3 text-muted-foreground">{c.address || "—"}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={isOpen && open!.view === "order" ? "default" : "outline"}
                          className="rounded-full gap-1.5 h-8"
                          onClick={() => setOpen(isOpen && open!.view === "order" ? null : { id: c.id, view: "order" })}
                        >
                          <Package className="h-3.5 w-3.5" /> הזמנות ({orders.length})
                        </Button>
                        <Button
                          size="sm"
                          variant={isOpen && open!.view === "booking" ? "default" : "outline"}
                          className="rounded-full gap-1.5 h-8"
                          onClick={() => setOpen(isOpen && open!.view === "booking" ? null : { id: c.id, view: "booking" })}
                        >
                          <Camera className="h-3.5 w-3.5" /> סטודיו ({bookings.length})
                        </Button>
                        <Button
                          size="sm"
                          variant={isOpen && open!.view === "edit" ? "default" : "outline"}
                          className="rounded-full gap-1.5 h-8"
                          onClick={() => setOpen(isOpen && open!.view === "edit" ? null : { id: c.id, view: "edit" })}
                        >
                          <Pencil className="h-3.5 w-3.5" /> עריכה
                        </Button>
                      </div>
                    </td>
                    <td className="p-3 font-display text-peach-deep">₪{total.toFixed(0)}</td>
                    <td className="p-3 text-muted-foreground">{new Date(c.created_at).toLocaleDateString("he-IL")}</td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-cream/40">
                      <td colSpan={7} className="p-4">
                        {open!.view === "edit" ? (
                          <ClientEditor client={c} email={emails[c.id] ?? ""} onSaved={() => clients.refetch()} />
                        ) : list.length === 0 ? (
                          <div className="text-muted-foreground text-sm">
                            {open!.view === "order" ? "אין הזמנות אביזרים" : "אין השכרות סטודיו"}
                          </div>
                        ) : (
                          <ul className="space-y-2">
                            {list.map((r: any) => (
                              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card px-3 py-2">
                                <div className="flex items-center gap-2">
                                  {open!.view === "order" ? <Package className="h-4 w-4 text-blush-deep" /> : <Camera className="h-4 w-4 text-forest" />}
                                  <span>
                                    {(r.session_date ?? r.scheduled_date)
                                      ? new Date(r.session_date ?? r.scheduled_date).toLocaleDateString("he-IL")
                                      : new Date(r.created_at).toLocaleDateString("he-IL")}
                                  </span>
                                  {r.start_time && <span className="text-xs text-muted-foreground" dir="ltr">{r.start_time}–{r.end_time}</span>}
                                  {r.package && <span className="text-xs text-muted-foreground">{r.package}</span>}
                                </div>
                                <div className="flex items-center gap-3">
                                  <Badge variant="secondary" className="text-[10px]">{r.status}</Badge>
                                  <span className="font-display text-peach-deep">₪{Number(r.total ?? r.price ?? 0).toFixed(0)}</span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={7} className="p-16 text-center text-muted-foreground">אין לקוחות עדיין.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Admin editing of a client's details + password (email itself is immutable). */
function ClientEditor({ client, email, onSaved }: { client: any; email: string; onSaved: () => void }) {
  const [f, setF] = useState({
    full_name: client.full_name ?? "",
    phone: client.phone ?? "",
    address: client.address ?? "",
    city: client.city ?? "",
    discount_code: client.discount_code ?? "",
    notes: client.notes ?? "",
  });
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const saveProfile = useServerFn(updateClientProfile);
  const savePassword = useServerFn(setClientPassword);
  const saveLoyalty = useServerFn(setCustomerLoyalty);
  const grantCredit = useServerFn(grantManualCredit);

  const loyalty = useQuery({
    queryKey: ["admin-client-loyalty", client.id],
    queryFn: async () => {
      const { data } = await supabase.from("customer_loyalty").select("*").eq("user_id", client.id).maybeSingle();
      return data;
    },
  });

  // retouch_allowed_clients is keyed by email (not user_id) so the admin
  // can also grant access to someone with no site account yet — see the
  // "לקוחות מורשות" section on /admin/retouch-presets. This toggle is just
  // a shortcut for clients who already have a known email here. New table
  // — cast until the generated Database type (types.ts) picks it up.
  const normalizedEmail = email.trim().toLowerCase();
  const retouchAccess = useQuery({
    queryKey: ["admin-client-retouch-access", normalizedEmail],
    enabled: !!normalizedEmail,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("retouch_allowed_clients")
        .select("email")
        .eq("email", normalizedEmail)
        .maybeSingle();
      return !!data;
    },
  });
  const [retouchBusy, setRetouchBusy] = useState(false);
  const toggleRetouchAccess = async (enabled: boolean) => {
    if (!normalizedEmail) return toast.error("ללקוחה הזו אין אימייל רשום");
    setRetouchBusy(true);
    try {
      const { error } = enabled
        ? await (supabase as any).from("retouch_allowed_clients").insert({ email: normalizedEmail })
        : await (supabase as any).from("retouch_allowed_clients").delete().eq("email", normalizedEmail);
      if (error) throw error;
      retouchAccess.refetch();
    } catch (e) {
      toast.error(heError(e, "עדכון הגישה נכשל"));
    } finally {
      setRetouchBusy(false);
    }
  };
  const [lf, setLf] = useState({ cashback_percent: "0", cashback_expires_at: "", custom_hourly_rate: "", can_book_recurring: false });
  const [manualAmount, setManualAmount] = useState("");
  const [grantBusy, setGrantBusy] = useState(false);
  useEffect(() => {
    if (loyalty.data) {
      setLf({
        cashback_percent: String(loyalty.data.cashback_percent ?? 0),
        cashback_expires_at: loyalty.data.cashback_expires_at ? String(loyalty.data.cashback_expires_at).slice(0, 10) : "",
        custom_hourly_rate: (loyalty.data as any).custom_hourly_rate ? String((loyalty.data as any).custom_hourly_rate) : "",
        can_book_recurring: !!(loyalty.data as any).can_book_recurring,
      });
    }
  }, [loyalty.data]);

  const submit = async () => {
    setBusy(true);
    try {
      await saveProfile({ data: { user_id: client.id, ...f } });
      await saveLoyalty({
        data: {
          user_id: client.id,
          cashback_percent: Math.max(0, Math.min(100, Math.floor(Number(lf.cashback_percent) || 0))),
          cashback_expires_at: lf.cashback_expires_at || null,
          custom_hourly_rate: lf.custom_hourly_rate.trim() ? Math.max(0, Number(lf.custom_hourly_rate)) : null,
          can_book_recurring: lf.can_book_recurring,
        },
      });
      if (pw.trim()) {
        await savePassword({ data: { user_id: client.id, password: pw.trim().length >= 6 ? pw.trim() : pw.trim() + ".Sb1" } });
        setPw("");
      }
      toast.success("פרטי הלקוח עודכנו");
      loyalty.refetch();
      onSaved();
    } catch (e) {
      toast.error(heError(e, "העדכון נכשל"));
    } finally {
      setBusy(false);
    }
  };

  /** Immediate credit adjustment — independent of the profile/cashback-% form above, applied instantly on click (not on "שמירת שינויים"). */
  const handleGrant = async (sign: 1 | -1) => {
    const amount = Math.abs(Number(manualAmount));
    if (!amount) return toast.error("להזין סכום");
    setGrantBusy(true);
    try {
      const res = await grantCredit({ data: { user_id: client.id, amount: sign * amount } });
      toast.success(sign === 1 ? `נוספו ₪${amount} ליתרה` : `נוכו ₪${amount} מהיתרה`);
      setManualAmount("");
      loyalty.refetch();
    } catch (e) {
      toast.error(heError(e, "הפעולה נכשלה"));
    } finally {
      setGrantBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">אימייל (לא ניתן לשינוי): <span dir="ltr">{email || "—"}</span></div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Input placeholder="שם מלא" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
        <Input placeholder="טלפון" dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Input placeholder="כתובת" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        <Input placeholder="עיר" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
        <Input placeholder="קוד הנחה" dir="ltr" value={f.discount_code} onChange={(e) => setF({ ...f, discount_code: e.target.value })} />
        <Input placeholder="הערות" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <Input placeholder="סיסמה חדשה / קוד סודי" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} />
      </div>

      <div className="rounded-xl bg-card p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-forest">
          <Tag className="h-4 w-4" /> תעריף אישי לשעת סטודיו
        </div>
        <p className="text-xs text-muted-foreground">
          אם מוגדר, מחליף לגמרי את מחירון השעות הרגיל (וגם את מבצע הבוקר) בכל שריון סטודיו שהלקוחה הזו תעשה — כולל בסדרות שבועיות חוזרות. השאירי ריק לחזרה למחירון הרגיל.
        </p>
        <div className="max-w-[200px]">
          <Label className="text-xs text-muted-foreground">תעריף (₪ לשעה)</Label>
          <Input
            type="number"
            min={0}
            dir="ltr"
            placeholder="ריק = מחירון רגיל"
            value={lf.custom_hourly_rate}
            onChange={(e) => setLf({ ...lf, custom_hourly_rate: e.target.value })}
          />
        </div>
        <div className="pt-2 border-t border-border flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium">מאושרת לסדרה שבועית חוזרת</div>
            <div className="text-[11px] text-muted-foreground">רק לקוחות מאושרות יכולות לקבוע סדרת שריונים שבועית (עד 3 חודשים קדימה) ב-/booking.</div>
          </div>
          <Switch checked={lf.can_book_recurring} onCheckedChange={(v) => setLf({ ...lf, can_book_recurring: v })} />
        </div>
      </div>

      <div className="rounded-xl bg-card p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Wand2 className="h-4 w-4 text-forest shrink-0" />
          <div>
            <div className="text-xs font-medium">גישה לעיבוד תמונות AI</div>
            <div className="text-[11px] text-muted-foreground">מאפשר ללקוחה להשתמש בעמוד /photo-retouch (עריכת תמונות אוטומטית לפני/אחרי).</div>
          </div>
        </div>
        <Switch
          checked={!!retouchAccess.data}
          disabled={!normalizedEmail || retouchAccess.isLoading || retouchBusy}
          onCheckedChange={toggleRetouchAccess}
        />
      </div>

      <div className="rounded-xl bg-card p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-forest">
          <Gift className="h-4 w-4" /> צבירת קרדיט (Cashback)
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">אחוז צבירה (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              dir="ltr"
              value={lf.cashback_percent}
              onChange={(e) => setLf({ ...lf, cashback_percent: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">תוקף הצבירה (ריק = ללא הגבלה)</Label>
            <Input
              type="date"
              value={lf.cashback_expires_at}
              onChange={(e) => setLf({ ...lf, cashback_expires_at: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">יתרת קרדיט נוכחית</Label>
            <div className="h-10 flex items-center font-display text-lg text-peach-deep">
              ₪{Number(loyalty.data?.credit_balance ?? 0).toFixed(0)}
            </div>
            <div className="text-[11px] text-muted-foreground flex gap-3 -mt-1">
              <span>מ-Cashback: ₪{Number(loyalty.data?.cashback_credit_balance ?? 0).toFixed(0)}</span>
              <span>ידני: ₪{Number(loyalty.data?.manual_credit_balance ?? 0).toFixed(0)}</span>
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-border">
          <Label className="text-xs text-muted-foreground">הענקת קרדיט ידנית (מיידי, לא תלוי תשלום)</Label>
          <div className="flex items-center gap-2 mt-1">
            <Input
              type="number"
              min={0}
              dir="ltr"
              placeholder="₪ סכום"
              value={manualAmount}
              onChange={(e) => setManualAmount(e.target.value)}
              className="max-w-[140px]"
            />
            <Button type="button" size="sm" variant="secondary" disabled={grantBusy} onClick={() => handleGrant(1)}>
              {grantBusy ? "מבצע…" : "+ הוספה"}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={grantBusy} onClick={() => handleGrant(-1)}>
              − ניכוי
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            פועל מיד עם הלחיצה, בנפרד מ"שמירת שינויים" למעלה. לא קשור לאחוז ה-Cashback.
          </p>
        </div>
      </div>

      <Button onClick={submit} disabled={busy} className="rounded-full">{busy ? "שומר…" : "שמירת שינויים"}</Button>
    </div>
  );
}

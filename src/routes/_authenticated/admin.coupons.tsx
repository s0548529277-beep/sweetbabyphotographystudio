import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Ticket, Gift } from "lucide-react";
import { heError } from "@/lib/he-errors";

export const Route = createFileRoute("/_authenticated/admin/coupons")({
  component: CouponsAdmin,
});

type Coupon = {
  id: string;
  code: string;
  discount_percent: number;
  discount_amount: number;
  active: boolean;
  expires_at: string | null;
  created_at: string;
  newsletter_default: boolean;
};

type CouponForm = {
  id?: string;
  code: string;
  discount_percent: number;
  discount_amount: number;
  active: boolean;
  expires_at: string; // yyyy-mm-dd, empty = no expiry
  newsletter_default: boolean;
};

const empty: CouponForm = {
  code: "",
  discount_percent: 10,
  discount_amount: 0,
  active: true,
  expires_at: "",
  newsletter_default: false,
};

function CouponsAdmin() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CouponForm>(empty);
  const [saving, setSaving] = useState(false);

  const coupons = useQuery({
    queryKey: ["admin-coupons"],
    queryFn: async () => {
      // Personal single-use codes (auto-minted per newsletter subscriber,
      // see newsletter.functions.ts) are excluded here — this list is for
      // the shared/template coupons an admin manages by hand.
      const { data, error } = await supabase
        .from("coupons")
        .select("*")
        .eq("single_use", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Coupon[];
    },
  });

  const openNew = () => {
    setForm(empty);
    setOpen(true);
  };

  const openEdit = (c: Coupon) => {
    setForm({
      id: c.id,
      code: c.code,
      discount_percent: c.discount_percent,
      discount_amount: Number(c.discount_amount),
      active: c.active,
      expires_at: c.expires_at ? c.expires_at.slice(0, 10) : "",
      newsletter_default: c.newsletter_default,
    });
    setOpen(true);
  };

  const save = async () => {
    const code = form.code.trim().toUpperCase();
    if (!code) return toast.error("קוד קופון חובה");
    if (!form.discount_percent && !form.discount_amount) {
      return toast.error("יש להזין אחוז הנחה ו/או סכום הנחה גדול מ-0");
    }
    setSaving(true);
    // Only one coupon can be the newsletter default at a time — clear any
    // previous one before this save takes the spot.
    if (form.newsletter_default) {
      await supabase.from("coupons").update({ newsletter_default: false }).eq("newsletter_default", true);
    }
    const payload = {
      code,
      discount_percent: Math.max(0, Math.min(100, Math.floor(form.discount_percent || 0))),
      discount_amount: Math.max(0, Number(form.discount_amount || 0)),
      active: form.active,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      newsletter_default: form.newsletter_default,
    };
    const { error } = form.id
      ? await supabase.from("coupons").update(payload).eq("id", form.id)
      : await supabase.from("coupons").insert(payload);
    setSaving(false);
    if (error) return toast.error(heError(error.message));
    toast.success(form.id ? "הקופון עודכן" : "הקופון נוסף");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["admin-coupons"] });
  };

  const toggleActive = async (c: Coupon) => {
    const { error } = await supabase.from("coupons").update({ active: !c.active }).eq("id", c.id);
    if (error) return toast.error(heError(error.message));
    qc.invalidateQueries({ queryKey: ["admin-coupons"] });
  };

  const toggleNewsletterDefault = async (c: Coupon) => {
    const next = !c.newsletter_default;
    if (next) {
      await supabase.from("coupons").update({ newsletter_default: false }).eq("newsletter_default", true);
    }
    const { error } = await supabase.from("coupons").update({ newsletter_default: next }).eq("id", c.id);
    if (error) return toast.error(heError(error.message));
    toast.success(next ? `${c.code} יוצג בטופס ההרשמה בתחתית האתר` : "הוסר מטופס ההרשמה");
    qc.invalidateQueries({ queryKey: ["admin-coupons"] });
  };

  const remove = async (c: Coupon) => {
    if (!confirm(`למחוק את הקופון ${c.code}?`)) return;
    const { error } = await supabase.from("coupons").delete().eq("id", c.id);
    if (error) return toast.error(heError(error.message));
    toast.success("הקופון נמחק");
    qc.invalidateQueries({ queryKey: ["admin-coupons"] });
  };

  const discountLabel = (c: Coupon) => {
    const parts: string[] = [];
    if (c.discount_percent > 0) parts.push(`${c.discount_percent}%`);
    if (Number(c.discount_amount) > 0) parts.push(`₪${c.discount_amount}`);
    return parts.length ? parts.join(" + ") : "—";
  };

  const isExpired = (c: Coupon) => c.expires_at && new Date(c.expires_at) < new Date();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl text-primary flex items-center gap-2">
          <Ticket className="h-5 w-5" /> קופונים
        </h2>
        <Button onClick={openNew} className="rounded-full gap-2">
          <Plus className="h-4 w-4" /> קופון חדש
        </Button>
      </div>

      <p className="text-sm text-forest/70">
        קופונים תקפים גם בהשכרת סטודיו וגם בהשכרת אביזרים. קוד לא פעיל, או שפג תוקפו, יידחה אוטומטית בקופה.
        סמנו קופון אחד כ"ברירת מחדל לניוזלטר" כדי שהוא יוצג ויתגלה בטופס ההרשמה בתחתית האתר.
      </p>

      <div className="bg-card rounded-2xl border border-primary/5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cream/60 text-right">
            <tr>
              <th className="p-3 font-medium">קוד</th>
              <th className="p-3 font-medium">הנחה</th>
              <th className="p-3 font-medium">תוקף</th>
              <th className="p-3 font-medium">פעיל</th>
              <th className="p-3 font-medium">ניוזלטר</th>
              <th className="p-3 font-medium">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {(coupons.data ?? []).map((c) => (
              <tr key={c.id} className="border-t border-primary/5">
                <td className="p-3 font-mono" dir="ltr">
                  {c.code}
                </td>
                <td className="p-3">{discountLabel(c)}</td>
                <td className="p-3">
                  {c.expires_at ? (
                    <span className={isExpired(c) ? "text-destructive" : ""}>
                      {new Date(c.expires_at).toLocaleDateString("he-IL")}
                      {isExpired(c) ? " (פג תוקף)" : ""}
                    </span>
                  ) : (
                    <span className="text-forest/60">ללא תפוגה</span>
                  )}
                </td>
                <td className="p-3">
                  <button onClick={() => toggleActive(c)}>
                    <Badge variant={c.active ? "default" : "outline"} className="cursor-pointer">
                      {c.active ? "פעיל" : "כבוי"}
                    </Badge>
                  </button>
                </td>
                <td className="p-3">
                  <button
                    onClick={() => toggleNewsletterDefault(c)}
                    title="הצג/הסתר בטופס ההרשמה לניוזלטר בתחתית האתר"
                  >
                    <Badge
                      variant={c.newsletter_default ? "default" : "outline"}
                      className="cursor-pointer gap-1"
                    >
                      <Gift className="h-3 w-3" /> {c.newsletter_default ? "מוצג" : "כבוי"}
                    </Badge>
                  </button>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(c)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {coupons.isError && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-destructive">
                  שגיאה בטעינת הקופונים: {(coupons.error as any)?.message ?? "שגיאה לא ידועה"}
                </td>
              </tr>
            )}
            {!coupons.isError && coupons.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-forest/60">
                  אין קופונים עדיין
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "עריכת קופון" : "קופון חדש"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>קוד קופון</Label>
              <Input
                dir="ltr"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="לדוגמה: SWEETBABY10"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>אחוז הנחה (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.discount_percent}
                  onChange={(e) => setForm((f) => ({ ...f, discount_percent: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>הנחה קבועה (₪)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.discount_amount}
                  onChange={(e) => setForm((f) => ({ ...f, discount_amount: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div>
              <Label>תאריך תפוגה (ריק = ללא תפוגה)</Label>
              <Input
                type="date"
                value={form.expires_at}
                onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
              <Label>פעיל</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.newsletter_default}
                onCheckedChange={(v) => setForm((f) => ({ ...f, newsletter_default: v }))}
              />
              <Label>ברירת מחדל לניוזלטר (מוצג בטופס ההרשמה בתחתית האתר)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "שומר…" : "שמירה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

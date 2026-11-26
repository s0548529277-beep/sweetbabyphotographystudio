// "לקוחה חדשה" for the general photo-client kind of the unified clients page. Moved here from the old
// /admin/photo-clients list page (that page is now just the client card + gallery), plus two things the
// old client-management journal had: Hebrew date / Shabbat warnings under the date, and the priced
// "שעת צילום ללא עיבוד" (300 ₪ for the hour + 150 ₪ per extra half hour).
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateHints, confirmRestDay } from "@/components/client-management/DateHints";
import { createPhotoClient, PHOTO_PACKAGES, type PhotoPackageKey } from "@/lib/photo-clients.functions";
import { HOURLY_SESSION_PRICING, HOURLY_SESSION_TYPE, hourlySessionPrice } from "@/lib/client-management";
import { hubKind } from "@/lib/client-hub";
import { heError } from "@/lib/he-errors";

const EMPTY_FORM = {
  email: "",
  name: "",
  phone: "",
  sessionDate: "",
  sessionTime: "",
  location: "",
  // Where the session takes place: studio (studio sessions) or the client's home (does not take the studio).
  place: "studio" as "studio" | "home",
  // "package": full package (shoot + editing + album, the 5-stage pipeline). "studio": studio-only booking —
  // wantsEditing then decides whether she still gets the full pipeline or just a plain upload card.
  serviceType: "package" as "package" | "studio",
  wantsEditing: true,
  packageType: "" as PhotoPackageKey | "",
  photosToEdit: "",
  albumUpgrades: "",
  totalPrice: "",
  // "Michal photographs by the hour, no editing" (300 + 150 per extra half hour) — an opt-in price helper, since
  // a plain studio rental without editing is priced by its booking, not by this.
  hourly: false,
  extraHalfHours: 0,
  sendEmail: true,
};

const DURATIONS = [0, 1, 2, 3, 4, 5, 6].map((n) => ({
  n,
  label: n === 0 ? "שעה" : n === 1 ? "שעה וחצי" : n === 2 ? "שעתיים" : `${1 + n / 2} שעות`,
}));

export function GeneralClientDialog({
  open,
  onOpenChange,
  defaultDate,
  prefill,
  sameDayTimes,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultDate?: string;
  prefill?: { name?: string; phone?: string; email?: string } | null;
  sameDayTimes: (date: string | null | undefined) => string[];
  onCreated: (workflowId: string) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const createClient = useServerFn(createPhotoClient);

  useEffect(() => {
    if (open) setForm({ ...EMPTY_FORM, sessionDate: defaultDate ?? "", name: prefill?.name ?? "", phone: prefill?.phone ?? "", email: prefill?.email ?? "" });
  }, [open, defaultDate, prefill]);

  const set = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const hourlyAllowed = form.serviceType === "studio" && !form.wantsEditing;
  const pricing = HOURLY_SESSION_PRICING[HOURLY_SESSION_TYPE];

  // Picking a package prefills the photo-count/upgrades text from the price list — still freely editable
  // per client afterwards, since real shoots deviate from the standard tiers all the time.
  const pickPackage = (key: PhotoPackageKey) => {
    const preset = PHOTO_PACKAGES[key];
    setForm((f) => ({
      ...f,
      packageType: key,
      photosToEdit: preset.photosToEdit != null ? String(preset.photosToEdit) : f.photosToEdit,
      albumUpgrades: preset.albumUpgrades || f.albumUpgrades,
    }));
  };

  // The priced hour fills the price field; she can still overwrite it by hand.
  const pickDuration = (n: number) =>
    setForm((f) => ({ ...f, extraHalfHours: n, totalPrice: String(hourlySessionPrice(HOURLY_SESSION_TYPE, n) ?? "") }));
  const toggleHourly = (on: boolean) =>
    setForm((f) => ({
      ...f,
      hourly: on,
      totalPrice: on ? String(hourlySessionPrice(HOURLY_SESSION_TYPE, f.extraHalfHours) ?? "") : "",
    }));
  const setWantsEditing = (wantsEditing: boolean) =>
    setForm((f) => ({ ...f, wantsEditing, ...(wantsEditing && f.hourly ? { hourly: false, totalPrice: "" } : {}) }));

  const submit = async () => {
    if (!form.email.trim()) return toast.error("צריך למלא אימייל");
    if (!confirmRestDay(form.sessionDate)) return;
    setBusy(true);
    try {
      const priceNum = form.totalPrice.trim() ? Number(form.totalPrice) : undefined;
      const { workflowId, isNewAccount, tempPassword } = await createClient({
        data: {
          email: form.email.trim(),
          name: form.name.trim() || undefined,
          phone: form.phone.trim() || undefined,
          sessionDate: form.sessionDate || undefined,
          sessionTime: form.sessionTime || undefined,
          location:
            [form.place === "home" ? "בבית הלקוחה" : "סטודיו", form.location.trim()].filter(Boolean).join(" — ") || undefined,
          packageType: form.packageType || undefined,
          photosToEdit: form.photosToEdit.trim() ? Number(form.photosToEdit) : undefined,
          albumUpgrades: form.albumUpgrades.trim() || undefined,
          totalPrice: priceNum != null && Number.isFinite(priceNum) && priceNum >= 0 ? priceNum : undefined,
          sendEmail: form.sendEmail,
          hasPackage: form.serviceType === "package",
          wantsEditing: form.serviceType === "studio" ? form.wantsEditing : undefined,
        },
      });
      onOpenChange(false);
      if (isNewAccount) {
        // Shown regardless of sendEmail — the admin needs the code even if she plans to tell the client herself.
        toast.success(`נפתח חשבון חדש. סיסמה זמנית: ${tempPassword}`, { duration: 15000 });
      }
      onCreated(workflowId);
    } catch (e) {
      toast.error(heError(e, "הוספת הלקוחה נכשלה"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className={`${hubKind("general").scope} max-h-[85vh] max-w-lg overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle>לקוחת צילום כללי חדשה</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            אם כבר יש לה חשבון באתר עם המייל הזה — התהליך יתחבר אליו. אם אין — ייפתח לה חשבון חדש אוטומטית, כדי שתוכל בהמשך להיכנס עם
            "שכחתי סיסמה" ולראות את התמונות שלה ב"התמונות שלי".
          </p>

          <div>
            <Label className="text-xs text-muted-foreground">סוג לקוחה</Label>
            <div className="mt-1 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={form.serviceType === "package" ? "default" : "outline"}
                className="flex-1 rounded-full"
                onClick={() => setForm((f) => ({ ...f, serviceType: "package", wantsEditing: true, hourly: false, totalPrice: f.hourly ? "" : f.totalPrice }))}
              >
                חבילת צילום מלאה
              </Button>
              <Button
                type="button"
                size="sm"
                variant={form.serviceType === "studio" ? "default" : "outline"}
                className="flex-1 rounded-full"
                onClick={() => set("serviceType", "studio")}
              >
                השכרת סטודיו בלבד
              </Button>
            </div>
          </div>

          {form.serviceType === "studio" && (
            <div>
              <Label className="text-xs text-muted-foreground">לקחה גם עיבוד תמונות?</Label>
              <div className="mt-1 flex gap-2">
                <Button type="button" size="sm" variant={form.wantsEditing ? "default" : "outline"} className="flex-1 rounded-full" onClick={() => setWantsEditing(true)}>
                  כן
                </Button>
                <Button type="button" size="sm" variant={!form.wantsEditing ? "default" : "outline"} className="flex-1 rounded-full" onClick={() => setWantsEditing(false)}>
                  לא, רק להעלות תמונות
                </Button>
              </div>
              {!form.wantsEditing && (
                <p className="mt-1 text-xs text-muted-foreground">
                  בלי עיבוד — הכרטיסייה שלה תהיה פשוטה: רק העלאת תמונות, בלי שלב בחירה או אלבום. (בכרטיסים היא מופיעה כ"שליחת תמונות בלבד".)
                </p>
              )}
            </div>
          )}

          {hourlyAllowed && (
            <div className="space-y-2 rounded-xl bg-general-blush/40 p-3">
              <div className="flex items-center gap-2">
                <Checkbox checked={form.hourly} onCheckedChange={(v) => toggleHourly(!!v)} />
                <Label className="cursor-pointer text-xs font-normal" onClick={() => toggleHourly(!form.hourly)}>
                  מיכל מצלמת בשעה, בלי עיבוד — ₪{pricing.base} לשעה + ₪{pricing.extraHalfHour} לכל חצי שעה נוספת
                </Label>
              </div>
              {form.hourly && (
                <Select value={String(form.extraHalfHours)} onValueChange={(v) => pickDuration(Number(v))}>
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => (
                      <SelectItem key={d.n} value={String(d.n)}>
                        {d.label} — ₪{hourlySessionPrice(HOURLY_SESSION_TYPE, d.n)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">שם</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="שם הלקוחה" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">אימייל *</Label>
              <Input type="email" dir="ltr" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="client@example.com" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">טלפון</Label>
              <Input dir="ltr" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="050-0000000" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">מועד צילומים</Label>
              <Input type="date" value={form.sessionDate} onChange={(e) => set("sessionDate", e.target.value)} />
              <DateHints date={form.sessionDate} sameDayTimes={sameDayTimes(form.sessionDate)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">שעה</Label>
              <Input type="time" dir="ltr" value={form.sessionTime} onChange={(e) => set("sessionTime", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">מחיר מוסכם (₪)</Label>
              <Input
                type="number"
                min={0}
                dir="ltr"
                value={form.totalPrice}
                onChange={(e) => set("totalPrice", e.target.value)}
                placeholder={form.packageType && PHOTO_PACKAGES[form.packageType].price ? `מחירון ₪${PHOTO_PACKAGES[form.packageType].price}` : "אפשר להשאיר ריק"}
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs text-muted-foreground">מקום הצילום</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.place}
                onChange={(e) => set("place", e.target.value as "studio" | "home")}
              >
                <option value="studio">בסטודיו</option>
                <option value="home">בבית הלקוחה (לא תופס סטודיו וחדר משפחה)</option>
              </select>
              <Input className="mt-2" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="פרטים / כתובת (רשות)" />
            </div>
          </div>

          {!(form.serviceType === "studio" && !form.wantsEditing) && (
            <div className="space-y-3 border-t border-border pt-2">
              {form.serviceType === "package" && (
                <div>
                  <Label className="text-xs text-muted-foreground">סוג חבילה</Label>
                  <Select value={form.packageType || undefined} onValueChange={(v) => pickPackage(v as PhotoPackageKey)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="בחירת חבילה" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(PHOTO_PACKAGES) as [PhotoPackageKey, (typeof PHOTO_PACKAGES)[PhotoPackageKey]][]).map(([key, p]) => (
                        <SelectItem key={key} value={key}>
                          {p.label}
                          {p.price != null ? ` — ₪${p.price}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-xs text-muted-foreground">כמות תמונות לעיבוד</Label>
                <Input type="number" min={0} dir="ltr" value={form.photosToEdit} onChange={(e) => set("photosToEdit", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">אלבום ושדרוגים</Label>
                <Input value={form.albumUpgrades} onChange={(e) => set("albumUpgrades", e.target.value)} placeholder="אלבום דיגיטלי, כריכת בוק, וכו׳" />
                <p className="mt-1 text-[11px] text-muted-foreground">שדרוגים כלליים לעיון: כריכת זכוכית +₪150 · סט נוסף +₪350 · תמונה נוספת לעיבוד +₪40</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Checkbox checked={form.sendEmail} onCheckedChange={(v) => set("sendEmail", !!v)} />
            <Label className="cursor-pointer text-xs font-normal text-muted-foreground" onClick={() => set("sendEmail", !form.sendEmail)}>
              לשלוח מייל ללקוחה שנפתח לה חשבון (רק אם באמת נפתח חשבון חדש — סיסמה זמנית: 1234)
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={submit} disabled={busy} className="rounded-full">
            {busy ? "יוצר..." : "יצירה והמשך להעלאת תמונות"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { heError } from "@/lib/he-errors";
import { REMINDER_HOUR_OPTIONS, ymd, type CmSettings } from "@/lib/client-management";
import { sendCmScheduleNow } from "@/lib/client-management.functions";
import { saveCmSettings, useCmInvalidate } from "./data";
import { Panel } from "./ui";

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <div className="text-sm text-newborn-ink">{label}</div>
        {hint && <div className="text-xs text-newborn-ink/50">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

/** Takes only the settings, so any page (client management, newborn packages) can show it. */
export function SettingsTab({ data }: { data: { settings: CmSettings } }) {
  const invalidate = useCmInvalidate();
  const sendSchedule = useServerFn(sendCmScheduleNow);
  const [s, setS] = useState<CmSettings>(data.settings);
  const [types, setTypes] = useState(data.settings.sessionTypes.join("\n"));
  const [slots, setSlots] = useState(data.settings.timeSlots.join("\n"));
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setS(data.settings);
    setTypes(data.settings.sessionTypes.join("\n"));
    setSlots(data.settings.timeSlots.join("\n"));
  }, [data.settings]);

  const set = (p: Partial<CmSettings>) => setS((x) => ({ ...x, ...p }));
  const lines = (t: string) =>
    t
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

  const save = async () => {
    setSaving(true);
    try {
      await saveCmSettings({ ...s, sessionTypes: lines(types), timeSlots: lines(slots) });
      toast.success("ההגדרות נשמרו");
      invalidate("settings");
    } catch (e) {
      toast.error(heError(e));
    } finally {
      setSaving(false);
    }
  };

  const sendTomorrow = async () => {
    setSending(true);
    try {
      const t = new Date();
      t.setDate(t.getDate() + 1);
      const r = await sendSchedule({ data: { date: ymd(t) } });
      toast.success(`לו״ז למחר נשלח (${r.count} צילומים)`);
    } catch (e) {
      toast.error(heError(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="🔔 תזכורות ללקוחות">
        <Row label="תזכורת אוטומטית לפני צילום" hint="נשלחת למייל של הלקוחה">
          <Switch
            checked={s.reminderEnabled}
            onCheckedChange={(v) => set({ reminderEnabled: v })}
          />
        </Row>
        <Row label="כמה זמן לפני?">
          <Select
            value={String(s.reminderHoursBefore)}
            onValueChange={(v) => set({ reminderHoursBefore: Number(v) })}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REMINDER_HOUR_OPTIONS.map((h) => (
                <SelectItem key={h} value={String(h)}>
                  {h} שעות לפני
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="לכלול הערות בתזכורת">
          <Switch
            checked={s.includeNotesInReminder}
            onCheckedChange={(v) => set({ includeNotesInReminder: v })}
          />
        </Row>
        <Row label="לא לשלוח מיילים בשבת ובחגים" hint="מה שהגיע זמנו יישלח במוצאי שבת/חג">
          <Switch
            checked={s.noShabbatEmails}
            onCheckedChange={(v) => set({ noShabbatEmails: v })}
          />
        </Row>
      </Panel>

      <Panel title="📅 לו״ז יומי למייל">
        <Row label="שליחה אוטומטית של צילומי מחר" hint="רק בימים שיש בהם צילומים">
          <Switch
            checked={s.dailyScheduleEnabled}
            onCheckedChange={(v) => set({ dailyScheduleEnabled: v })}
          />
        </Row>
        <Row label="באיזו שעה?">
          <Select
            value={String(s.dailyScheduleHour)}
            onValueChange={(v) => set({ dailyScheduleHour: Number(v) })}
          >
            <SelectTrigger className="w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[17, 18, 19, 20, 21, 22].map((h) => (
                <SelectItem key={h} value={String(h)}>
                  {h}:00
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <div className="py-2">
          <Label>מייל לקבלת הלו״ז</Label>
          <Input
            dir="ltr"
            value={s.scheduleEmail}
            onChange={(e) => set({ scheduleEmail: e.target.value })}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-2 rounded-full"
          onClick={sendTomorrow}
          disabled={sending}
        >
          <Send className="h-4 w-4" /> שלחי עכשיו לו״ז למחר
        </Button>
      </Panel>

      <Panel title="✉️ נוסחי מיילים ללקוחות" className="lg:col-span-2">
        <p className="mb-3 text-xs text-newborn-ink/55">
          אפשר לכתוב בחופשיות. המילים בסוגריים מתמלאות לבד: {"{שם}"} שם הלקוחה · {"{קישור}"} קישור לגלריה · {"{תאריך}"} ו-{"{שעה}"} של הצילום.
        </p>
        <div className="grid gap-3 lg:grid-cols-3">
          <div>
            <Label>שליחת הגלריה לבחירה</Label>
            <Textarea rows={6} value={s.galleryEmailText} onChange={(e) => set({ galleryEmailText: e.target.value })} />
          </div>
          <div>
            <Label>תזכורת לפני צילום</Label>
            <Textarea rows={6} value={s.reminderEmailText} onChange={(e) => set({ reminderEmailText: e.target.value })} />
          </div>
          <div>
            <Label>תזכורת למי שלא פתחה את הגלריה (אחרי 3 ימים)</Label>
            <Textarea rows={6} value={s.galleryNudgeText} onChange={(e) => set({ galleryNudgeText: e.target.value })} />
          </div>
        </div>
      </Panel>

      <Panel title="🏦 תשלומי לקוחות">
        <Row label="מייל אוטומטי בפתיחת חשבון">
          <Switch
            checked={s.paymentEmailOnOpen}
            onCheckedChange={(v) => set({ paymentEmailOnOpen: v })}
          />
        </Row>
        <Row label="מייל אוטומטי ברישום תשלום">
          <Switch
            checked={s.paymentEmailOnUpdate}
            onCheckedChange={(v) => set({ paymentEmailOnUpdate: v })}
          />
        </Row>
        <div className="space-y-3 py-2">
          <div>
            <Label>מייל לעותק אלייך</Label>
            <Input
              dir="ltr"
              value={s.paymentCopyEmail}
              onChange={(e) => set({ paymentCopyEmail: e.target.value })}
            />
          </div>
          <div>
            <Label>פרטי בנק (יופיעו במייל)</Label>
            <Textarea
              rows={3}
              value={s.bankDetails}
              onChange={(e) => set({ bankDetails: e.target.value })}
              placeholder={"בנק · סניף · חשבון\nעל שם מיכל סיבוני"}
            />
          </div>
          <div>
            <Label>קישורי תשלום (ביט / פייבוקס)</Label>
            <Textarea
              rows={2}
              value={s.paymentLinks}
              onChange={(e) => set({ paymentLinks: e.target.value })}
              placeholder="ביט: 054-8529277"
            />
          </div>
        </div>
      </Panel>

      <Panel
        title={
          <span className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" /> יומן צילומים
          </span>
        }
      >
        <div className="space-y-3">
          <div>
            <Label>סוגי צילום (שורה לכל סוג)</Label>
            <Textarea rows={6} value={types} onChange={(e) => setTypes(e.target.value)} />
          </div>
          <div>
            <Label>זמנים / מיקומים (שורה לכל אחד)</Label>
            <Textarea rows={4} value={slots} onChange={(e) => setSlots(e.target.value)} />
          </div>
        </div>
      </Panel>

      <div className="lg:col-span-2">
        <Button
          onClick={save}
          disabled={saving}
          className="w-full rounded-full bg-newborn-rose text-white hover:bg-newborn-rose/90 sm:w-auto sm:px-10"
        >
          {saving ? "שומרת…" : "שמירת הגדרות"}
        </Button>
        <p className="mt-2 text-xs text-newborn-ink/50">
          המיילים יוצאים מחשבון ה-Gmail של הסטודיו שכבר מחובר לאתר.
        </p>
      </div>
    </div>
  );
}

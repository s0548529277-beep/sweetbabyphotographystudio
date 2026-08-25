import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wand2, Loader2, Upload, Trash2, Eye, EyeOff, UserPlus } from "lucide-react";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
import { heError } from "@/lib/he-errors";

export const Route = createFileRoute("/_authenticated/admin/retouch-presets")({
  component: AdminRetouchPresetsPage,
});

// retouch_presets is a new table — cast until the generated Database type
// (types.ts) picks it up on next generation.
const supabase = supabaseTyped as any;

type Preset = {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  before_url: string;
  after_url: string;
  before_path: string;
  after_path: string;
  is_active: boolean;
  sort_order: number;
};

async function uploadToStorage(file: File) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `retouch-presets/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("items").upload(path, file, { upsert: false });
  if (error) throw error;
  const { data, error: signErr } = await supabase.storage
    .from("items")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (signErr || !data?.signedUrl) throw signErr ?? new Error("שגיאה ביצירת קישור לתמונה");
  return { url: data.signedUrl, path };
}

async function fetchPresets(): Promise<Preset[]> {
  const { data, error } = await supabase.from("retouch_presets").select("*").order("sort_order");
  if (error) throw error;
  return (data ?? []) as Preset[];
}

async function fetchAllowedClients(): Promise<{ email: string; created_at: string }[]> {
  const { data, error } = await supabase
    .from("retouch_allowed_clients")
    .select("email, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

const EMPTY_FORM = { name: "", description: "", prompt: "" };

function AdminRetouchPresetsPage() {
  const qc = useQueryClient();
  const rows = useQuery({ queryKey: ["retouch-presets-admin"], queryFn: fetchPresets });
  const refresh = () => qc.invalidateQueries({ queryKey: ["retouch-presets-admin"] });

  const allowedClients = useQuery({
    queryKey: ["retouch-allowed-clients"],
    queryFn: fetchAllowedClients,
  });
  const refreshAllowed = () => qc.invalidateQueries({ queryKey: ["retouch-allowed-clients"] });
  const [newEmail, setNewEmail] = useState("");
  const [grantBusy, setGrantBusy] = useState(false);

  const grantAccess = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return toast.error("יש להזין כתובת אימייל תקינה");
    setGrantBusy(true);
    try {
      const { error } = await supabase.from("retouch_allowed_clients").insert({ email });
      if (error) throw error;
      toast.success(`הוגדרה גישה עבור ${email}`);
      setNewEmail("");
      refreshAllowed();
    } catch (e) {
      toast.error(heError(e, "הפעולה נכשלה — ייתכן שכבר הוגדרה גישה לאימייל הזה"));
    } finally {
      setGrantBusy(false);
    }
  };

  const revokeAccess = async (email: string) => {
    const { error } = await supabase.from("retouch_allowed_clients").delete().eq("email", email);
    if (error) return toast.error(heError(error));
    refreshAllowed();
  };

  const [form, setForm] = useState(EMPTY_FORM);
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const beforeRef = useRef<HTMLInputElement>(null);
  const afterRef = useRef<HTMLInputElement>(null);

  const create = async () => {
    if (!form.name.trim()) return toast.error("יש להזין שם לסגנון");
    if (!form.prompt.trim()) return toast.error("יש להזין הנחיה לעריכה — זו ההוראה שנשלחת ל-AI");
    if (!beforeFile || !afterFile) return toast.error("יש להעלות גם תמונת לפני וגם תמונת אחרי");

    setBusy(true);
    try {
      const [before, after] = await Promise.all([
        uploadToStorage(beforeFile),
        uploadToStorage(afterFile),
      ]);
      const { error } = await supabase.from("retouch_presets").insert({
        name: form.name.trim(),
        description: form.description.trim() || null,
        prompt: form.prompt.trim(),
        before_path: before.path,
        after_path: after.path,
        before_url: before.url,
        after_url: after.url,
        sort_order: (rows.data?.length ?? 0) + 1,
      });
      if (error) throw error;
      toast.success("הסגנון נוסף");
      setForm(EMPTY_FORM);
      setBeforeFile(null);
      setAfterFile(null);
      if (beforeRef.current) beforeRef.current.value = "";
      if (afterRef.current) afterRef.current.value = "";
      refresh();
    } catch (e) {
      toast.error(heError(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (p: Preset) => {
    const { error } = await supabase
      .from("retouch_presets")
      .update({ is_active: !p.is_active })
      .eq("id", p.id);
    if (error) return toast.error(heError(error));
    refresh();
  };

  const remove = async (p: Preset) => {
    if (!confirm(`למחוק את הסגנון "${p.name}"?`)) return;
    const { error } = await supabase.from("retouch_presets").delete().eq("id", p.id);
    if (error) return toast.error(heError(error));
    await supabase.storage.from("items").remove([p.before_path, p.after_path]);
    toast.success("הוסר");
    refresh();
  };

  return (
    <div dir="rtl" className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-primary flex items-center gap-2">
          <Wand2 className="h-5 w-5" /> עיבוד תמונות AI — ניהול סגנונות
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          כל סגנון מוגדר על ידי זוג תמונות לפני/אחרי לדוגמה + הנחיה טקסטואלית. בעמוד הציבורי{" "}
          <code>/photo-retouch</code> לקוחות בוחרים סגנון, מעלים תמונה משלהם, ומקבלים תוצאה שנוצרת
          אוטומטית באמצעות בינה מלאכותית — לא עריכה מדויקת פיקסל-לפיקסל, אלא חיקוי של סוג ועוצמת
          העריכה שהודגמה.
        </p>
      </div>

      {/* who has access */}
      <section className="rounded-3xl border border-primary/10 bg-card p-5 space-y-4">
        <div>
          <h3 className="font-display text-lg text-primary flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> לקוחות מורשות
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            העמוד <code>/photo-retouch</code> סגור ללקוחות נבחרים בלבד. הוסיפו כאן את האימייל של כל
            לקוחה שרוצים לתת לה גישה — גם אם עדיין אין לה חשבון באתר (למשל אם קבעתם לה צילומים
            בטלפון). ברגע שהיא תתחבר עם האימייל הזה, הגישה תיפתח לה אוטומטית. אפשר גם להפעיל/לכבות
            גישה מתוך כרטיס לקוחה בעמוד "ניהול לקוחות".
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && grantAccess()}
            placeholder="אימייל הלקוחה"
            dir="ltr"
            className="h-10 flex-1 min-w-[220px] rounded-xl border border-primary/15 bg-background px-3 text-sm"
          />
          <button
            disabled={grantBusy}
            onClick={grantAccess}
            className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 h-10 text-sm disabled:opacity-60"
          >
            {grantBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            הוספה
          </button>
        </div>
        {allowedClients.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> טוען...
          </div>
        ) : (allowedClients.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">אין עדיין לקוחות מורשות.</p>
        ) : (
          <ul className="space-y-1.5">
            {(allowedClients.data ?? []).map((row) => (
              <li
                key={row.email}
                className="flex items-center justify-between gap-3 rounded-xl bg-background px-3 py-2 text-sm"
              >
                <span dir="ltr">{row.email}</span>
                <button
                  onClick={() => revokeAccess(row.email)}
                  className="h-7 w-7 rounded-full flex items-center justify-center hover:bg-destructive/10 hover:text-destructive shrink-0"
                  title="הסרת גישה"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* create form */}
      <section className="rounded-3xl border border-primary/10 bg-card p-5 space-y-4">
        <h3 className="font-display text-lg text-primary">סגנון חדש</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="שם הסגנון (למשל: ריטוש פנים עדין)"
            className="h-10 rounded-xl border border-primary/15 bg-background px-3 text-sm"
          />
          <input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="תיאור קצר ללקוחות (אופציונלי)"
            className="h-10 rounded-xl border border-primary/15 bg-background px-3 text-sm"
          />
        </div>
        <textarea
          value={form.prompt}
          onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
          placeholder='ההנחיה שתישלח ל-AI, למשל: "רזייה עדינה של קו המותניים, בלי לשנות פרופורציות פנים או תווי פנים"'
          rows={3}
          className="w-full rounded-xl border border-primary/15 bg-background px-3 py-2 text-sm"
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">תמונת לפני</span>
            <input
              ref={beforeRef}
              type="file"
              accept="image/*"
              onChange={(e) => setBeforeFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">תמונת אחרי</span>
            <input
              ref={afterRef}
              type="file"
              accept="image/*"
              onChange={(e) => setAfterFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </label>
        </div>
        <button
          disabled={busy}
          onClick={create}
          className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 h-10 text-sm disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          הוספת סגנון
        </button>
      </section>

      {/* list */}
      <section className="space-y-3">
        {rows.isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> טוען...
          </div>
        )}
        {(rows.data ?? []).map((p) => (
          <div
            key={p.id}
            className="rounded-2xl border border-primary/10 bg-card p-4 flex flex-wrap items-center gap-4"
          >
            <div className="flex gap-2">
              <img
                src={p.before_url}
                alt="לפני"
                className="h-16 w-16 rounded-lg object-cover border border-primary/10"
              />
              <img
                src={p.after_url}
                alt="אחרי"
                className="h-16 w-16 rounded-lg object-cover border border-primary/10"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="font-display text-primary flex items-center gap-2">
                {p.name}
                {!p.is_active && (
                  <span className="text-[10px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                    כבוי
                  </span>
                )}
              </div>
              {p.description && (
                <div className="text-xs text-muted-foreground mt-0.5">{p.description}</div>
              )}
              <div className="text-xs text-muted-foreground/80 mt-1 line-clamp-2">{p.prompt}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleActive(p)}
                className="h-9 w-9 rounded-full border border-primary/15 flex items-center justify-center hover:bg-muted"
                title={p.is_active ? "השבתה" : "הפעלה"}
              >
                {p.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
              <button
                onClick={() => remove(p)}
                className="h-9 w-9 rounded-full border border-primary/15 flex items-center justify-center hover:bg-destructive/10 hover:text-destructive"
                title="מחיקה"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {rows.data && rows.data.length === 0 && (
          <p className="text-sm text-muted-foreground">אין עדיין סגנונות — הוסיפו אחד למעלה.</p>
        )}
      </section>
    </div>
  );
}

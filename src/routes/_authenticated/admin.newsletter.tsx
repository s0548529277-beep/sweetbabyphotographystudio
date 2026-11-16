import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Download, UserPlus, ClipboardPaste, Send, Users, UserMinus } from "lucide-react";
import { toCSV, downloadCSV } from "@/lib/csv";
import { toast } from "sonner";
import { importSiteEmailsToNewsletter, importPastedLeadsToNewsletter } from "@/lib/newsletter.functions";
import { useAuth } from "@/lib/auth";
import { renderNewsletterHtml, type NewsletterDraft } from "@/lib/newsletter-template";
import {
  getNewsletterDraft,
  saveNewsletterDraft,
  sendNewsletterBatch,
  sendNewsletterTest,
  setSubscriberStatus,
  startNewsletterCampaign,
} from "@/lib/newsletter-list.functions";

export const Route = createFileRoute("/_authenticated/admin/newsletter")({
  component: NewsletterPage,
});

function NewsletterPage() {
  const [tab, setTab] = useState<"send" | "list">("send");
  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {(
          [
            ["send", "שליחת ניוזלטר", Send],
            ["list", "הנרשמים", Users],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`inline-flex items-center gap-2 px-5 h-10 rounded-full text-sm border ${tab === k ? "bg-primary text-primary-foreground border-primary" : "bg-card border-primary/10 hover:bg-cream"}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
      {tab === "send" ? <SendTab /> : <NewsletterAdmin />}
    </div>
  );
}

type Signup = { id: string; email: string; source: string | null; created_at: string; status?: string | null };

function NewsletterAdmin() {
  const qc = useQueryClient();
  const importFn = useServerFn(importSiteEmailsToNewsletter);
  const importPastedFn = useServerFn(importPastedLeadsToNewsletter);
  const [importing, setImporting] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [pastedSource, setPastedSource] = useState("");
  const [importingPasted, setImportingPasted] = useState(false);

  const signups = useQuery({
    queryKey: ["admin-newsletter-signups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newsletter_signups")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Signup[];
    },
  });

  const setStatusFn = useServerFn(setSubscriberStatus);
  const toggleStatus = async (id: string, action: "subscribe" | "unsubscribe") => {
    try {
      await setStatusFn({ data: { id, action } });
      qc.invalidateQueries({ queryKey: ["admin-newsletter-signups"] });
    } catch (e: any) {
      toast.error(e?.message ?? "הפעולה נכשלה");
    }
  };

  const exportCsv = () => {
    const rows = (signups.data ?? []).map((s) => ({
      email: s.email,
      source: s.source ?? "",
      status: s.status === "unsubscribed" ? "הוסרה" : "פעילה",
      created_at: new Date(s.created_at).toLocaleString("he-IL"),
    }));
    const csv = toCSV(rows, [
      { key: "email", label: "אימייל" },
      { key: "source", label: "מקור" },
      { key: "status", label: "סטטוס" },
      { key: "created_at", label: "תאריך הרשמה" },
    ]);
    downloadCSV(`newsletter-signups-${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" })}.csv`, csv);
  };

  const importSiteEmails = async () => {
    setImporting(true);
    try {
      const { scanned, added } = await importFn();
      toast.success(`נסרקו ${scanned} כתובות מהאתר — נוספו ${added} חדשות לרשימה`);
      qc.invalidateQueries({ queryKey: ["admin-newsletter-signups"] });
    } catch (e: any) {
      toast.error(e?.message ?? "הייבוא נכשל");
    } finally {
      setImporting(false);
    }
  };

  const importPasted = async () => {
    if (!pastedText.trim()) return toast.error("הדביקי קודם רשימה");
    setImportingPasted(true);
    try {
      const { scanned, added } = await importPastedFn({ data: { text: pastedText, source: pastedSource } });
      toast.success(`נמצאו ${scanned} כתובות ברשימה שהדבקת — נוספו ${added} חדשות`);
      setPastedText("");
      qc.invalidateQueries({ queryKey: ["admin-newsletter-signups"] });
    } catch (e: any) {
      toast.error(e?.message ?? "הייבוא נכשל");
    } finally {
      setImportingPasted(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-display text-2xl text-primary flex items-center gap-2">
          <Mail className="h-5 w-5" /> ניוזלטר
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="rounded-full gap-2" onClick={importSiteEmails} disabled={importing}>
            <UserPlus className="h-4 w-4" /> {importing ? "מייבאת…" : "איסוף כל המיילים מהאתר"}
          </Button>
          <Button variant="outline" className="rounded-full gap-2" onClick={exportCsv} disabled={!signups.data?.length}>
            <Download className="h-4 w-4" /> ייצוא CSV
          </Button>
        </div>
      </div>

      <p className="text-sm text-forest/70">
        רשימת הנרשמים לטופס "קבלי הנחה" בתחתית האתר — סה"כ {signups.data?.length ?? 0} נרשמים.
        הקופון שמוצג בטופס נקבע ב-<a href="/admin/coupons" className="underline hover:text-primary">קופונים</a> (עמודת "ניוזלטר").
        "איסוף כל המיילים מהאתר" סורקת חשבונות רשומים, טפסי יצירת קשר, בקשות הצטרפות למועדון, רשימת המתנה, ולקוחות ניו-בורן/צילומי חוץ — ומוסיפה לכאן כל כתובת שעוד לא ברשימה.
      </p>

      <div className="bg-card rounded-2xl border border-primary/5 p-4 space-y-2">
        <h3 className="font-medium text-forest flex items-center gap-2">
          <ClipboardPaste className="h-4 w-4" /> ייבוא רשימה מודבקת
        </h3>
        <p className="text-xs text-forest/60">
          מדביקים כאן כל טקסט שמכיל כתובות מייל (שורה לכל איש קשר, כל פורמט) — כל כתובת מייל שנמצאת בטקסט ועוד לא ברשימה תתווסף.
        </p>
        <Textarea
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          placeholder="שם, טלפון, מייל, סיבת פנייה..."
          className="min-h-32 font-mono text-xs"
          dir="ltr"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={pastedSource}
            onChange={(e) => setPastedSource(e.target.value)}
            placeholder="תיוג מקור (אופציונלי, למשל: אתר קודם)"
            className="flex-1 min-w-48 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <Button onClick={importPasted} disabled={importingPasted} className="rounded-full gap-2">
            <UserPlus className="h-4 w-4" /> {importingPasted ? "מייבאת…" : "ייבוא מהטקסט שהודבק"}
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-primary/5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cream/60 text-right">
            <tr>
              <th className="p-3 font-medium">אימייל</th>
              <th className="p-3 font-medium">מקור</th>
              <th className="p-3 font-medium">תאריך</th>
              <th className="p-3 font-medium">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {(signups.data ?? []).map((s) => (
              <tr key={s.id} className="border-t border-primary/5">
                <td className="p-3" dir="ltr">{s.email}</td>
                <td className="p-3 text-forest/70">{s.source ?? "—"}</td>
                <td className="p-3 text-forest/70">{new Date(s.created_at).toLocaleString("he-IL")}</td>
                <td className="p-3">
                  {s.status === "unsubscribed" ? (
                    <button className="text-xs underline text-forest/60" onClick={() => toggleStatus(s.id, "subscribe")}>הוסרה — להחזיר</button>
                  ) : (
                    <button className="inline-flex items-center gap-1 text-xs text-forest/70 hover:text-primary" onClick={() => toggleStatus(s.id, "unsubscribe")}>
                      <UserMinus className="h-3.5 w-3.5" /> פעילה
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {signups.data?.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-forest/60">
                  אין עדיין נרשמים
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const FIELDS: { key: keyof NewsletterDraft; label: string; multiline?: boolean; ltr?: boolean }[] = [
  { key: "subject", label: "נושא המייל" },
  { key: "headline", label: "כותרת" },
  { key: "intro", label: "משפט פתיחה" },
  { key: "body", label: "תוכן (שורה חדשה = פסקה חדשה)", multiline: true },
  { key: "imageUrl", label: "קישור לתמונה (אפשר להשאיר ריק)", ltr: true },
  { key: "buttonText", label: "טקסט הכפתור" },
  { key: "buttonUrl", label: "קישור הכפתור", ltr: true },
];

const FIELD_CLASS = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function SendTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const load = useServerFn(getNewsletterDraft);
  const save = useServerFn(saveNewsletterDraft);
  const test = useServerFn(sendNewsletterTest);
  const start = useServerFn(startNewsletterCampaign);
  const batch = useServerFn(sendNewsletterBatch);
  const [draft, setDraft] = useState<NewsletterDraft | null>(null);
  const [testTo, setTestTo] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["studio-newsletter-draft"],
    queryFn: async () => {
      const r = await load();
      setDraft(r.draft);
      return r;
    },
  });
  const d = draft ?? q.data?.draft;
  const to = testTo || user?.email || "";
  const html = useMemo(() => (d ? renderNewsletterHtml(d, "#") : ""), [d]);

  if (!d) return <p className="text-sm text-forest/60">טוען…</p>;
  const set = (k: keyof NewsletterDraft, v: string) => setDraft({ ...d, [k]: v });

  const run = async (fn: () => Promise<void>, fail: string) => {
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      toast.error(e?.message ?? fail);
    } finally {
      setBusy(false);
    }
  };

  const onSave = () => run(async () => { await save({ data: d }); toast.success("הטיוטה נשמרה"); }, "השמירה נכשלה");
  const onTest = () => run(async () => { await test({ data: { draft: d, to } }); toast.success(`מייל בדיקה נשלח אל ${to}`); }, "שליחת הבדיקה נכשלה");
  const onSend = () =>
    run(async () => {
      await save({ data: d });
      const { campaignId, total } = await start({ data: d });
      if (!confirm(`לשלוח את הניוזלטר ל-${total} נרשמים?`)) {
        toast.info("השליחה בוטלה");
        return;
      }
      let offset = 0;
      let sent = 0;
      let failed = 0;
      setProgress({ done: 0, total });
      for (;;) {
        const r = await batch({ data: { campaignId, offset } });
        sent += r.sent;
        failed += r.failed;
        offset = r.nextOffset;
        setProgress({ done: Math.min(offset, total), total });
        if (r.done) break;
      }
      setProgress(null);
      toast[failed ? "warning" : "success"](`נשלח ל-${sent} נרשמים${failed ? ` · ${failed} נכשלו` : ""}`);
      qc.invalidateQueries({ queryKey: ["studio-newsletter-draft"] });
    }, "השליחה נכשלה");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <p className="text-sm text-forest/70">
          התבנית מוכנה בעיצוב מיילי הסטודיו (מסגרת, לוגו וחתימה). מעדכנים את הטקסט, שולחים בדיקה לעצמך, ואז שולחים לכל הנרשמים הפעילים ({q.data?.activeCount ?? 0}).
          בתחתית כל מייל יש קישור להסרה מהרשימה.
        </p>
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-sm">{f.label}</span>
            {f.multiline ? (
              <textarea className={FIELD_CLASS} rows={7} value={d[f.key]} onChange={(e) => set(f.key, e.target.value)} />
            ) : (
              <input className={FIELD_CLASS} dir={f.ltr ? "ltr" : undefined} value={d[f.key]} onChange={(e) => set(f.key, e.target.value)} />
            )}
          </label>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-full" disabled={busy} onClick={onSave}>שמירת טיוטה</Button>
        </div>
        <div className="border border-primary/10 bg-card rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <input className={`${FIELD_CLASS} max-w-xs`} dir="ltr" value={to} onChange={(e) => setTestTo(e.target.value)} placeholder="מייל לבדיקה" />
            <Button variant="outline" className="rounded-full" disabled={busy || !to} onClick={onTest}>שליחת מייל בדיקה</Button>
          </div>
          <Button className="rounded-full gap-2" disabled={busy} onClick={onSend}><Send className="h-4 w-4" /> שליחה לכל הנרשמים</Button>
          {progress && <p className="text-sm">שולח… {progress.done}/{progress.total} (נא לא לסגור את העמוד)</p>}
          <p className="text-xs text-forest/60">השליחה יוצאת מתיבת ה-Gmail של הסטודיו. ל-Gmail יש מגבלת שליחה יומית (כ-500 מיילים בחשבון רגיל), ולכן רשימה גדולה מאוד כדאי לפצל לכמה ימים.</p>
        </div>
        {(q.data?.campaigns?.length ?? 0) > 0 && (
          <div className="text-sm space-y-1">
            <h3 className="text-primary">שליחות אחרונות</h3>
            {q.data!.campaigns.map((c) => (
              <div key={c.id} className="flex justify-between border-b border-primary/5 py-1">
                <span>{c.subject}</span>
                <span className="text-forest/60">{new Date(c.created_at).toLocaleDateString("he-IL")} · {c.sent_count}/{c.total}{c.failed_count ? ` (${c.failed_count} נכשלו)` : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <h3 className="mb-2 text-sm text-forest/60">תצוגה מקדימה</h3>
        <iframe title="תצוגה מקדימה של הניוזלטר" srcDoc={html} className="h-[720px] w-full border border-primary/10 bg-white" />
      </div>
    </div>
  );
}

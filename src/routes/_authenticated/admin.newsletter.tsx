import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Mail, Download } from "lucide-react";
import { toCSV, downloadCSV } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/admin/newsletter")({
  component: NewsletterAdmin,
});

type Signup = { id: string; email: string; source: string | null; created_at: string };

function NewsletterAdmin() {
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

  const exportCsv = () => {
    const rows = (signups.data ?? []).map((s) => ({
      email: s.email,
      source: s.source ?? "",
      created_at: new Date(s.created_at).toLocaleString("he-IL"),
    }));
    const csv = toCSV(rows, [
      { key: "email", label: "אימייל" },
      { key: "source", label: "מקור" },
      { key: "created_at", label: "תאריך הרשמה" },
    ]);
    downloadCSV(`newsletter-signups-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-display text-2xl text-primary flex items-center gap-2">
          <Mail className="h-5 w-5" /> ניוזלטר
        </h2>
        <Button variant="outline" className="rounded-full gap-2" onClick={exportCsv} disabled={!signups.data?.length}>
          <Download className="h-4 w-4" /> ייצוא CSV
        </Button>
      </div>

      <p className="text-sm text-forest/70">
        רשימת הנרשמים לטופס "קבלי הנחה" בתחתית האתר — סה"כ {signups.data?.length ?? 0} נרשמים.
        הקופון שמוצג בטופס נקבע ב-<a href="/admin/coupons" className="underline hover:text-primary">קופונים</a> (עמודת "ניוזלטר").
      </p>

      <div className="bg-card rounded-2xl border border-primary/5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cream/60 text-right">
            <tr>
              <th className="p-3 font-medium">אימייל</th>
              <th className="p-3 font-medium">מקור</th>
              <th className="p-3 font-medium">תאריך</th>
            </tr>
          </thead>
          <tbody>
            {(signups.data ?? []).map((s) => (
              <tr key={s.id} className="border-t border-primary/5">
                <td className="p-3" dir="ltr">{s.email}</td>
                <td className="p-3 text-forest/70">{s.source ?? "—"}</td>
                <td className="p-3 text-forest/70">{new Date(s.created_at).toLocaleString("he-IL")}</td>
              </tr>
            ))}
            {signups.data?.length === 0 && (
              <tr>
                <td colSpan={3} className="p-6 text-center text-forest/60">
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

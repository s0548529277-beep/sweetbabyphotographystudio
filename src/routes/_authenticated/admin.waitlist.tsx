import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BellRing } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/waitlist")({
  component: WaitlistAdmin,
});

type Entry = {
  id: string;
  session_date: string;
  full_name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  notified_at: string | null;
  created_at: string;
};

function WaitlistAdmin() {
  const entries = useQuery({
    queryKey: ["admin-waitlist-entries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waitlist_entries" as never)
        .select("*")
        .order("notified_at", { ascending: true, nullsFirst: true })
        .order("session_date", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Entry[];
    },
  });

  const pending = (entries.data ?? []).filter((e) => !e.notified_at);
  const notified = (entries.data ?? []).filter((e) => e.notified_at);

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl text-primary flex items-center gap-2">
        <BellRing className="h-5 w-5" /> רשימת המתנה
      </h2>
      <p className="text-sm text-forest/70">
        מי שביקשה שנודיע לה כשתאריך תפוס בסטודיו יתפנה — ההודעה נשלחת אוטומטית במייל ברגע שהזמנה בתאריך הזה מתבטלת.
      </p>

      <div className="bg-card rounded-2xl border border-primary/5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cream/60 text-right">
            <tr>
              <th className="p-3 font-medium">תאריך מבוקש</th>
              <th className="p-3 font-medium">שם</th>
              <th className="p-3 font-medium">טלפון</th>
              <th className="p-3 font-medium">אימייל</th>
              <th className="p-3 font-medium">נרשמה</th>
              <th className="p-3 font-medium">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((e) => (
              <tr key={e.id} className="border-t border-primary/5">
                <td className="p-3 font-medium text-primary">{new Date(`${e.session_date}T00:00:00`).toLocaleDateString("he-IL")}</td>
                <td className="p-3">{e.full_name}</td>
                <td className="p-3" dir="ltr">{e.phone}</td>
                <td className="p-3" dir="ltr">{e.email ?? "—"}</td>
                <td className="p-3 text-forest/70">{new Date(e.created_at).toLocaleDateString("he-IL")}</td>
                <td className="p-3"><span className="text-xs rounded-full bg-peach/40 px-2 py-1">ממתינה</span></td>
              </tr>
            ))}
            {notified.map((e) => (
              <tr key={e.id} className="border-t border-primary/5 opacity-50">
                <td className="p-3">{new Date(`${e.session_date}T00:00:00`).toLocaleDateString("he-IL")}</td>
                <td className="p-3">{e.full_name}</td>
                <td className="p-3" dir="ltr">{e.phone}</td>
                <td className="p-3" dir="ltr">{e.email ?? "—"}</td>
                <td className="p-3 text-forest/70">{new Date(e.created_at).toLocaleDateString("he-IL")}</td>
                <td className="p-3"><span className="text-xs rounded-full bg-cream px-2 py-1">נשלחה הודעה</span></td>
              </tr>
            ))}
            {(entries.data?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-forest/60">אין עדיין רשומות</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

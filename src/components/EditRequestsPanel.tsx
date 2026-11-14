import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { heError } from "@/lib/he-errors";
import { listOrderEditRequests, reviewOrderEditRequest } from "@/lib/order-edit.functions";

/**
 * Customer edit requests that need the admin (owner request 2026-11-14: an edit less than 24h before the session
 * must be approved). Shown at the top of /admin/orders; approving applies the change (calendar event + door code
 * are re-issued by the server) and mails the customer the updated summary, rejecting mails her a short notice.
 */
export function EditRequestsPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listOrderEditRequests);
  const reviewFn = useServerFn(reviewOrderEditRequest);
  const q = useQuery({ queryKey: ["admin-order-edit-requests"], queryFn: () => listFn(), refetchInterval: 20000 });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [showDone, setShowDone] = useState(false);

  const pending = (q.data ?? []).filter((r) => r.status === "pending");
  const done = (q.data ?? []).filter((r) => r.status !== "pending").slice(0, 15);

  const review = async (id: string, approve: boolean) => {
    if (!approve && !confirm("לדחות את בקשת העריכה? תישלח ללקוחה הודעה.")) return;
    setBusyId(id);
    try {
      await reviewFn({ data: { id, approve, admin_note: notes[id] || undefined } });
      toast.success(approve ? "העריכה אושרה ובוצעה" : "הבקשה נדחתה");
      qc.invalidateQueries({ queryKey: ["admin-order-edit-requests"] });
      qc.invalidateQueries({ queryKey: ["admin-all-orders"] });
    } catch (e) {
      toast.error(heError(e, "הטיפול בבקשה נכשל"));
    } finally {
      setBusyId(null);
    }
  };

  if (!pending.length && !done.length) return null;

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50/70 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl text-primary">
          בקשות עריכה לאישורך {pending.length > 0 && <Badge className="mr-2 bg-amber-600">{pending.length}</Badge>}
        </h2>
        {done.length > 0 && (
          <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setShowDone((v) => !v)}>
            {showDone ? "הסתרת טופלו" : `טופלו לאחרונה (${done.length})`}
          </Button>
        )}
      </div>

      {pending.length === 0 && <p className="text-sm text-muted-foreground">אין בקשות ממתינות.</p>}

      {pending.map((r) => (
        <div key={r.id} className="bg-card rounded-xl border border-primary/10 p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">{r.kind === "booking" ? "שריון סטודיו" : "הזמנת אביזרים"}</Badge>
            <span className="font-medium">{r.original?.contact_name ?? "—"}</span>
            <bdi dir="ltr" className="text-muted-foreground">{r.original?.contact_phone ?? ""}</bdi>
            <span className="text-muted-foreground">#{r.target_id.slice(0, 8)}</span>
          </div>
          {r.reason && <div className="text-xs text-amber-800">נדרש אישור כי: {r.reason}</div>}
          <ul className="text-sm list-disc pr-5 space-y-0.5">
            {r.lines.map((l) => <li key={l}>{l}</li>)}
          </ul>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Input
              className="max-w-xs h-9"
              placeholder="הערה ללקוחה (רשות)"
              value={notes[r.id] ?? ""}
              onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
            />
            <Button size="sm" className="rounded-full" disabled={busyId === r.id} onClick={() => review(r.id, true)}>
              {busyId === r.id ? "מטפל…" : "אישור וביצוע"}
            </Button>
            <Button size="sm" variant="outline" className="rounded-full" disabled={busyId === r.id} onClick={() => review(r.id, false)}>
              דחייה
            </Button>
          </div>
        </div>
      ))}

      {showDone &&
        done.map((r) => (
          <div key={r.id} className="text-xs text-muted-foreground border-t border-primary/10 pt-2">
            {r.status === "approved" ? "✓ אושר" : "✗ נדחה"} · {r.original?.contact_name ?? "—"} · #{r.target_id.slice(0, 8)} · {r.lines.join(" | ")}
            {r.admin_note ? ` · ${r.admin_note}` : ""}
          </div>
        ))}
    </div>
  );
}

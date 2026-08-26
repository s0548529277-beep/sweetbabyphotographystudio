import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listPhotoClients, startPhotoWorkflowByEmail, STAGE_LABELS, type WorkflowStage } from "@/lib/photo-clients.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Camera, ChevronLeft, TriangleAlert, UserPlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/photo-clients")({
  component: PhotoClientsAdmin,
});

const STAGE_COLORS: Record<WorkflowStage, string> = {
  booked: "bg-muted text-muted-foreground",
  date_confirmed: "bg-blue-100 text-blue-800",
  proofs_ready: "bg-amber-100 text-amber-800",
  edited_uploaded: "bg-purple-100 text-purple-800",
  album_published: "bg-green-100 text-green-800",
};

type Row = {
  id: string; // photo_client_workflows.id
  booking_id: string | null;
  contact_name: string;
  contact_phone: string;
  session_date: string | null;
  stage: WorkflowStage;
};

/** "הוספת לקוחה לפי מייל" — starts a photo workflow by email alone, no site account required in advance (one gets minted for her if she doesn't have one, same trick as the guest-checkout flow). */
function AddByEmailDialog({ onCreated }: { onCreated: (workflowId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const startByEmail = useServerFn(startPhotoWorkflowByEmail);

  const submit = async () => {
    if (!email.trim()) return toast.error("צריך למלא אימייל");
    setBusy(true);
    try {
      const { workflowId, isNewAccount, tempPassword } = await startByEmail({
        data: { email: email.trim(), name: name.trim() || undefined, sendEmail },
      });
      setOpen(false);
      setEmail("");
      setName("");
      if (isNewAccount) {
        // Shown regardless of sendEmail — the admin needs the code even if
        // she plans to tell the client herself (WhatsApp, in person, ...).
        toast.success(`נפתח חשבון חדש. סיסמה זמנית: ${tempPassword}`, { duration: 15000 });
      }
      onCreated(workflowId);
    } catch (e: any) {
      toast.error(e?.message || "הוספת הלקוחה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => setOpen(true)}>
        <UserPlus className="h-3.5 w-3.5" /> הוספת לקוחה לפי מייל
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>הוספת לקוחה לפי מייל</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              אם כבר יש לה חשבון באתר עם המייל הזה — התהליך יתחבר אליו. אם אין — ייפתח לה חשבון חדש אוטומטית, כדי שתוכל בהמשך
              להיכנס עם "שכחתי סיסמה" ולראות את התמונות שלה ב"התמונות שלי".
            </p>
            <div>
              <Label className="text-xs text-muted-foreground">אימייל *</Label>
              <Input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">שם (רשות)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם הלקוחה" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={sendEmail} onCheckedChange={(v) => setSendEmail(!!v)} />
              <Label className="text-xs text-muted-foreground font-normal cursor-pointer" onClick={() => setSendEmail((v) => !v)}>
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
    </>
  );
}

function PhotoClientsAdmin() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchClients = useServerFn(listPhotoClients);
  const clients = useQuery({ queryKey: ["photo-clients"], queryFn: () => fetchClients({}) });
  const rows = (clients.data ?? []) as unknown as Row[];

  const onWorkflowCreated = (workflowId: string) => {
    qc.invalidateQueries({ queryKey: ["photo-clients"] });
    navigate({ to: "/admin/photo-clients/$bookingId", params: { bookingId: workflowId } });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-primary mb-1 flex items-center gap-2">
            <Camera className="h-5 w-5" /> לקוחות צילום
          </h2>
          <p className="text-sm text-muted-foreground">
            כל לקוחה שהזמינה צילומים עם מיכל, וכל לקוחה שהתחלת לה תהליך ידנית — מעקב אחר שלב מסירת התמונות שלה.
          </p>
        </div>
        <AddByEmailDialog onCreated={onWorkflowCreated} />
      </div>

      {/* A failed fetch used to render exactly like "no clients yet" — surfacing
          the real error here so a genuine bug (RLS, permissions, ...) doesn't
          look identical to an empty-but-fine list. */}
      {clients.isError && (
        <div className="bg-destructive/10 text-destructive rounded-2xl border border-destructive/20 p-4 flex items-start gap-2 text-sm">
          <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">טעינת רשימת הלקוחות נכשלה — זו הסיבה שהרשימה נראית ריקה</p>
            {/* Raw error text on purpose (not heError) — this is an admin
                diagnostic, not customer-facing copy, so the real message
                (RLS/permissions/etc.) matters more than Hebrew-only polish. */}
            <p className="mt-0.5" dir="ltr">
              {(clients.error as any)?.message ?? String(clients.error)}
            </p>
          </div>
        </div>
      )}

      <div className="bg-card rounded-2xl border border-primary/10 divide-y divide-primary/5">
        {rows.map((r) => (
          <Link
            key={r.id}
            to="/admin/photo-clients/$bookingId"
            params={{ bookingId: r.id }}
            className="flex items-center justify-between gap-3 p-4 hover:bg-cream/30 transition"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{r.contact_name}</p>
              <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">
                {r.contact_phone} {r.session_date ? `· ${r.session_date}` : "· ללא הזמנת צילום (נוצר ידנית)"}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STAGE_COLORS[r.stage]}`}>{STAGE_LABELS[r.stage]}</span>
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </div>
          </Link>
        ))}
        {!clients.isError && rows.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-10">
            אין עדיין לקוחות צילום. אפשר להוסיף לקוחה לפי מייל למעלה, או להתחיל תהליך ידנית מ"לקוחות".
          </p>
        )}
      </div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPhotoClients, STAGE_LABELS, type WorkflowStage } from "@/lib/photo-clients.functions";
import { Camera, ChevronLeft, TriangleAlert } from "lucide-react";

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

function PhotoClientsAdmin() {
  const fetchClients = useServerFn(listPhotoClients);
  const clients = useQuery({ queryKey: ["photo-clients"], queryFn: () => fetchClients({}) });
  const rows = (clients.data ?? []) as unknown as Row[];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="font-display text-xl text-primary mb-1 flex items-center gap-2">
          <Camera className="h-5 w-5" /> לקוחות צילום
        </h2>
        <p className="text-sm text-muted-foreground">
          כל לקוחה שהזמינה צילומים עם מיכל, וכל לקוחה שהתחלת לה תהליך ידנית — מעקב אחר שלב מסירת התמונות שלה.
        </p>
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
            אין עדיין לקוחות צילום. אפשר להתחיל תהליך תמונות ידנית מ"לקוחות" גם בלי הזמנת צילום.
          </p>
        )}
      </div>
    </div>
  );
}

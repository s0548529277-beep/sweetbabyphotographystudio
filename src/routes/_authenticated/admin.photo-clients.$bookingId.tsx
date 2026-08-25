import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  addPhotoClientImage,
  advancePhotoClientStage,
  deletePhotoClientImage,
  getPhotoClientDetail,
  STAGE_LABELS,
  WORKFLOW_STAGES,
  type WorkflowStage,
} from "@/lib/photo-clients.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowRight, Check, Loader2, Star, Trash2, Upload } from "lucide-react";

// Route param is still named "bookingId" (unchanged, so routeTree.gen.ts
// doesn't need regenerating) but it now carries a photo_client_workflows.id
// — a workflow may or may not be tied to an actual booking, see
// startManualPhotoWorkflow in photo-clients.functions.ts.
export const Route = createFileRoute("/_authenticated/admin/photo-clients/$bookingId")({
  component: PhotoClientDetail,
});

type ImageRow = { id: string; kind: "proof" | "edited"; image_url: string; selected: boolean };

async function uploadImage(workflowId: string, file: File): Promise<{ url: string; path: string }> {
  const ext = file.name.split(".").pop();
  const path = `photo-clients/${workflowId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("items").upload(path, file, { upsert: false });
  if (error) throw error;
  const { data, error: signErr } = await supabase.storage.from("items").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (signErr || !data?.signedUrl) throw signErr ?? new Error("שגיאה בהעלאה");
  return { url: data.signedUrl, path };
}

function UploadSection({
  title,
  hint,
  kind,
  workflowId,
  images,
  onChanged,
}: {
  title: string;
  hint: string;
  kind: "proof" | "edited";
  workflowId: string;
  images: ImageRow[];
  onChanged: () => void;
}) {
  const addImage = useServerFn(addPhotoClientImage);
  const removeImage = useServerFn(deletePhotoClientImage);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const { url, path } = await uploadImage(workflowId, file);
        await addImage({ data: { workflowId, kind, storagePath: path, imageUrl: url } });
      }
      toast.success("התמונות הועלו");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "העלאה נכשלה");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDelete = async (id: string) => {
    try {
      await removeImage({ data: { imageId: id } });
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "מחיקה נכשלה");
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-primary/10 p-5 space-y-3">
      <div>
        <h3 className="font-display text-lg text-primary">{title}</h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading} className="rounded-full">
        {uploading ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Upload className="h-4 w-4 ml-2" />}
        העלאת תמונות
      </Button>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />

      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-2">
          {images.map((img) => (
            <div key={img.id} className="relative group aspect-square">
              <img src={img.image_url} alt="" className="w-full h-full object-cover rounded-lg border border-primary/10" />
              {kind === "proof" && img.selected && (
                <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-1">
                  <Star className="h-3 w-3 fill-current" />
                </div>
              )}
              <button
                type="button"
                onClick={() => onDelete(img.id)}
                className="absolute bottom-1 left-1 bg-background/90 rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                aria-label="מחיקה"
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PhotoClientDetail() {
  const { bookingId: workflowId } = Route.useParams();
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getPhotoClientDetail);
  const advanceStage = useServerFn(advancePhotoClientStage);
  const detail = useQuery({ queryKey: ["photo-client", workflowId], queryFn: () => fetchDetail({ data: { workflowId } }) });

  const refetch = () => qc.invalidateQueries({ queryKey: ["photo-client", workflowId] });

  const setStage = async (stage: WorkflowStage) => {
    try {
      await advanceStage({ data: { workflowId, stage } });
      toast.success("השלב עודכן");
      refetch();
      qc.invalidateQueries({ queryKey: ["photo-clients"] });
    } catch (e: any) {
      toast.error(e?.message ?? "העדכון נכשל");
    }
  };

  if (detail.isError) {
    return <p className="text-sm text-destructive">{(detail.error as any)?.message ?? "טעינת הלקוחה נכשלה"}</p>;
  }
  if (!detail.data) return <p className="text-sm text-muted-foreground">טוען...</p>;

  const { booking, workflow, images } = detail.data as any;
  const stage = workflow.stage as WorkflowStage;
  const proofImages = (images as ImageRow[]).filter((i) => i.kind === "proof");
  const editedImages = (images as ImageRow[]).filter((i) => i.kind === "edited");
  const stageIndex = WORKFLOW_STAGES.indexOf(stage);
  const selectedCount = proofImages.filter((i) => i.selected).length;

  return (
    <div className="space-y-6 max-w-3xl">
      <Link to="/admin/photo-clients" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary">
        <ArrowRight className="h-4 w-4" /> חזרה לרשימת לקוחות צילום
      </Link>

      <div>
        <h2 className="font-display text-xl text-primary">{booking.contact_name}</h2>
        <p className="text-sm text-muted-foreground" dir="ltr">
          {booking.contact_phone} {booking.session_date ? `· ${booking.session_date}` : "· תהליך שנוצר ידנית (ללא הזמנת צילום)"}
        </p>
      </div>

      {/* Stage tracker */}
      <div className="bg-card rounded-2xl border border-primary/10 p-5">
        <div className="flex flex-wrap gap-2">
          {WORKFLOW_STAGES.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setStage(s)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                i === stageIndex
                  ? "bg-primary text-primary-foreground"
                  : i < stageIndex
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {i + 1}. {STAGE_LABELS[s]}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          לוחצים על שלב כדי לעדכן את הסטטוס (למשל: "יום צילומים נקבע" אחרי תיאום עם הלקוחה, "אלבום פורסם" כדי לחשוף את התמונות המעובדות ללקוחה).
        </p>
      </div>

      <UploadSection
        title="תמונות הוכחה (Proofs)"
        hint="הלקוחה תראה את אלה ותוכל לסמן מועדפות, ברגע שהשלב יעודכן ל'המתנה לבחירת לקוחה'."
        kind="proof"
        workflowId={workflowId}
        images={proofImages}
        onChanged={refetch}
      />

      {stage !== "booked" && stage !== "date_confirmed" && (
        <p className="text-sm text-muted-foreground -mt-3">
          {selectedCount > 0 ? (
            <>
              <Check className="inline h-3.5 w-3.5 ml-1 text-primary" />
              הלקוחה סימנה {selectedCount} תמונות מועדפות (מסומנות בכוכב).
            </>
          ) : (
            "הלקוחה עדיין לא סימנה בחירות."
          )}
        </p>
      )}

      <UploadSection
        title="תמונות מעובדות"
        hint='טיוטה — הלקוחה לא רואה את אלה עד שמעדכנים את השלב ל"אלבום פורסם".'
        kind="edited"
        workflowId={workflowId}
        images={editedImages}
        onChanged={refetch}
      />
    </div>
  );
}

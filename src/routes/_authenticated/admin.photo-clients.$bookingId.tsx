import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compress";
import {
  addPhotoClientImage,
  adminToggleProofSelection,
  advancePhotoClientStage,
  deletePhotoClientImage,
  getPhotoClientDetail,
  updatePhotoClientDetails,
  STAGE_LABELS,
  WORKFLOW_STAGES,
  PHOTO_PACKAGES,
  type WorkflowStage,
  type PhotoPackageKey,
} from "@/lib/photo-clients.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowRight, Check, ImagePlus, Loader2, Trash2 } from "lucide-react";

// Route param is still named "bookingId" (unchanged, so routeTree.gen.ts
// doesn't need regenerating) but it now carries a photo_client_workflows.id
// — a workflow may or may not be tied to an actual booking, see
// createPhotoClient in photo-clients.functions.ts.
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

/** A gallery-style dropzone + numbered thumbnail grid (modeled on ChikTime's galleries screen) — drag files in or click to browse, each photo gets a sequential 001/002/... badge instead of an unlabeled grid. */
function UploadSection({
  title,
  hint,
  kind,
  workflowId,
  images,
  onChanged,
  onToggleSelect,
}: {
  title: string;
  hint: string;
  kind: "proof" | "edited";
  workflowId: string;
  images: ImageRow[];
  onChanged: () => void;
  /** Only passed for the proofs section — lets the admin mark/unmark a favorite herself (the "✓"), e.g. when the client picked in person rather than through /my-photos. */
  onToggleSelect?: (imageId: string, selected: boolean) => void;
}) {
  const addImage = useServerFn(addPhotoClientImage);
  const removeImage = useServerFn(deletePhotoClientImage);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const compressed = await compressImage(file);
        const { url, path } = await uploadImage(workflowId, compressed);
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
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-lg text-primary">{title}</h3>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        {images.length > 0 && <span className="text-xs text-muted-foreground shrink-0">תמונות ({images.length})</span>}
      </div>

      {/* Drop zone — drag files in, or click to browse. Plain HTML5 DnD, no library. */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onFiles(e.dataTransfer.files);
        }}
        disabled={uploading}
        className={`w-full rounded-xl border-2 border-dashed p-5 flex items-center gap-3 text-right transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-primary/20 hover:border-primary/40"
        }`}
      >
        {uploading ? <Loader2 className="h-5 w-5 shrink-0 text-primary animate-spin" /> : <ImagePlus className="h-5 w-5 shrink-0 text-primary" />}
        <div className="min-w-0">
          <p className="text-sm font-medium">{uploading ? "מעלה..." : "לחצי או גררי תמונות לכאן"}</p>
          <p className="text-xs text-muted-foreground">JPG, PNG, HEIC</p>
        </div>
      </button>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />

      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-2">
          {images.map((img, i) => (
            <div key={img.id} className="relative group aspect-square">
              <img src={img.image_url} alt="" className="w-full h-full object-cover rounded-lg border border-primary/10" />
              <span className="absolute bottom-1 right-1 bg-background/85 text-foreground text-[10px] font-mono px-1.5 py-0.5 rounded">
                {String(i + 1).padStart(3, "0")}
              </span>
              {kind === "proof" && onToggleSelect && (
                <button
                  type="button"
                  onClick={() => onToggleSelect(img.id, !img.selected)}
                  className={`absolute top-1 right-1 rounded-full p-1 transition-colors ${
                    img.selected ? "bg-primary text-primary-foreground" : "bg-background/80 text-muted-foreground opacity-0 group-hover:opacity-100"
                  }`}
                  aria-label="סימון מועדפת"
                  title="סימון/ביטול כתמונה נבחרת"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
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

type PackageForm = {
  sessionDate: string;
  sessionTime: string;
  location: string;
  packageType: PhotoPackageKey | "";
  photosToEdit: string;
  albumUpgrades: string;
  totalPrice: string;
  amountPaid: string;
};

function toPackageForm(workflow: any): PackageForm {
  return {
    sessionDate: workflow.session_date ? String(workflow.session_date).slice(0, 10) : "",
    sessionTime: workflow.session_time ? String(workflow.session_time).slice(0, 5) : "",
    location: workflow.location ?? "",
    packageType: (workflow.package_type as PhotoPackageKey) ?? "",
    photosToEdit: workflow.photos_to_edit != null ? String(workflow.photos_to_edit) : "",
    albumUpgrades: workflow.album_upgrades ?? "",
    totalPrice: workflow.total_price != null ? String(workflow.total_price) : "",
    amountPaid: workflow.amount_paid != null ? String(workflow.amount_paid) : "0",
  };
}

/** Editable package/shoot-details panel — same fields as "לקוחה חדשה", for tweaking after the client card already exists. */
function PackageDetails({ workflow, workflowId, onSaved }: { workflow: any; workflowId: string; onSaved: () => void }) {
  const [form, setForm] = useState<PackageForm>(() => toPackageForm(workflow));
  const [busy, setBusy] = useState(false);
  const updateDetails = useServerFn(updatePhotoClientDetails);

  // Keep the form in sync if the workflow data refetches with different values.
  useEffect(() => setForm(toPackageForm(workflow)), [workflow]);

  const set = <K extends keyof PackageForm>(key: K, value: PackageForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const pickPackage = (key: PhotoPackageKey) => {
    const preset = PHOTO_PACKAGES[key];
    setForm((f) => ({
      ...f,
      packageType: key,
      photosToEdit: preset.photosToEdit != null ? String(preset.photosToEdit) : f.photosToEdit,
      albumUpgrades: preset.albumUpgrades || f.albumUpgrades,
    }));
  };

  const save = async () => {
    setBusy(true);
    try {
      await updateDetails({
        data: {
          workflowId,
          sessionDate: form.sessionDate || null,
          sessionTime: form.sessionTime || null,
          location: form.location.trim() || null,
          packageType: form.packageType || null,
          photosToEdit: form.photosToEdit.trim() ? Number(form.photosToEdit) : null,
          albumUpgrades: form.albumUpgrades.trim() || null,
          totalPrice: form.totalPrice.trim() ? Number(form.totalPrice) : null,
          amountPaid: form.amountPaid.trim() ? Number(form.amountPaid) : 0,
        },
      });
      toast.success("פרטי החבילה נשמרו");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "השמירה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-primary/10 p-5 space-y-3">
      <h3 className="font-display text-lg text-primary">פרטי חבילה וצילום</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">מועד צילומים</Label>
          <Input type="date" value={form.sessionDate} onChange={(e) => set("sessionDate", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">שעה</Label>
          <Input type="time" dir="ltr" value={form.sessionTime} onChange={(e) => set("sessionTime", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs text-muted-foreground">מיקום</Label>
          <Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="סטודיו / חוץ / כתובת" />
        </div>
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
        <div>
          <Label className="text-xs text-muted-foreground">כמות תמונות לעיבוד</Label>
          <Input type="number" min={0} dir="ltr" value={form.photosToEdit} onChange={(e) => set("photosToEdit", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs text-muted-foreground">אלבום ושדרוגים</Label>
          <Input value={form.albumUpgrades} onChange={(e) => set("albumUpgrades", e.target.value)} placeholder="אלבום דיגיטלי, כריכת בוק, וכו׳" />
          <p className="text-[11px] text-muted-foreground mt-1">
            שדרוגים כלליים לעיון: כריכת זכוכית +₪150 · סט נוסף +₪350 · תמונה נוספת לעיבוד +₪40
          </p>
        </div>
      </div>

      {/* Payment fields are always entered by hand — never auto-filled from the package price. */}
      <div className="pt-3 border-t border-border grid sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">סכום כולל (₪)</Label>
          <Input type="number" min={0} dir="ltr" value={form.totalPrice} onChange={(e) => set("totalPrice", e.target.value)} placeholder="ריק = לא הוגדר" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">שולם עד כה (₪)</Label>
          <Input type="number" min={0} dir="ltr" value={form.amountPaid} onChange={(e) => set("amountPaid", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">יתרה פתוחה</Label>
          <div className="h-10 flex items-center font-display text-lg text-peach-deep" dir="ltr">
            {form.totalPrice.trim() ? `₪${(Number(form.totalPrice) - Number(form.amountPaid || 0)).toFixed(0)}` : "—"}
          </div>
        </div>
      </div>

      <Button type="button" size="sm" onClick={save} disabled={busy} className="rounded-full">
        {busy ? "שומר..." : "שמירת פרטים"}
      </Button>
    </div>
  );
}

/** A connected segmented progress bar (like ChikTime's "בחירה — שליחה — העלאה — טיוט" tracker) instead of a row of separate pill buttons — same click-to-advance behavior, closer visual to the reference. */
function StageTracker({ stage, onSetStage }: { stage: WorkflowStage; onSetStage: (s: WorkflowStage) => void }) {
  const stageIndex = WORKFLOW_STAGES.indexOf(stage);
  return (
    <div className="bg-card rounded-2xl border border-primary/10 p-5">
      <div className="flex items-center">
        {WORKFLOW_STAGES.map((s, i) => (
          <div key={s} className="flex items-center flex-1 last:flex-initial">
            <button
              type="button"
              onClick={() => onSetStage(s)}
              className="flex flex-col items-center gap-1.5 shrink-0"
              title={STAGE_LABELS[s]}
            >
              <span
                className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                  i < stageIndex
                    ? "bg-primary text-primary-foreground"
                    : i === stageIndex
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/15"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i < stageIndex ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={`text-[11px] whitespace-nowrap ${i === stageIndex ? "text-primary font-medium" : "text-muted-foreground"}`}>
                {STAGE_LABELS[s]}
              </span>
            </button>
            {i < WORKFLOW_STAGES.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 -mt-4 ${i < stageIndex ? "bg-primary" : "bg-muted"}`} />
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-4">
        לוחצים על שלב כדי לעדכן את הסטטוס (למשל: "יום צילומים נקבע" אחרי תיאום עם הלקוחה, "אלבום פורסם" כדי לחשוף את התמונות המעובדות ללקוחה).
      </p>
    </div>
  );
}

function PhotoClientDetail() {
  const { bookingId: workflowId } = Route.useParams();
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getPhotoClientDetail);
  const advanceStage = useServerFn(advancePhotoClientStage);
  const toggleSelect = useServerFn(adminToggleProofSelection);
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

  const onToggleSelect = async (imageId: string, selected: boolean) => {
    try {
      await toggleSelect({ data: { imageId, selected } });
      refetch();
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
  const selectedCount = proofImages.filter((i) => i.selected).length;
  const simpleDeliveryOnly = workflow.has_package === false && workflow.wants_editing === false;

  return (
    <div className="space-y-6 max-w-3xl">
      <Link to="/admin/photo-clients" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary">
        <ArrowRight className="h-4 w-4" /> חזרה לרשימת לקוחות צילום
      </Link>

      <div>
        <h2 className="font-display text-xl text-primary">
          {booking.contact_name}
          {workflow.package_type && <span className="text-sm font-normal text-muted-foreground"> · {PHOTO_PACKAGES[workflow.package_type as PhotoPackageKey].label}</span>}
        </h2>
        <p className="text-sm text-muted-foreground" dir="ltr">
          {booking.contact_phone}{" "}
          {workflow.session_date
            ? `· ${workflow.session_date}${workflow.session_time ? ` ${String(workflow.session_time).slice(0, 5)}` : ""}`
            : "· אין מועד קבוע"}
          {workflow.location ? ` · ${workflow.location}` : ""}
        </p>
      </div>

      <PackageDetails workflow={workflow} workflowId={workflowId} onSaved={refetch} />

      {simpleDeliveryOnly ? (
        // Studio-only booking, no editing bought — nothing to progress
        // through (no proofs to pick from, no album stage). Just hand
        // her the photos; /my-photos already shows "edited" images as
        // final the moment the stage is album_published, which is where
        // createPhotoClient started this workflow.
        <UploadSection
          title="תמונות"
          hint="ללקוחה הזו אין תהליך עיבוד/בחירה — כל מה שמעלים כאן נראה לה מיד ב'התמונות שלי'."
          kind="edited"
          workflowId={workflowId}
          images={editedImages}
          onChanged={refetch}
        />
      ) : (
        <>
          <StageTracker stage={stage} onSetStage={setStage} />

          <UploadSection
            title="תמונות גלם (Proofs)"
            hint='הלקוחה תראה את אלה ותוכל לסמן מועדפות (או שמסמנים כאן בשמה, ב-✓) ברגע שהשלב יעודכן ל"המתנה לבחירת לקוחה".'
            kind="proof"
            workflowId={workflowId}
            images={proofImages}
            onChanged={refetch}
            onToggleSelect={onToggleSelect}
          />

          {stage !== "booked" && stage !== "date_confirmed" && (
            <p className="text-sm text-muted-foreground -mt-3">
              {selectedCount > 0 ? (
                <>
                  <Check className="inline h-3.5 w-3.5 ml-1 text-primary" />
                  {selectedCount} תמונות מסומנות כמועדפות.
                </>
              ) : (
                "עדיין לא סומנו בחירות."
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
        </>
      )}
    </div>
  );
}

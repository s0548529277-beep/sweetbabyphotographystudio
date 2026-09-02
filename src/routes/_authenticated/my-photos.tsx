import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { getMyPhotoGalleries, toggleProofSelection, type WorkflowStage } from "@/lib/photo-clients.functions";
import { toast } from "sonner";
import { Camera, Check, Download, Heart } from "lucide-react";

export const Route = createFileRoute("/_authenticated/my-photos")({
  component: MyPhotosPage,
  head: () => ({ meta: [{ title: "התמונות שלי | Sweetbaby" }, { name: "robots", content: "noindex, nofollow" }] }),
});

type Img = { id: string; kind: "proof" | "edited"; image_url: string; selected: boolean };
// booking is null for a workflow the admin started manually, with no
// underlying package='photography' booking (see startManualPhotoWorkflow).
type Gallery = { id: string; booking: { id: string; session_date: string; contact_name: string } | null; stage: WorkflowStage; images: Img[] };

const STAGE_MESSAGE: Record<WorkflowStage, string> = {
  booked: "השריון והמקדמה התקבלו — עדיין אין תמונות להצגה.",
  date_confirmed: "יום הצילומים נקבע 📅 התמונות יעלו לכאן אחרי הצילום.",
  proofs_ready: "התמונות מוכנות! תבחרי את המועדפות עלייך — לחיצה על תמונה מסמנת/מבטלת בחירה.",
  edited_uploaded: "התמונות שנבחרו נמצאות כרגע בעריכה.",
  album_published: "האלבום הסופי שלך מוכן 💗",
};

function ProofGrid({ gallery }: { gallery: Gallery }) {
  const qc = useQueryClient();
  const toggle = useServerFn(toggleProofSelection);

  const onToggle = async (img: Img) => {
    try {
      await toggle({ data: { imageId: img.id, selected: !img.selected } });
      qc.invalidateQueries({ queryKey: ["my-photo-galleries"] });
    } catch (e: any) {
      toast.error(e?.message ?? "עדכון הבחירה נכשל");
    }
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {gallery.images.map((img) => (
        <button
          key={img.id}
          type="button"
          onClick={() => onToggle(img)}
          className="relative aspect-square rounded-xl overflow-hidden border-2 transition-colors"
          style={{ borderColor: img.selected ? "var(--color-primary, #2d3d2b)" : "transparent" }}
        >
          <img src={img.image_url} alt="" className="w-full h-full object-cover" />
          <span
            className={`absolute top-2 left-2 h-7 w-7 rounded-full flex items-center justify-center transition-colors ${
              img.selected ? "bg-primary text-primary-foreground" : "bg-white/70 text-primary"
            }`}
          >
            <Heart className={`h-3.5 w-3.5 ${img.selected ? "fill-current" : ""}`} />
          </span>
        </button>
      ))}
    </div>
  );
}

function AlbumGrid({ gallery }: { gallery: Gallery }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {gallery.images.map((img) => (
        <div key={img.id} className="relative aspect-square rounded-xl overflow-hidden group">
          <img src={img.image_url} alt="" className="w-full h-full object-cover" />
          <a
            href={img.image_url}
            download
            target="_blank"
            rel="noreferrer"
            className="absolute bottom-2 left-2 h-8 w-8 rounded-full bg-white/85 text-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
            aria-label="הורדה"
          >
            <Download className="h-4 w-4" />
          </a>
        </div>
      ))}
    </div>
  );
}

function MyPhotosPage() {
  const fetchGalleries = useServerFn(getMyPhotoGalleries);
  const galleries = useQuery({ queryKey: ["my-photo-galleries"], queryFn: () => fetchGalleries({}) });
  const rows = (galleries.data ?? []) as unknown as Gallery[];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <section className="container-page py-14 flex-1 space-y-10">
        <div>
          <h1 className="font-display text-3xl text-primary flex items-center gap-2">
            <Camera className="h-6 w-6" /> התמונות שלי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">כל צילום שהזמנת עם מיכל — כאן יעלו התמונות שלך, ותוכלי לבחור מועדפות ולהוריד את האלבום הסופי.</p>
        </div>

        {rows.length === 0 && <p className="text-sm text-muted-foreground">עדיין אין לך הזמנת צילומים.</p>}

        {rows.map((g) => (
          <div key={g.id} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl text-primary" dir="ltr">
                {g.booking?.session_date ?? "הצילום שלך"}
              </h2>
              {g.stage === "proofs_ready" && (
                <span className="text-xs text-primary flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" /> {g.images.filter((i) => i.selected).length} נבחרו
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{STAGE_MESSAGE[g.stage]}</p>
            {g.stage === "proofs_ready" && g.images.length > 0 && <ProofGrid gallery={g} />}
            {g.stage === "album_published" && g.images.length > 0 && <AlbumGrid gallery={g} />}
          </div>
        ))}
      </section>
      <Footer />
    </div>
  );
}

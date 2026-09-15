import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Heart, Check, Loader2 } from "lucide-react";
import {
  getNewbornGalleryByToken,
  toggleNewbornProofByToken,
  finishNewbornProofSelectionByToken,
} from "@/lib/newborn-orders.functions";
import michalLogoWordmark from "@/assets/michal-logo-wordmark.png";

// The client-facing gallery for Michal's own newborn-photography business —
// per explicit request, a completely separate surface from the general
// site's photo-client system: no login, no Sweetbaby branding, reachable
// only via a private link (the token in the URL) mailed to the client.
// Shows watermarked proofs to pick from, or — once she's uploaded them —
// the final full-quality edited photos instead.
export const Route = createFileRoute("/newborn/gallery/$token")({
  head: () => ({
    meta: [{ title: "התמונות שלך | מיכל סיבוני" }, { name: "robots", content: "noindex" }],
  }),
  component: NewbornGalleryPage,
});

function NewbornGalleryPage() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const getGallery = useServerFn(getNewbornGalleryByToken);
  const toggleProof = useServerFn(toggleNewbornProofByToken);
  const finishSelection = useServerFn(finishNewbornProofSelectionByToken);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  const query = useQuery({
    queryKey: ["newborn-gallery-token", token],
    queryFn: () => getGallery({ data: { token } }),
    retry: false,
  });

  if (query.isLoading) {
    return (
      <div dir="rtl" className="min-h-screen bg-[#f8ede4] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#6b8a63]" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div dir="rtl" className="min-h-screen bg-[#f8ede4] flex items-center justify-center px-6 text-center">
        <div>
          <Link to="/">
            <img src={michalLogoWordmark} alt="michal" className="h-10 mx-auto mb-4" />
          </Link>
          <p className="text-[#2d3d2b]">הקישור לא תקין או שפג תוקפו. אפשר לפנות אליי ישירות ואשלח קישור חדש.</p>
        </div>
      </div>
    );
  }

  const { contactName, packageName, images, proofsSelectedAt } = query.data;
  const edited = images.filter((i) => i.kind === "edited");
  const proofs = images.filter((i) => i.kind === "proof");
  const showEdited = edited.length > 0;
  const showing = showEdited ? edited : proofs;
  const selectedCount = proofs.filter((i) => i.selected).length;

  const toggle = async (imageId: string, selected: boolean) => {
    qc.setQueryData(["newborn-gallery-token", token], (prev: typeof query.data) =>
      prev ? { ...prev, images: prev.images.map((i) => (i.id === imageId ? { ...i, selected } : i)) } : prev,
    );
    try {
      await toggleProof({ data: { token, imageId, selected } });
    } catch {
      toast.error("העדכון נכשל, נסי שוב");
      qc.invalidateQueries({ queryKey: ["newborn-gallery-token", token] });
    }
  };

  const finish = async () => {
    if (selectedCount === 0) {
      toast.error("נא לבחור לפחות תמונה אחת");
      return;
    }
    setFinishing(true);
    try {
      await finishSelection({ data: { token } });
      qc.invalidateQueries({ queryKey: ["newborn-gallery-token", token] });
      toast.success("תודה! הבחירה שלך נשלחה אליי 💗");
    } catch {
      toast.error("משהו השתבש, נסי שוב");
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#f8ede4] text-[#2d3d2b]" style={{ fontFamily: "'Fira Sans', sans-serif" }}>
      <header className="border-b border-[#2d3d2b]/10 bg-[#f8ede4]/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link to="/">
            <img src={michalLogoWordmark} alt="michal" className="h-10 w-auto" />
          </Link>
          <div className="text-sm text-[#2d3d2b]/70">{contactName}</div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl mb-2" style={{ fontFamily: "'DM Serif Display', serif" }}>
            {showEdited ? "התמונות המוכנות שלך 💗" : "בואי נבחר תמונות"}
          </h1>
          <p className="text-sm text-[#2d3d2b]/70">
            {showEdited ? packageName : proofsSelectedAt ? "כבר שלחת לי את הבחירה שלך — תודה!" : `לוחצים על הלב לבחור — ${packageName}`}
          </p>
        </div>

        {showing.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#2d3d2b]/20 p-12 text-center text-sm text-[#2d3d2b]/70">
            עדיין לא הועלו תמונות — אעדכן אותך במייל ברגע שהן יהיו מוכנות 💗
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            {showing.map((img) => (
              <div key={img.id} className="relative aspect-square overflow-hidden rounded-2xl bg-[#f5d5cf] group">
                <img
                  src={img.image_url}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover cursor-zoom-in"
                  onClick={() => setLightbox(img.image_url)}
                />
                {!showEdited && (
                  <button
                    type="button"
                    onClick={() => toggle(img.id, !img.selected)}
                    disabled={!!proofsSelectedAt}
                    className={`absolute top-2 left-2 h-10 w-10 rounded-full flex items-center justify-center transition disabled:opacity-60 ${
                      img.selected ? "bg-[#2d3d2b] text-white" : "bg-white/80 text-[#2d3d2b] hover:bg-white"
                    }`}
                  >
                    <Heart className={`h-4 w-4 ${img.selected ? "fill-current" : ""}`} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {!showEdited && showing.length > 0 && (
          <>
            <p className="text-center text-sm font-medium text-[#2d3d2b] bg-[#a8c4a2]/15 border border-[#a8c4a2]/30 rounded-xl py-3 px-4 mt-6">
              קבלת כל התמונות מותנת בתוספת 150 ש"ח
            </p>
            {!proofsSelectedAt && (
              <div className="text-center mt-6">
                <button
                  type="button"
                  onClick={finish}
                  disabled={finishing}
                  className="inline-flex items-center gap-2 bg-[#2d3d2b] text-white px-8 py-3.5 rounded-full font-semibold disabled:opacity-60"
                >
                  {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  סיימתי לבחור ({selectedCount})
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

// "בניית אלבום מותאם אישית" — customer wizard: shape → size+pages (live
// price) → ready-made template → simple editor (upload a photo into each of
// the template's fixed slots + caption) → contact details → submit.
// Ported 2026-10-27 from the Sept 3 branch claude/email-search-rpn6jn and
// adapted to today's code:
//  * HIDDEN for now (owner reviews first): not linked from any header/footer
//    and `robots: noindex, nofollow`. Don't add it to sitemap.xml yet.
//  * Michal's photography look (newborn-* palette + her wordmark), not the
//    Sweetbaby studio-rental chrome — albums are her photography product.
//  * Saves to the standalone public.album_orders table (NOT orders /
//    order_items, which are props-rental orders and feed finance/cashback).
//  * Uploaded photos go to the private "album-photos" bucket under
//    <user id>/…; previews survive a reload via signed URLs.
// Wizard progress is mirrored to sessionStorage so logging in (needed before
// uploads) and coming back doesn't lose it.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ImagePlus, Loader2, ArrowRight, Heart, BookHeart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { heError } from "@/lib/he-errors";
import michalLogoWordmark from "@/assets/michal-logo-wordmark.png";
import {
  albumPrice,
  emptyAlbumDesign,
  isAlbumDesignComplete,
  resolveAlbumPageRects,
  ALBUM_TEMPLATE_CATEGORIES,
  CAPTION_GROUPS,
  type AlbumShapeRow,
  type AlbumSizeRow,
  type AlbumTemplateRow,
  type AlbumDesign,
} from "@/lib/album-data";

// album_* tables aren't in the generated Database type yet — same
// cast-until-regenerated convention used elsewhere (e.g. admin.leads).
const supabase = supabaseTyped as any;

export const Route = createFileRoute("/album-builder")({
  component: AlbumBuilderPage,
  head: () => ({
    meta: [
      { title: "בניית אלבום מותאם אישית | מיכל סיבוני" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "בניית אלבום תמונות מודפס: צורה, מידה, מספר עמודים, עיצוב מוכן והעלאת התמונות שלכם.",
      },
    ],
  }),
});

type Step = "shape" | "size" | "template" | "editor" | "done";
const SESSION_KEY = "sweetbaby-album-builder-wizard";

type SavedWizardState = {
  step: Step;
  shapeId: string | null;
  sizeId: string | null;
  pages: number;
  templateId: string | null;
  design: AlbumDesign | null;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  notes: string;
};

function loadSaved(): SavedWizardState | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedWizardState;
    if (parsed.design) {
      // blob: preview URLs never survive a reload — re-signed below.
      parsed.design = {
        ...parsed.design,
        pages: parsed.design.pages.map((p) => ({
          ...p,
          slots: p.slots.map((s) => ({ ...s, url: null })),
        })),
      };
    }
    return parsed;
  } catch {
    return null;
  }
}

function updateSlot(
  d: AlbumDesign | null,
  pageIdx: number,
  slotIdx: number,
  slot: { path: string | null; url: string | null },
): AlbumDesign | null {
  if (!d) return d;
  return {
    ...d,
    pages: d.pages.map((p, pi) =>
      pi !== pageIdx ? p : { ...p, slots: p.slots.map((s, si) => (si !== slotIdx ? s : slot)) },
    ),
  };
}

const card = "rounded-3xl border border-newborn-gold/20 bg-white/85 p-5";
const chip = (active: boolean) =>
  `text-xs rounded-full px-3 py-1.5 border transition-colors ${
    active
      ? "border-newborn-rose bg-newborn-blush/40 text-newborn-ink"
      : "border-newborn-gold/25 text-newborn-ink/60 hover:border-newborn-rose/60"
  }`;

function AlbumBuilderPage() {
  const { user, loading: authLoading } = useAuth();
  const [saved] = useState(loadSaved);

  const [step, setStep] = useState<Step>(saved?.step ?? "shape");
  const [shapeId, setShapeId] = useState<string | null>(saved?.shapeId ?? null);
  const [sizeId, setSizeId] = useState<string | null>(saved?.sizeId ?? null);
  const [pages, setPages] = useState<number>(saved?.pages ?? 20);
  const [templateId, setTemplateId] = useState<string | null>(saved?.templateId ?? null);
  const [design, setDesign] = useState<AlbumDesign | null>(saved?.design ?? null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [contactName, setContactName] = useState(saved?.contactName ?? "");
  const [contactPhone, setContactPhone] = useState(saved?.contactPhone ?? "");
  const [contactEmail, setContactEmail] = useState(saved?.contactEmail ?? "");
  const [notes, setNotes] = useState(saved?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (step === "done") {
        sessionStorage.removeItem(SESSION_KEY);
        return;
      }
      const state: SavedWizardState = {
        step,
        shapeId,
        sizeId,
        pages,
        templateId,
        design: design
          ? {
              ...design,
              pages: design.pages.map((p) => ({
                ...p,
                slots: p.slots.map((s) => ({ path: s.path, url: null })),
              })),
            }
          : null,
        contactName,
        contactPhone,
        contactEmail,
        notes,
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
    } catch {
      // private/locked-down browser — wizard still works within this page load.
    }
  }, [step, shapeId, sizeId, pages, templateId, design, contactName, contactPhone, contactEmail, notes]);

  // Re-create previews for already-uploaded photos after a reload / login.
  useEffect(() => {
    if (!user || !design) return;
    const missing: { pi: number; si: number; path: string }[] = [];
    design.pages.forEach((p, pi) =>
      p.slots.forEach((s, si) => {
        if (s.path && !s.url) missing.push({ pi, si, path: s.path });
      }),
    );
    if (missing.length === 0) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.storage
        .from("album-photos")
        .createSignedUrls(
          missing.map((m) => m.path),
          60 * 60,
        );
      if (cancelled || !data) return;
      setDesign((d) => {
        let next = d;
        missing.forEach((m, i) => {
          const url = data[i]?.signedUrl;
          if (url) next = updateSlot(next, m.pi, m.si, { path: m.path, url });
        });
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // Only on login / template change — not on every slot edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, design?.templateId]);

  useEffect(() => {
    if (user?.email && !contactEmail) setContactEmail(user.email);
  }, [user?.email, contactEmail]);

  const shapesQ = useQuery({
    queryKey: ["album-shapes"],
    queryFn: async (): Promise<AlbumShapeRow[]> => {
      const { data, error } = await supabase
        .from("album_shapes")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const sizesQ = useQuery({
    queryKey: ["album-sizes", shapeId],
    queryFn: async (): Promise<AlbumSizeRow[]> => {
      const { data, error } = await supabase
        .from("album_sizes")
        .select("*")
        .eq("shape_id", shapeId)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!shapeId,
  });

  const templatesQ = useQuery({
    queryKey: ["album-templates", shapeId],
    queryFn: async (): Promise<AlbumTemplateRow[]> => {
      const { data, error } = await supabase
        .from("album_templates")
        .select("*")
        .eq("shape_id", shapeId)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!shapeId,
  });

  const selectedShape = (shapesQ.data ?? []).find((s) => s.id === shapeId) ?? null;
  const selectedSize = (sizesQ.data ?? []).find((s) => s.id === sizeId) ?? null;
  const selectedTemplate = (templatesQ.data ?? []).find((t) => t.id === templateId) ?? null;
  const price = selectedSize ? albumPrice(selectedSize, pages) : 0;

  const filteredTemplates = (templatesQ.data ?? []).filter((t) => {
    if (t.min_pages != null && pages < t.min_pages) return false;
    if (t.max_pages != null && pages > t.max_pages) return false;
    if (categoryFilter && t.category !== categoryFilter) return false;
    return true;
  });

  const chooseShape = (id: string) => {
    setShapeId(id);
    setSizeId(null);
    setTemplateId(null);
    setDesign(null);
    setStep("size");
  };

  const chooseTemplate = (t: AlbumTemplateRow) => {
    if (templateId !== t.id || !design) setDesign(emptyAlbumDesign(t));
    setTemplateId(t.id);
    setStep("editor");
  };

  const uploadPhoto = async (pageIdx: number, slotIdx: number, file: File) => {
    if (!user) {
      toast.error("צריך להתחבר כדי להעלות תמונות");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("אפשר להעלות רק תמונות");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error("התמונה גדולה מדי (עד 25MB)");
      return;
    }
    const key = `${pageIdx}-${slotIdx}`;
    const localUrl = URL.createObjectURL(file);
    setDesign((d) => updateSlot(d, pageIdx, slotIdx, { path: null, url: localUrl }));
    setUploadingSlot(key);
    try {
      const ext =
        (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("album-photos")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      setDesign((d) => updateSlot(d, pageIdx, slotIdx, { path, url: localUrl }));
    } catch (e) {
      toast.error(heError(e));
      setDesign((d) => updateSlot(d, pageIdx, slotIdx, { path: null, url: null }));
    } finally {
      setUploadingSlot((cur) => (cur === key ? null : cur));
    }
  };

  const setCaption = (pageIdx: number, text: string) => {
    setDesign((d) =>
      d
        ? { ...d, pages: d.pages.map((p, pi) => (pi !== pageIdx ? p : { ...p, caption: text })) }
        : d,
    );
  };

  const contactOk = contactName.trim().length > 1 && contactPhone.replace(/\D/g, "").length >= 9;

  const submit = async () => {
    if (!user || !design || !selectedShape || !selectedSize || !selectedTemplate) return;
    if (!contactOk) {
      toast.error("נא למלא שם וטלפון");
      return;
    }
    setSubmitting(true);
    try {
      const cleanDesign: AlbumDesign = {
        ...design,
        pages: design.pages.map((p) => ({
          ...p,
          slots: p.slots.map((s) => ({ path: s.path, url: null })),
        })),
      };
      const { error } = await supabase.from("album_orders").insert({
        user_id: user.id,
        contact_name: contactName.trim(),
        contact_phone: contactPhone.trim(),
        contact_email: contactEmail.trim() || null,
        shape_id: shapeId,
        size_id: sizeId,
        template_id: templateId,
        summary: `${selectedShape.name_he} ${selectedSize.label_he} (${selectedSize.width_cm}×${selectedSize.height_cm} ס"מ), ${pages} עמודים, עיצוב "${selectedTemplate.name}"`,
        pages,
        price,
        design_json: cleanDesign,
        customer_notes: notes.trim() || null,
      });
      if (error) throw error;
      toast.success("האלבום נשלח!");
      setStep("done");
    } catch (e) {
      toast.error(heError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const complete = design ? isAlbumDesignComplete(design) : false;
  const BackBtn = ({ to, label }: { to: Step; label: string }) => (
    <button
      onClick={() => setStep(to)}
      className="text-xs text-newborn-ink/60 flex items-center gap-1 hover:text-newborn-rose"
    >
      <ArrowRight className="h-3.5 w-3.5" /> {label}
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col bg-newborn-canvas text-newborn-ink" dir="rtl">
      <header className="border-b border-newborn-gold/10 bg-newborn-canvas/90">
        <div className="mx-auto flex h-20 max-w-3xl items-center justify-between px-4">
          <Link to="/newborn" aria-label="מיכל סיבוני – צילומי ניו בורן">
            <img src={michalLogoWordmark} alt="מיכל סיבוני" className="h-14 w-auto object-contain" />
          </Link>
          <span className="text-xs text-newborn-ink/50">אלבום מותאם אישית</span>
        </div>
      </header>

      <section className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <div className="inline-flex items-center gap-2 text-newborn-gold text-xs tracking-[0.28em] uppercase mb-2">
          <BookHeart className="h-4 w-4" /> אלבום מודפס
        </div>
        <h1 className="font-display text-3xl md:text-4xl mb-8">בניית אלבום מותאם אישית</h1>

        {step === "shape" && (
          <div className="space-y-3">
            <p className="text-sm text-newborn-ink/60">שלב 1 מתוך 4 — צורת האלבום</p>
            {shapesQ.isLoading && <Loader2 className="h-5 w-5 animate-spin text-newborn-rose" />}
            <div className="grid sm:grid-cols-3 gap-3">
              {(shapesQ.data ?? []).map((s) => (
                <button
                  key={s.id}
                  onClick={() => chooseShape(s.id)}
                  className={`${card} text-right hover:border-newborn-rose transition-colors`}
                >
                  <div className="font-medium">{s.name_he}</div>
                  <div className="text-xs text-newborn-ink/50 mt-1">{s.name_en}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "size" && selectedShape && (
          <div className="space-y-4">
            <BackBtn to="shape" label="חזרה לבחירת צורה" />
            <p className="text-sm text-newborn-ink/60">
              שלב 2 מתוך 4 — מידה ומספר עמודים ({selectedShape.name_he})
            </p>
            {sizesQ.isLoading && <Loader2 className="h-5 w-5 animate-spin text-newborn-rose" />}
            <div className="grid sm:grid-cols-2 gap-3">
              {(sizesQ.data ?? []).map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSizeId(s.id);
                    setPages(Math.max(s.min_pages, Math.min(pages, s.max_pages)));
                  }}
                  className={`text-right rounded-3xl border p-4 transition-colors ${
                    sizeId === s.id
                      ? "border-newborn-rose bg-newborn-blush/30"
                      : "border-newborn-gold/20 bg-white/85 hover:border-newborn-rose/60"
                  }`}
                >
                  <div className="font-medium">
                    {s.label_he} — {s.width_cm}×{s.height_cm} ס"מ
                  </div>
                  <div className="text-xs text-newborn-ink/50 mt-1">
                    החל מ-{s.base_price}₪ ({s.min_pages} עמודים)
                  </div>
                </button>
              ))}
            </div>
            {selectedSize && (
              <div className={`${card} space-y-3`}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">מספר עמודים</span>
                  <span className="text-newborn-ink/60">{pages} עמודים</span>
                </div>
                <input
                  type="range"
                  min={selectedSize.min_pages}
                  max={selectedSize.max_pages}
                  step={2}
                  value={pages}
                  onChange={(e) => setPages(Number(e.target.value))}
                  className="w-full accent-[var(--newborn-rose)]"
                />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-newborn-ink/60">מחיר משוער</span>
                  <span className="font-medium text-lg">{price}₪</span>
                </div>
                <Button
                  className="w-full rounded-full bg-newborn-rose hover:bg-newborn-rose/90 text-white"
                  onClick={() => setStep("template")}
                >
                  המשך לבחירת עיצוב
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "template" && selectedShape && (
          <div className="space-y-4">
            <BackBtn to="size" label="חזרה למידה ועמודים" />
            <p className="text-sm text-newborn-ink/60">שלב 3 מתוך 4 — עיצוב מוכן</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setCategoryFilter(null)} className={chip(!categoryFilter)}>
                הכל
              </button>
              {ALBUM_TEMPLATE_CATEGORIES.map((c) => (
                <button key={c} onClick={() => setCategoryFilter(c)} className={chip(categoryFilter === c)}>
                  {c}
                </button>
              ))}
            </div>
            {templatesQ.isLoading && <Loader2 className="h-5 w-5 animate-spin text-newborn-rose" />}
            {!templatesQ.isLoading && filteredTemplates.length === 0 && (
              <p className="text-sm text-newborn-ink/60 py-6 text-center">
                אין עדיין עיצובים זמינים לצורה / מספר העמודים האלה — נעדכן בקרוב.
              </p>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              {filteredTemplates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => chooseTemplate(t)}
                  className="text-right rounded-3xl border border-newborn-gold/20 bg-white/85 overflow-hidden hover:border-newborn-rose transition-colors"
                >
                  {t.thumbnail_url ? (
                    <img src={t.thumbnail_url} alt={t.name} className="w-full h-40 object-cover" />
                  ) : (
                    <TemplatePreview template={t} />
                  )}
                  <div className="p-3">
                    <div className="font-medium text-sm">{t.name}</div>
                    <div className="text-xs text-newborn-ink/50 mt-0.5">
                      {[t.category, `${t.template_data.pages.length} עמודי עיצוב`].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "editor" && design && selectedTemplate && (
          <div className="space-y-6">
            <BackBtn to="template" label="חזרה לבחירת עיצוב" />
            <p className="text-sm text-newborn-ink/60">
              שלב 4 מתוך 4 — העלאת תמונות וכיתובים ({selectedTemplate.name})
            </p>

            {!user && !authLoading && (
              <div className="rounded-3xl border border-newborn-rose/30 bg-newborn-blush/20 p-4 text-sm space-y-2">
                <p>כדי להעלות תמונות צריך להתחבר — הבחירות נשמרות ואפשר להמשיך בדיוק מכאן.</p>
                <Link to="/auth" search={{ redirect: "/album-builder" }}>
                  <Button size="sm" className="rounded-full bg-newborn-rose hover:bg-newborn-rose/90 text-white">
                    התחברות / הרשמה
                  </Button>
                </Link>
              </div>
            )}

            {design.pages.map((page, pageIdx) => {
              const rects = resolveAlbumPageRects({
                layoutId: page.layoutId,
                photoCount: page.photoCount,
                hasCaption: page.caption !== null,
              });
              return (
                <div key={pageIdx} className={`${card} space-y-3`}>
                  <div className="text-xs text-newborn-ink/50">עמוד {pageIdx + 1}</div>
                  <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-newborn-blush/20">
                    {page.slots.map((slot, slotIdx) => {
                      const rect = rects[slotIdx] ?? { x: 0, y: 0, w: 1, h: 1 };
                      const key = `${pageIdx}-${slotIdx}`;
                      const isUploading = uploadingSlot === key;
                      return (
                        <label
                          key={slotIdx}
                          className="absolute flex items-center justify-center cursor-pointer bg-white/60 hover:bg-white/80 border-2 border-newborn-canvas overflow-hidden"
                          style={{
                            left: `${rect.x * 100}%`,
                            top: `${rect.y * 100}%`,
                            width: `${rect.w * 100}%`,
                            height: `${rect.h * 100}%`,
                          }}
                        >
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={!user || isUploading}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void uploadPhoto(pageIdx, slotIdx, f);
                              e.target.value = "";
                            }}
                          />
                          {slot.url ? (
                            <img src={slot.url} alt="" className="w-full h-full object-cover" />
                          ) : slot.path ? (
                            <div className="flex flex-col items-center gap-1 text-newborn-rose text-xs">
                              <Check className="h-5 w-5" /> הועלה
                            </div>
                          ) : isUploading ? (
                            <Loader2 className="h-5 w-5 animate-spin text-newborn-rose" />
                          ) : (
                            <ImagePlus className="h-5 w-5 text-newborn-ink/40" />
                          )}
                          {isUploading && slot.url && (
                            <span className="absolute inset-0 flex items-center justify-center bg-white/50">
                              <Loader2 className="h-5 w-5 animate-spin text-newborn-rose" />
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                  {page.caption !== null && (
                    <div className="space-y-1.5">
                      <Input
                        placeholder="כיתוב לעמוד (אפשר גם להשאיר ריק)"
                        value={page.caption}
                        onChange={(e) => setCaption(pageIdx, e.target.value)}
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {CAPTION_GROUPS.slice(0, 3)
                          .flatMap((g) => g.items.slice(0, 3))
                          .map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setCaption(pageIdx, c)}
                              className="text-[11px] rounded-full border border-newborn-gold/25 px-2 py-1 text-newborn-ink/60 hover:border-newborn-rose hover:text-newborn-rose"
                            >
                              {c}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <div className={`${card} space-y-3`}>
              <div className="grid sm:grid-cols-2 gap-3">
                <Input placeholder="שם מלא *" value={contactName} onChange={(e) => setContactName(e.target.value)} />
                <Input
                  placeholder="טלפון *"
                  inputMode="tel"
                  dir="ltr"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                />
                <Input
                  placeholder="מייל"
                  type="email"
                  dir="ltr"
                  className="sm:col-span-2"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </div>
              <textarea
                placeholder="הערות למיכל (צבע כריכה, שם התינוק, כל בקשה)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              />
              <div className="flex items-center justify-between text-sm">
                <span className="text-newborn-ink/60">מחיר משוער</span>
                <span className="font-medium text-lg">{price}₪</span>
              </div>
              <Button
                className="w-full rounded-full gap-2 bg-newborn-rose hover:bg-newborn-rose/90 text-white"
                disabled={!user || !complete || !contactOk || submitting || !!uploadingSlot}
                onClick={submit}
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                שליחת האלבום למיכל
              </Button>
              {user && !complete && (
                <p className="text-xs text-newborn-ink/50 text-center">צריך תמונה בכל המשבצות לפני השליחה.</p>
              )}
              <p className="text-[11px] text-newborn-ink/40 text-center">
                המחיר סופי רק אחרי אישור מיכל. אין תשלום באתר בשלב הזה.
              </p>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className={`${card} p-8 text-center space-y-3`}>
            <Heart className="h-10 w-10 text-newborn-rose mx-auto" />
            <h2 className="font-display text-2xl">האלבום התקבל!</h2>
            <p className="text-sm text-newborn-ink/60">
              מיכל תעבור על האלבום ותחזור אליכם לתיאום, אישור עיצוב ותשלום.
            </p>
            <Link to="/newborn">
              <Button variant="outline" className="rounded-full">
                חזרה לעמוד של מיכל
              </Button>
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

/** Mini wireframe of a template's first page, used when the template has no thumbnail. */
function TemplatePreview({ template }: { template: AlbumTemplateRow }) {
  const pagesToShow = template.template_data.pages.slice(0, 2);
  return (
    <div className="w-full h-40 bg-newborn-blush/15 flex items-center justify-center gap-1 p-4">
      {pagesToShow.map((p, i) => (
        <div key={i} className="relative h-full aspect-[4/3] bg-white rounded-sm shadow-sm">
          {resolveAlbumPageRects(p).map((r, j) => (
            <span
              key={j}
              className="absolute bg-newborn-gold/25 border border-white"
              style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

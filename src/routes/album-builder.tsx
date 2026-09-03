// "בניית אלבום מותאם אישית" — customer wizard: shape → size+pages (live
// price) → ready-made template → simple editor (upload a photo into each
// of the template's fixed slots + edit each page's caption) → submit as a
// real order (existing orders/order_items flow, same as every other
// purchase on the site — see album-builder migration's own doc comment for
// why). Deliberately a SIMPLE editor (swap photo/text into fixed slots),
// not a freeform drag/resize canvas — explicit decision, 2026-09-03.
//
// Wizard progress is mirrored to sessionStorage so navigating to /auth to
// log in (required before the upload step — see the "editor" gate below)
// and coming back doesn't lose it. One known rough edge: an uploaded
// slot's live thumbnail is a browser-local blob: URL, which doesn't
// survive a reload — restored progress shows a "הועלה ✓" mark on filled
// slots instead of the actual thumbnail (the uploaded file itself is safe;
// only the in-page preview is lost). Good enough for a phase-1 editor this
// simple; worth a real signed-URL preview if this becomes a bigger pain
// point.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ImagePlus, Loader2, ArrowRight, Sparkles, PartyPopper } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { heError } from "@/lib/he-errors";
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

// New tables (album_shapes/album_sizes/album_templates/album_orders) aren't
// in the generated Database type yet — same cast-until-regenerated
// convention as admin.voice-bot.tsx's app_settings.
const supabase = supabaseTyped as any;

export const Route = createFileRoute("/album-builder")({
  component: AlbumBuilderPage,
  head: () => ({
    meta: [
      { title: "בניית אלבום מותאם אישית | Sweetbaby" },
      {
        name: "description",
        content:
          "בנו אלבום תמונות מודפס מותאם אישית: בחרו צורה, מידה ומספר עמודים, עיצוב מוכן, והעלו את התמונות שלכם.",
      },
      { property: "og:title", content: "בניית אלבום מותאם אישית | Sweetbaby" },
      { property: "og:url", content: "https://sweetbabyphoto.shop/album-builder" },
    ],
    links: [{ rel: "canonical", href: "https://sweetbabyphoto.shop/album-builder" }],
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
};

function loadSaved(): SavedWizardState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedWizardState;
    // Blob preview URLs never survive a reload — drop them so a stale/
    // broken <img src> isn't attempted; the uploaded path itself is safe.
    if (parsed.design) {
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

function AlbumBuilderPage() {
  const { user, loading: authLoading } = useAuth();
  const saved = useState(loadSaved)[0];

  const [step, setStep] = useState<Step>(saved?.step ?? "shape");
  const [shapeId, setShapeId] = useState<string | null>(saved?.shapeId ?? null);
  const [sizeId, setSizeId] = useState<string | null>(saved?.sizeId ?? null);
  const [pages, setPages] = useState<number>(saved?.pages ?? 20);
  const [templateId, setTemplateId] = useState<string | null>(saved?.templateId ?? null);
  const [design, setDesign] = useState<AlbumDesign | null>(saved?.design ?? null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [contactName, setContactName] = useState(saved?.contactName ?? "");
  const [contactPhone, setContactPhone] = useState(saved?.contactPhone ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null); // `${pageIdx}-${slotIdx}`

  useEffect(() => {
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
      design,
      contactName,
      contactPhone,
    };
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
    } catch {
      // sessionStorage can throw in a private/locked-down browser — the
      // wizard still works within the same page load, it just won't
      // survive a navigate-away-and-back for login. Not worth failing over.
    }
  }, [step, shapeId, sizeId, pages, templateId, design, contactName, contactPhone]);

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
    setTemplateId(t.id);
    setDesign(emptyAlbumDesign(t));
    setStep("editor");
  };

  const uploadPhoto = async (pageIdx: number, slotIdx: number, file: File) => {
    if (!user) {
      toast.error("צריך להתחבר כדי להעלות תמונות");
      return;
    }
    const key = `${pageIdx}-${slotIdx}`;
    const localUrl = URL.createObjectURL(file);
    setDesign((d) =>
      d
        ? {
            ...d,
            pages: d.pages.map((p, pi) =>
              pi !== pageIdx
                ? p
                : {
                    ...p,
                    slots: p.slots.map((s, si) =>
                      si !== slotIdx ? s : { path: s.path, url: localUrl },
                    ),
                  },
            ),
          }
        : d,
    );
    setUploadingSlot(key);
    try {
      const ext =
        (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("album-photos")
        .upload(path, file, { upsert: false });
      if (error) throw error;
      setDesign((d) =>
        d
          ? {
              ...d,
              pages: d.pages.map((p, pi) =>
                pi !== pageIdx
                  ? p
                  : {
                      ...p,
                      slots: p.slots.map((s, si) => (si !== slotIdx ? s : { path, url: localUrl })),
                    },
              ),
            }
          : d,
      );
    } catch (e) {
      toast.error(heError(e));
      setDesign((d) =>
        d
          ? {
              ...d,
              pages: d.pages.map((p, pi) =>
                pi !== pageIdx
                  ? p
                  : {
                      ...p,
                      slots: p.slots.map((s, si) =>
                        si !== slotIdx ? s : { path: null, url: null },
                      ),
                    },
              ),
            }
          : d,
      );
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

  const submit = async () => {
    if (!user || !design || !selectedShape || !selectedSize || !selectedTemplate) return;
    setSubmitting(true);
    try {
      const cleanDesign: AlbumDesign = {
        ...design,
        pages: design.pages.map((p) => ({
          ...p,
          slots: p.slots.map((s) => ({ path: s.path, url: null })),
        })),
      };
      const { data: orderRow, error: orderErr } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          status: "pending",
          total: price,
          contact_name: contactName || null,
          contact_phone: contactPhone || null,
          notes: `אלבום מותאם אישית — ${selectedShape.name_he}, ${selectedSize.label_he} (${selectedSize.width_cm}×${selectedSize.height_cm} ס"מ), ${pages} עמודים, עיצוב "${selectedTemplate.name}"`,
        })
        .select()
        .single();
      if (orderErr) throw orderErr;
      const { data: itemRow, error: itemErr } = await supabase
        .from("order_items")
        .insert({
          order_id: orderRow.id,
          item_id: null,
          item_name: `אלבום מותאם אישית — ${selectedShape.name_he} ${selectedSize.label_he}`,
          quantity: 1,
          price,
        })
        .select()
        .single();
      if (itemErr) throw itemErr;
      const { error: albumErr } = await supabase.from("album_orders").insert({
        order_id: orderRow.id,
        order_item_id: itemRow.id,
        user_id: user.id,
        shape_id: shapeId,
        size_id: sizeId,
        template_id: templateId,
        pages,
        price,
        design_json: cleanDesign,
      });
      if (albumErr) throw albumErr;
      toast.success("ההזמנה נשלחה בהצלחה!");
      setStep("done");
    } catch (e) {
      toast.error(heError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const complete = design ? isAlbumDesignComplete(design) : false;

  return (
    <div className="min-h-screen flex flex-col bg-cream/40" dir="rtl">
      <Header />
      <section className="container-page py-10 flex-1 max-w-3xl">
        <div className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> אלבום מותאם אישית
        </div>
        <h1 className="font-display text-4xl text-primary mb-8">בניית אלבום</h1>

        {step === "shape" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground mb-2">שלב 1 מתוך 4 — צורת האלבום</p>
            {shapesQ.isLoading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            <div className="grid sm:grid-cols-3 gap-3">
              {(shapesQ.data ?? []).map((s) => (
                <button
                  key={s.id}
                  onClick={() => chooseShape(s.id)}
                  className="text-right rounded-2xl border border-primary/10 bg-card p-5 hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <div className="font-medium text-primary">{s.name_he}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.name_en}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "size" && selectedShape && (
          <div className="space-y-4">
            <button
              onClick={() => setStep("shape")}
              className="text-xs text-muted-foreground flex items-center gap-1 hover:text-primary"
            >
              <ArrowRight className="h-3.5 w-3.5" /> חזרה לבחירת צורה
            </button>
            <p className="text-sm text-muted-foreground">
              שלב 2 מתוך 4 — מידה ומספר עמודים ({selectedShape.name_he})
            </p>
            {sizesQ.isLoading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            <div className="grid sm:grid-cols-2 gap-3">
              {(sizesQ.data ?? []).map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSizeId(s.id);
                    setPages(Math.max(s.min_pages, Math.min(pages, s.max_pages)));
                  }}
                  className={`text-right rounded-2xl border p-4 transition-colors ${sizeId === s.id ? "border-primary bg-primary/5" : "border-primary/10 bg-card hover:bg-muted"}`}
                >
                  <div className="font-medium text-primary">
                    {s.label_he} — {s.width_cm}×{s.height_cm} ס"מ
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    החל מ-{s.base_price}₪ ({s.min_pages} עמודים)
                  </div>
                </button>
              ))}
            </div>
            {selectedSize && (
              <div className="rounded-2xl border border-primary/10 bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-primary">מספר עמודים</span>
                  <span className="text-sm text-muted-foreground">{pages} עמודים</span>
                </div>
                <input
                  type="range"
                  min={selectedSize.min_pages}
                  max={selectedSize.max_pages}
                  step={2}
                  value={pages}
                  onChange={(e) => setPages(Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">מחיר משוער</span>
                  <span className="font-medium text-primary text-lg">{price}₪</span>
                </div>
                <Button className="w-full rounded-full" onClick={() => setStep("template")}>
                  המשך לבחירת עיצוב
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "template" && selectedShape && (
          <div className="space-y-4">
            <button
              onClick={() => setStep("size")}
              className="text-xs text-muted-foreground flex items-center gap-1 hover:text-primary"
            >
              <ArrowRight className="h-3.5 w-3.5" /> חזרה למידה ועמודים
            </button>
            <p className="text-sm text-muted-foreground">שלב 3 מתוך 4 — עיצוב מוכן</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setCategoryFilter(null)}
                className={`text-xs rounded-full px-3 py-1.5 border ${!categoryFilter ? "border-primary bg-primary/10 text-primary" : "border-primary/10 text-muted-foreground"}`}
              >
                הכל
              </button>
              {ALBUM_TEMPLATE_CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategoryFilter(c)}
                  className={`text-xs rounded-full px-3 py-1.5 border ${categoryFilter === c ? "border-primary bg-primary/10 text-primary" : "border-primary/10 text-muted-foreground"}`}
                >
                  {c}
                </button>
              ))}
            </div>
            {templatesQ.isLoading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            {!templatesQ.isLoading && filteredTemplates.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                אין עדיין עיצובים זמינים לצורה/מספר העמודים האלה — נעדכן בקרוב.
              </p>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              {filteredTemplates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => chooseTemplate(t)}
                  className="text-right rounded-2xl border border-primary/10 bg-card overflow-hidden hover:border-primary transition-colors"
                >
                  {t.thumbnail_url ? (
                    <img src={t.thumbnail_url} alt={t.name} className="w-full h-36 object-cover" />
                  ) : (
                    <div className="w-full h-36 bg-muted flex items-center justify-center text-muted-foreground text-xs">
                      אין תצוגה מקדימה
                    </div>
                  )}
                  <div className="p-3">
                    <div className="font-medium text-primary text-sm">{t.name}</div>
                    {t.category && (
                      <div className="text-xs text-muted-foreground mt-0.5">{t.category}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "editor" && design && selectedTemplate && (
          <div className="space-y-6">
            <button
              onClick={() => setStep("template")}
              className="text-xs text-muted-foreground flex items-center gap-1 hover:text-primary"
            >
              <ArrowRight className="h-3.5 w-3.5" /> חזרה לבחירת עיצוב
            </button>
            <p className="text-sm text-muted-foreground">
              שלב 4 מתוך 4 — העלאת תמונות וכיתובים ({selectedTemplate.name})
            </p>

            {!user && !authLoading && (
              <div className="rounded-2xl border border-blush/40 bg-blush/10 p-4 text-sm space-y-2">
                <p>כדי להעלות תמונות צריך להתחבר — הבחירות שלכם נשמרות ותוכלו להמשיך בדיוק מכאן.</p>
                <Link to="/auth">
                  <Button size="sm" className="rounded-full">
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
                <div
                  key={pageIdx}
                  className="rounded-2xl border border-primary/10 bg-card p-4 space-y-3"
                >
                  <div className="text-xs text-muted-foreground">עמוד {pageIdx + 1}</div>
                  <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-muted">
                    {page.slots.map((slot, slotIdx) => {
                      const rect = rects[slotIdx] ?? { x: 0, y: 0, w: 1, h: 1 };
                      const key = `${pageIdx}-${slotIdx}`;
                      const isUploading = uploadingSlot === key;
                      return (
                        <label
                          key={slotIdx}
                          className="absolute flex items-center justify-center cursor-pointer bg-background/60 hover:bg-background/80 border border-white/40 overflow-hidden"
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
                            <div className="flex flex-col items-center gap-1 text-primary text-xs">
                              <Check className="h-5 w-5" /> הועלה
                            </div>
                          ) : isUploading ? (
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          ) : (
                            <ImagePlus className="h-5 w-5 text-muted-foreground" />
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
                              className="text-[11px] rounded-full border border-primary/10 px-2 py-1 text-muted-foreground hover:border-primary hover:text-primary"
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

            <div className="rounded-2xl border border-primary/10 bg-card p-4 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <Input
                  placeholder="שם מלא"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
                <Input
                  placeholder="טלפון"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">מחיר סופי</span>
                <span className="font-medium text-primary text-lg">{price}₪</span>
              </div>
              <Button
                className="w-full rounded-full gap-2"
                disabled={!user || !complete || submitting}
                onClick={submit}
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                שליחת ההזמנה
              </Button>
              {user && !complete && (
                <p className="text-xs text-muted-foreground text-center">
                  צריך למלא תמונה בכל המשבצות לפני השליחה.
                </p>
              )}
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="rounded-2xl border border-primary/10 bg-card p-8 text-center space-y-3">
            <PartyPopper className="h-10 w-10 text-blush-deep mx-auto" />
            <h2 className="font-display text-2xl text-primary">ההזמנה התקבלה!</h2>
            <p className="text-sm text-muted-foreground">
              הצוות שלנו יבדוק את האלבום ויחזור אליכם בהקדם לתיאום תשלום והדפסה.
            </p>
            <Link to="/account">
              <Button className="rounded-full">לצפייה באזור האישי</Button>
            </Link>
          </div>
        )}
      </section>
      <Footer />
    </div>
  );
}

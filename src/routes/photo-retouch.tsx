import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Upload, Loader2, Download, RotateCcw, Wand2, Lock } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { BeforeAfterSlider } from "@/components/BeforeAfterSlider";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { heError } from "@/lib/he-errors";
import { fileToCompressedDataUrl } from "@/lib/downscale-image";
import { generateRetouchPreview } from "@/lib/retouch.functions";

export const Route = createFileRoute("/photo-retouch")({
  component: PhotoRetouchPage,
  head: () => ({
    meta: [
      { title: "עיבוד תמונות AI | Sweetbaby" },
      {
        name: "description",
        content:
          "העלו תמונה וקבלו תצוגה מקדימה של עריכה אוטומטית בסגנון שבחרתם — ריטוש פנים, רזייה עדינה ועוד, באמצעות בינה מלאכותית.",
      },
      { property: "og:title", content: "עיבוד תמונות AI | Sweetbaby" },
      { property: "og:url", content: "https://sweetbabyphoto.shop/photo-retouch" },
    ],
    links: [{ rel: "canonical", href: "https://sweetbabyphoto.shop/photo-retouch" }],
  }),
});

type Preset = {
  id: string;
  name: string;
  description: string | null;
  before_url: string;
  after_url: string;
};

const SESSION_KEY = "sweetbaby-retouch-session-id";

function getSessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

// The feature is gated to hand-picked clients (managed from "ניהול
// לקוחות"): admins always pass, everyone else needs a row in
// retouch_allowed_clients. This is a UX nicety only — the server function
// enforces the same check independently, so this can't be bypassed by
// skipping straight to the upload step.
type Access = "checking" | "no-user" | "no-access" | "granted";

function PhotoRetouchPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [access, setAccess] = useState<Access>("checking");
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [selected, setSelected] = useState<Preset | null>(null);
  const [uploadPreview, setUploadPreview] = useState<{
    dataUrl: string;
    width: number;
    height: number;
  } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const generate = useServerFn(generateRetouchPreview);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (authLoading) return;
      if (!user) {
        if (mounted) setAccess("no-user");
        return;
      }
      if (isAdmin) {
        if (mounted) setAccess("granted");
        return;
      }
      // retouch_allowed_clients is a new table — cast until the generated
      // Database type (types.ts) picks it up on next generation.
      const { data } = await (supabase as any)
        .from("retouch_allowed_clients")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (mounted) setAccess(data ? "granted" : "no-access");
    })();
    return () => {
      mounted = false;
    };
  }, [user, isAdmin, authLoading]);

  useEffect(() => {
    if (access !== "granted") return;
    let mounted = true;
    (async () => {
      // retouch_presets is a new table — cast until the generated Database
      // type (types.ts) picks it up on next generation.
      const { data, error } = await (supabase as any)
        .from("retouch_presets")
        .select("id, name, description, before_url, after_url")
        .eq("is_active", true)
        .order("sort_order");
      if (!mounted) return;
      if (error) {
        toast.error(heError(error));
        setPresets([]);
        return;
      }
      setPresets((data ?? []) as Preset[]);
    })();
    return () => {
      mounted = false;
    };
  }, [access]);

  const selectPreset = (p: Preset) => {
    setSelected(p);
    setResult(null);
    setUploadPreview(null);
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("יש לבחור קובץ תמונה.");
      return;
    }
    setResult(null);
    try {
      const preview = await fileToCompressedDataUrl(file);
      setUploadPreview(preview);
    } catch (e) {
      toast.error(heError(e));
    }
  };

  const runGenerate = async () => {
    if (!selected || !uploadPreview) return;
    setBusy(true);
    try {
      const { resultDataUrl } = await generate({
        data: {
          presetId: selected.id,
          sessionId: getSessionId(),
          imageDataUrl: uploadPreview.dataUrl,
        },
      });
      setResult(resultDataUrl);
    } catch (e) {
      toast.error(heError(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setUploadPreview(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <section className="container-page py-16 md:py-24">
        <div className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> AI Preview
        </div>
        <h1 className="font-display text-4xl md:text-6xl text-primary">עיבוד תמונות אוטומטי</h1>
        <p className="text-muted-foreground max-w-xl mt-4">
          בחרו סגנון עריכה לדוגמה, העלו תמונה משלכם וקבלו תצוגה מקדימה של אותו סגנון בדיוק — בעריכת
          בינה מלאכותית.
        </p>
        <p className="text-xs text-muted-foreground/80 max-w-xl mt-2">
          התוצאה נוצרת אוטומטית ומיועדת להמחשה בלבד — לעריכה מקצועית ומדויקת פנו לסטודיו.
        </p>

        {access === "checking" && (
          <div className="flex items-center gap-2 text-muted-foreground mt-12">
            <Loader2 className="h-4 w-4 animate-spin" /> בודקים הרשאות...
          </div>
        )}

        {access === "no-user" && (
          <div className="bg-card rounded-3xl border border-primary/5 p-10 md:p-14 text-center mt-12 max-w-lg">
            <Lock className="h-8 w-8 text-primary/50 mx-auto mb-4" />
            <h2 className="font-display text-2xl text-primary mb-2">התכונה זמינה ללקוחות רשומים</h2>
            <p className="text-muted-foreground mb-6">
              עיבוד התמונות האוטומטי פתוח כרגע ללקוחות נבחרים בלבד. התחברו כדי לבדוק אם יש לכם גישה.
            </p>
            <Link to="/auth">
              <Button className="gap-2">התחברות</Button>
            </Link>
          </div>
        )}

        {access === "no-access" && (
          <div className="bg-card rounded-3xl border border-primary/5 p-10 md:p-14 text-center mt-12 max-w-lg">
            <Lock className="h-8 w-8 text-primary/50 mx-auto mb-4" />
            <h2 className="font-display text-2xl text-primary mb-2">התכונה זמינה ללקוחות נבחרים</h2>
            <p className="text-muted-foreground mb-6">
              עדיין לא הוגדרה לכם גישה לתכונה הזו. צרו קשר עם הסטודיו לבדיקת זכאות.
            </p>
            <Link to="/contact">
              <Button variant="outline">יצירת קשר</Button>
            </Link>
          </div>
        )}

        {access === "granted" && (
          <>
            {/* Step 1: pick a preset */}
            <h2 className="font-display text-2xl text-primary mt-12 mb-5">1. בחרו סגנון</h2>
            {presets === null ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> טוען סגנונות...
              </div>
            ) : presets.length === 0 ? (
              <p className="text-muted-foreground">אין כרגע סגנונות זמינים — נסו שוב בקרוב.</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => selectPreset(p)}
                    className={`text-right bg-card rounded-3xl overflow-hidden border transition-shadow ${
                      selected?.id === p.id
                        ? "border-primary shadow-[var(--shadow-card)]"
                        : "border-primary/5 hover:shadow-[var(--shadow-card)]"
                    }`}
                  >
                    <BeforeAfterSlider
                      beforeSrc={p.before_url}
                      afterSrc={p.after_url}
                      className="rounded-none"
                    />
                    <div className="p-4">
                      <div className="font-display text-lg text-primary">{p.name}</div>
                      {p.description && (
                        <div className="text-sm text-muted-foreground mt-1">{p.description}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Step 2: upload + run */}
            {selected && (
              <>
                <h2 className="font-display text-2xl text-primary mt-14 mb-5">2. העלו תמונה</h2>
                <div className="bg-card rounded-3xl border border-primary/5 p-6 md:p-8">
                  {!uploadPreview ? (
                    <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-primary/20 rounded-2xl py-16 cursor-pointer hover:border-primary/40 transition-colors">
                      <Upload className="h-8 w-8 text-primary/60" />
                      <span className="text-muted-foreground">
                        לחצו כדי לבחור תמונה (JPG / PNG)
                      </span>
                      <input
                        ref={inputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => onFile(e.target.files?.[0])}
                      />
                    </label>
                  ) : (
                    <div className="space-y-6">
                      {result ? (
                        <BeforeAfterSlider
                          beforeSrc={uploadPreview.dataUrl}
                          afterSrc={result}
                          aspectRatio={`${uploadPreview.width} / ${uploadPreview.height}`}
                          className="max-w-xl mx-auto"
                        />
                      ) : (
                        <img
                          src={uploadPreview.dataUrl}
                          alt="התמונה שהועלתה"
                          className="max-w-xl w-full mx-auto rounded-2xl border border-primary/10"
                        />
                      )}

                      <div className="flex flex-wrap items-center justify-center gap-3">
                        {!result && (
                          <Button onClick={runGenerate} disabled={busy} className="gap-2">
                            {busy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Wand2 className="h-4 w-4" />
                            )}
                            {busy ? "מעבד... (עד כ-30 שניות)" : `החילו את סגנון "${selected.name}"`}
                          </Button>
                        )}
                        {result && (
                          <a href={result} download="sweetbaby-retouch.jpg">
                            <Button variant="outline" className="gap-2">
                              <Download className="h-4 w-4" /> הורדת התוצאה
                            </Button>
                          </a>
                        )}
                        <Button variant="ghost" onClick={reset} className="gap-2">
                          <RotateCcw className="h-4 w-4" /> תמונה אחרת
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </section>
      <Footer />
    </div>
  );
}

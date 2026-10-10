import { useEffect, useState, type ReactNode } from "react";
import {
  Accessibility,
  X,
  Plus,
  Minus,
  Contrast,
  Palette,
  Link2,
  PauseCircle,
  Type,
  RotateCcw,
} from "lucide-react";

type A11ySettings = {
  textScale: 0 | 1 | 2 | 3; // steps above the site's normal size
  highContrast: boolean;
  grayscale: boolean;
  underlineLinks: boolean;
  stopAnimations: boolean;
  readableFont: boolean;
};

const DEFAULT_SETTINGS: A11ySettings = {
  textScale: 0,
  highContrast: false,
  grayscale: false,
  underlineLinks: false,
  stopAnimations: false,
  readableFont: false,
};

const STORAGE_KEY = "sweetbaby-a11y-settings";

function readSettings(): A11ySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Applies the chosen settings as classes on <html> — see the .a11y-* rules in styles.css for what each one actually does. */
function applySettings(settings: A11ySettings) {
  const root = document.documentElement;
  root.classList.remove("a11y-text-1", "a11y-text-2", "a11y-text-3");
  if (settings.textScale > 0) root.classList.add(`a11y-text-${settings.textScale}`);
  root.classList.toggle("a11y-high-contrast", settings.highContrast);
  root.classList.toggle("a11y-grayscale", settings.grayscale);
  root.classList.toggle("a11y-underline-links", settings.underlineLinks);
  root.classList.toggle("a11y-stop-animations", settings.stopAnimations);
  root.classList.toggle("a11y-readable-font", settings.readableFont);
}

/**
 * A small, always-present accessibility toolbar — required reading in
 * Israel for a service business's website (תקנות שוויון זכויות לאנשים עם
 * מוגבלות, נגישות שירות), not just a nice-to-have. Settings persist in
 * localStorage (per-visitor, never synced anywhere) so a choice made once
 * sticks across the site and across visits.
 *
 * Placed at bottom-right — the ChatBot's own floating button already owns
 * bottom-left — so the two never overlap.
 */
export function AccessibilityWidget() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<A11ySettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const loaded = readSettings();
    setSettings(loaded);
    applySettings(loaded);
  }, []);

  const update = (patch: Partial<A11ySettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      applySettings(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // best-effort only — the toggle still works for this page view either way
      }
      return next;
    });
  };

  const reset = () => update(DEFAULT_SETTINGS);

  return (
    <div dir="rtl" className="fixed bottom-4 right-4 z-[100] font-body sm:bottom-6 sm:right-6">
      {open && (
        <div className="absolute bottom-[calc(100%+12px)] right-0 w-[min(300px,calc(100vw-32px))] rounded-2xl border border-secondary bg-card p-4 shadow-[0_20px_55px_-22px_color-mix(in_oklab,var(--color-primary)_30%,transparent)] animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-sm text-foreground">נגישות</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="סגירת תפריט נגישות"
              className="rounded-full p-1 text-muted-foreground hover:bg-cream"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 rounded-xl bg-cream/50 px-3 py-2">
              <span className="text-sm text-foreground flex items-center gap-2">
                <Type className="h-4 w-4" /> גודל טקסט
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="הקטנת טקסט"
                  disabled={settings.textScale === 0}
                  onClick={() => update({ textScale: Math.max(0, settings.textScale - 1) as A11ySettings["textScale"] })}
                  className="h-7 w-7 rounded-full border border-border flex items-center justify-center disabled:opacity-30"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="הגדלת טקסט"
                  disabled={settings.textScale === 3}
                  onClick={() => update({ textScale: Math.min(3, settings.textScale + 1) as A11ySettings["textScale"] })}
                  className="h-7 w-7 rounded-full border border-border flex items-center justify-center disabled:opacity-30"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <ToggleRow
              icon={<Contrast className="h-4 w-4" />}
              label="ניגודיות גבוהה"
              checked={settings.highContrast}
              onChange={(v) => update({ highContrast: v })}
            />
            <ToggleRow
              icon={<Palette className="h-4 w-4" />}
              label="גווני אפור"
              checked={settings.grayscale}
              onChange={(v) => update({ grayscale: v })}
            />
            <ToggleRow
              icon={<Link2 className="h-4 w-4" />}
              label="הדגשת קישורים"
              checked={settings.underlineLinks}
              onChange={(v) => update({ underlineLinks: v })}
            />
            <ToggleRow
              icon={<PauseCircle className="h-4 w-4" />}
              label="עצירת אנימציות"
              checked={settings.stopAnimations}
              onChange={(v) => update({ stopAnimations: v })}
            />
            <ToggleRow
              icon={<Type className="h-4 w-4" />}
              label="גופן קריא"
              checked={settings.readableFont}
              onChange={(v) => update({ readableFont: v })}
            />
          </div>

          <button
            type="button"
            onClick={reset}
            className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-xs text-muted-foreground hover:bg-cream"
          >
            <RotateCcw className="h-3.5 w-3.5" /> איפוס הגדרות
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="פתיחת תפריט נגישות"
        aria-expanded={open}
        className="flex items-center justify-center h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-[0_12px_30px_-10px_color-mix(in_oklab,var(--color-ink)_42%,transparent)] hover:scale-105 active:scale-95 transition-transform"
      >
        <Accessibility className="h-6 w-6" />
      </button>
    </div>
  );
}

function ToggleRow({
  icon,
  label,
  checked,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={`w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
        checked ? "bg-primary text-primary-foreground" : "bg-cream/50 text-foreground hover:bg-cream"
      }`}
    >
      <span className="flex items-center gap-2">
        {icon} {label}
      </span>
      <span
        className={`h-4 w-4 rounded-full border-2 ${checked ? "bg-white border-white" : "border-current"}`}
      />
    </button>
  );
}

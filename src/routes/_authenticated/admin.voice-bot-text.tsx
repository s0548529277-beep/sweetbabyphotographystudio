import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getBotVoiceGender,
  getNoAiBookingMode,
  getThinkingFillerEnabled,
  getThinkingFillerMusicId,
  getVoiceMenuMode,
  listNoAiBookingSessions,
  listVoiceBotPhrases,
  resetVoiceBotPhrase,
  setBotVoiceGender,
  setNoAiBookingMode,
  setThinkingFillerEnabled,
  setThinkingFillerMusicId,
  setVoiceMenuMode,
  updateVoiceBotPhrase,
  type NoAiBookingSessionRow,
  type VoiceBotPhraseRow,
} from "@/lib/admin-voice-phrases.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Mic, RotateCcw, Save, Sparkles, ListChecks, PhoneCall, CalendarCheck2, Keyboard, MicOff, VenusAndMars, User, UserRound, Timer, TimerOff, Volume2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/voice-bot-text")({
  component: VoiceBotTextAdmin,
});

// The only phrases whose live routing is skipped in "ai" menu mode — the
// keyword-menu branches that used to read them straight out (see
// MENU_MODE_KEY's doc comment in voice-phrases.server.ts). Every other
// phrase (greeting, menu_prompt, leave_message_*, didnt_hear,
// no_human_transfer, temporary_error, final_error_hangup) is spoken
// regardless of mode, so it isn't listed here.
const FIXED_MODE_ONLY_KEYS = new Set(["studio_blurb", "props_blurb", "arrival_spoken", "guide_choice_prompt", "full_guide_spoken"]);

function PhraseCard({ row, menuMode }: { row: VoiceBotPhraseRow; menuMode: "ai" | "fixed" }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(row.value);
  const [saving, setSaving] = useState(false);
  const doUpdate = useServerFn(updateVoiceBotPhrase);
  const doReset = useServerFn(resetVoiceBotPhrase);
  const changed = draft !== row.value;
  const inactive = menuMode === "ai" && FIXED_MODE_ONLY_KEYS.has(row.key);

  const save = async () => {
    setSaving(true);
    try {
      await doUpdate({ data: { key: row.key, value: draft } });
      toast.success("נשמר — עכשיו יעבוד ישירות בשיחות הבאות");
      qc.invalidateQueries({ queryKey: ["admin-voice-bot-phrases"] });
    } catch (e: any) {
      toast.error(e?.message ?? "השמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!confirm("לאפס לניסוח המקורי?")) return;
    setSaving(true);
    try {
      await doReset({ data: { key: row.key } });
      toast.success("אופס לברירת המחדל");
      qc.invalidateQueries({ queryKey: ["admin-voice-bot-phrases"] });
    } catch (e: any) {
      toast.error(e?.message ?? "האיפוס נכשל");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-primary/5 p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium text-primary text-sm">{row.label}</div>
        <div className="flex gap-1.5 shrink-0">
          {inactive && (
            <span className="text-[11px] bg-muted text-muted-foreground rounded-full px-2 py-0.5" title='לא נשמע כרגע — מצב "תשובות חכמות מהבינה" פעיל, הבינה עונה על זה בעצמה'>
              לא בשימוש כרגע
            </span>
          )}
          {!row.isDefault && <span className="text-[11px] bg-blush/40 text-primary rounded-full px-2 py-0.5">מותאם אישית</span>}
        </div>
      </div>
      <Textarea
        dir="rtl"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={row.value.length > 200 ? 8 : 2}
        className="text-sm leading-relaxed"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{draft.length} תווים</span>
        <div className="flex gap-2">
          {!row.isDefault && (
            <Button size="sm" variant="ghost" className="rounded-full gap-1.5" disabled={saving} onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" /> איפוס לברירת מחדל
            </Button>
          )}
          <Button size="sm" className="rounded-full gap-1.5" disabled={saving || !changed || !draft.trim()} onClick={save}>
            <Save className="h-3.5 w-3.5" /> שמירה
          </Button>
        </div>
      </div>
    </div>
  );
}

function MenuModeCard() {
  const qc = useQueryClient();
  const fetchMode = useServerFn(getVoiceMenuMode);
  const doSetMode = useServerFn(setVoiceMenuMode);
  const q = useQuery({ queryKey: ["admin-voice-menu-mode"], queryFn: () => fetchMode({}) });
  const [saving, setSaving] = useState(false);
  const mode = q.data ?? "ai";

  const choose = async (next: "ai" | "fixed") => {
    if (next === mode || saving) return;
    setSaving(true);
    try {
      await doSetMode({ data: { mode: next } });
      toast.success(next === "ai" ? "עבר למצב תשובות חכמות מהבינה" : "חזר למצב תפריט קבוע");
      qc.invalidateQueries({ queryKey: ["admin-voice-menu-mode"] });
    } catch (e: any) {
      toast.error(e?.message ?? "השמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-primary/5 p-4 space-y-3">
      <div className="font-medium text-primary text-sm">איך הבוט עונה אחרי הברכה הפותחת</div>
      <div className="grid sm:grid-cols-2 gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => choose("ai")}
          className={`text-right rounded-xl border p-3 transition-colors ${
            mode === "ai" ? "border-primary bg-primary/5" : "border-primary/10 hover:bg-cream"
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-medium text-primary mb-1">
            <Sparkles className="h-4 w-4 text-blush-deep" /> תשובות חכמות מהבינה (ברירת מחדל)
          </div>
          <p className="text-xs text-muted-foreground">
            כל שאלה — כולל השכרת סטודיו, אביזרים, דרכי הגעה והדרכה — נענית ישירות ע"י הבינה, בלי תפריט קבוע. יותר טבעי, אבל כל תשובה עוברת דרך הבינה.
          </p>
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => choose("fixed")}
          className={`text-right rounded-xl border p-3 transition-colors ${
            mode === "fixed" ? "border-primary bg-primary/5" : "border-primary/10 hover:bg-cream"
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-medium text-primary mb-1">
            <ListChecks className="h-4 w-4 text-blush-deep" /> תפריט קבוע (המצב הקודם)
          </div>
          <p className="text-xs text-muted-foreground">
            שאלות נפוצות (הגעה, הדרכה, מחירון, השארת הודעה) נענות מיידית מהטקסטים למטה — בלי הבינה בכלל. מהיר וחינמי, אבל פחות גמיש.
          </p>
        </button>
      </div>
      {q.isLoading && <p className="text-xs text-muted-foreground">טוען מצב נוכחי…</p>}
    </div>
  );
}

function BotVoiceGenderCard() {
  const qc = useQueryClient();
  const fetchGender = useServerFn(getBotVoiceGender);
  const doSetGender = useServerFn(setBotVoiceGender);
  const q = useQuery({ queryKey: ["admin-bot-voice-gender"], queryFn: () => fetchGender({}) });
  const [saving, setSaving] = useState(false);
  const gender = q.data ?? "female";

  const choose = async (next: "male" | "female") => {
    if (next === gender || saving) return;
    setSaving(true);
    try {
      await doSetGender({ data: { gender: next } });
      toast.success("נשמר — הבוט ידבר על עצמו בלשון הזו כבר בשיחה הבאה");
      qc.invalidateQueries({ queryKey: ["admin-bot-voice-gender"] });
    } catch (e: any) {
      toast.error(e?.message ?? "השמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-primary">
        <VenusAndMars className="h-4 w-4 text-blush-deep" /> באיזו לשון הבוט מדבר על עצמו
      </div>
      <p className="text-xs text-muted-foreground">
        קובע רק את הניסוח הדקדוקי (זכר/נקבה) שהבוט משתמש בו כשהוא מתאר את עצמו — למשל "בודקת" מול "בודק", "מצטערת" מול "מצטער". זה{" "}
        <strong>לא</strong> משנה איך הקול עצמו נשמע (גבוה/נמוך, "כמו גבר/אישה") — הצליל של הקול הוא הגדרה של ימות המשיח עצמה, לא של האתר, ואם הוא
        משתנה תוך כדי שיחה זה צריך להיבדק שם, מול התמיכה של ימות. עד עכשיו הניסוח לא היה עקבי (חלק מההנחיות לבינה היו כתובות בלשון זכר וחלק בלשון
        נקבה בערבוביה) — זה תוקן, וברירת המחדל היא לשון נקבה.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => choose("female")}
          className={`text-right rounded-xl border p-3 transition-colors ${
            gender === "female" ? "border-primary bg-primary/5" : "border-primary/10 hover:bg-cream"
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-medium text-primary mb-1">
            <UserRound className="h-4 w-4 text-blush-deep" /> לשון נקבה (ברירת מחדל)
          </div>
          <p className="text-xs text-muted-foreground">"אני בודקת", "אני מצטערת", "שמרתי לך"</p>
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => choose("male")}
          className={`text-right rounded-xl border p-3 transition-colors ${
            gender === "male" ? "border-primary bg-primary/5" : "border-primary/10 hover:bg-cream"
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-medium text-primary mb-1">
            <User className="h-4 w-4 text-blush-deep" /> לשון זכר
          </div>
          <p className="text-xs text-muted-foreground">"אני בודק", "אני מצטער", "שמרתי לך"</p>
        </button>
      </div>
      {q.isLoading && <p className="text-xs text-muted-foreground">טוען מצב נוכחי…</p>}
    </div>
  );
}

function ThinkingFillerCard() {
  const qc = useQueryClient();
  const fetchMode = useServerFn(getThinkingFillerEnabled);
  const doSetMode = useServerFn(setThinkingFillerEnabled);
  const fetchMusicId = useServerFn(getThinkingFillerMusicId);
  const doSetMusicId = useServerFn(setThinkingFillerMusicId);
  const q = useQuery({ queryKey: ["admin-thinking-filler"], queryFn: () => fetchMode({}) });
  const musicQ = useQuery({ queryKey: ["admin-thinking-filler-music"], queryFn: () => fetchMusicId({}) });
  const [saving, setSaving] = useState(false);
  const [musicDraft, setMusicDraft] = useState<string | null>(null);
  const [savingMusic, setSavingMusic] = useState(false);
  const mode = q.data ?? "on";
  const musicId = musicDraft ?? musicQ.data ?? "";

  const choose = async (next: "on" | "off") => {
    if (next === mode || saving) return;
    setSaving(true);
    try {
      await doSetMode({ data: { mode: next } });
      toast.success(next === "on" ? "הופעל" : "כובה, חוזר לשקט עד שהתשובה מוכנה");
      qc.invalidateQueries({ queryKey: ["admin-thinking-filler"] });
    } catch (e: any) {
      toast.error(e?.message ?? "השמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  const saveMusic = async () => {
    setSavingMusic(true);
    try {
      await doSetMusicId({ data: { musicId } });
      toast.success(musicId ? "נשמר — יתווסף צליל קצר לפני המילים" : "נשמר — בלי צליל, רק המילים");
      qc.invalidateQueries({ queryKey: ["admin-thinking-filler-music"] });
      setMusicDraft(null);
    } catch (e: any) {
      toast.error(e?.message ?? "השמירה נכשלה");
    } finally {
      setSavingMusic(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-primary">
        <Timer className="h-4 w-4 text-blush-deep" /> מענה מיידי בזמן שהבינה "חושבת" (קו ימות המשיח בלבד)
      </div>
      <p className="text-xs text-muted-foreground">
        כשהבינה עונה (לא תפריט קבוע), היא לפעמים לוקחת כמה שניות — הלקוחה שומעת שקט מוחלט בזמן הזה, כי ימות לא אומר כלום עד שהתשובה
        המלאה מוכנה. במצב "מופעל" (ברירת המחדל), הבוט אומר מיד "רגע אחד..." (אפשר לערוך את הניסוח למטה, בשורה "מילת המתנה") ורק
        אחר כך ממשיך לתשובה האמיתית — כך שיש קול מיידי במקום שקט. <strong>הזמן הכולל עד לתשובה עצמה לא משתנה</strong>, רק השקט
        מתמלא. משפיע רק על קו ימות המשיח (בטלפון של Twilio אין שקט כזה מלכתחילה).
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => choose("on")}
          className={`text-right rounded-xl border p-3 transition-colors ${
            mode === "on" ? "border-primary bg-primary/5" : "border-primary/10 hover:bg-cream"
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-medium text-primary mb-1">
            <Timer className="h-4 w-4 text-blush-deep" /> מופעל (ברירת מחדל)
          </div>
          <p className="text-xs text-muted-foreground">אומר "רגע אחד..." מיד, לפני התשובה עצמה.</p>
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => choose("off")}
          className={`text-right rounded-xl border p-3 transition-colors ${
            mode === "off" ? "border-primary bg-primary/5" : "border-primary/10 hover:bg-cream"
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-medium text-primary mb-1">
            <TimerOff className="h-4 w-4 text-blush-deep" /> כבוי
          </div>
          <p className="text-xs text-muted-foreground">ההתנהגות הקודמת — שקט עד שהתשובה מוכנה.</p>
        </button>
      </div>
      {q.isLoading && <p className="text-xs text-muted-foreground">טוען מצב נוכחי…</p>}

      <div className="pt-2 border-t border-primary/5 space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-primary">
          <Volume2 className="h-3.5 w-3.5 text-blush-deep" /> צליל/מוזיקה קצרה לפני "רגע אחד..." (אופציונלי)
        </div>
        <p className="text-xs text-muted-foreground">
          זה לא קובץ שאפשר להעלות מכאן — זה מזהה של קובץ מוזיקה/צליל שכבר קיים <strong>במערכת ימות המשיח עצמה</strong> (בממשק
          הניהול של ימות, תחת קבצי מערכת/מוזיקה — לא באתר הזה). אם יש לך מזהה כזה, אפשר להדביק אותו כאן כדי שיתווסף צליל קצר לפני
          המילים. אם לא בטוחים או שאין — עדיף להשאיר ריק, כדי לא לגרום לרעש לא צפוי בשיחה אמיתית.
        </p>
        <div className="flex gap-2">
          <Input
            dir="ltr"
            placeholder="למשל: 1 (ריק = בלי צליל)"
            value={musicId}
            onChange={(e) => setMusicDraft(e.target.value)}
            className="text-sm"
          />
          <Button size="sm" className="rounded-full gap-1.5 shrink-0" disabled={savingMusic || musicQ.isLoading} onClick={saveMusic}>
            <Save className="h-3.5 w-3.5" /> שמירה
          </Button>
        </div>
      </div>
    </div>
  );
}

const NB_MODE_OPTIONS: Array<{ value: "off" | "speech" | "dtmf"; icon: typeof PhoneCall; title: string; desc: string }> = [
  { value: "off", icon: MicOff, title: "כבוי", desc: 'אם הבינה נכשלת שוב ושוב, או שנאמר "הזמנת סטודיו" במצב תפריט קבוע — חוזר להתנהגות הקודמת (הצעה להשאיר הודעה / המתנה לבינה), בלי תהליך שריון עצמאי.' },
  { value: "speech", icon: PhoneCall, title: "בדיבור (ברירת מחדל)", desc: "כל שאלה (תאריך, שעה, משך, מייל) נענית בקול חופשי, ומפוענחת לפי מילות מפתח." },
  { value: "dtmf", icon: Keyboard, title: "בהקלדה במקלדת הטלפון", desc: "תאריך/שעה/משך/אישור סופי מוקשים במקלדת — פורמט תאריך: יום חודש שנה (8 ספרות). פורמט שעה: 24 שעות (4 ספרות). שם ומייל עדיין בקול." },
];

function NoAiBookingCard() {
  const qc = useQueryClient();
  const fetchMode = useServerFn(getNoAiBookingMode);
  const doSetMode = useServerFn(setNoAiBookingMode);
  const q = useQuery({ queryKey: ["admin-noai-booking-mode"], queryFn: () => fetchMode({}) });
  const [saving, setSaving] = useState(false);
  const mode = q.data ?? "speech";

  const choose = async (next: "off" | "speech" | "dtmf") => {
    if (next === mode || saving) return;
    setSaving(true);
    try {
      await doSetMode({ data: { mode: next } });
      toast.success("נשמר");
      qc.invalidateQueries({ queryKey: ["admin-noai-booking-mode"] });
    } catch (e: any) {
      toast.error(e?.message ?? "השמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-primary/5 p-4 space-y-3">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <PhoneCall className="h-4 w-4 text-blush-deep" /> שריון סטודיו בשאלות קבועות (בלי בינה בכלל)
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          מופעל אוטומטית: אם המתקשרת אומרת שהיא רוצה לשריין ובמצב "תפריט קבוע", או אם הבינה נכשלת שוב ושוב באמצע שיחה שנראית כמו הזמנה — הבוט עובר לשאול שם/תאריך/שעה/משך/מייל אחד אחרי השני ושומר שריון אמיתי, בלי לגעת בבינה בכלל.
        </p>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        {NB_MODE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={saving}
            onClick={() => choose(opt.value)}
            className={`text-right rounded-xl border p-3 transition-colors ${
              mode === opt.value ? "border-primary bg-primary/5" : "border-primary/10 hover:bg-cream"
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-medium text-primary mb-1">
              <opt.icon className="h-4 w-4 text-blush-deep" /> {opt.title}
            </div>
            <p className="text-xs text-muted-foreground">{opt.desc}</p>
          </button>
        ))}
      </div>
      {q.isLoading && <p className="text-xs text-muted-foreground">טוען מצב נוכחי…</p>}
    </div>
  );
}

const NB_STAGE_LABELS: Record<string, string> = {
  nb_name: "עצרה בשאלת השם",
  nb_date: "עצרה בשאלת התאריך",
  nb_ampm: "עצרה בשאלת בוקר/ערב",
  nb_time: "עצרה בשאלת השעה",
  nb_duration: "עצרה בשאלת משך הזמן",
  nb_email: "עצרה בשאלת המייל",
  nb_confirm: "עצרה באישור הסופי",
};

function draftSummary(draft: Record<string, unknown> | null): string {
  if (!draft) return "";
  const parts: string[] = [];
  if (draft.name) parts.push(`שם: ${draft.name}`);
  if (draft.date) parts.push(`תאריך: ${draft.date}`);
  if (draft.hour !== undefined && draft.hour !== null) parts.push(`שעה: ${String(draft.hour).padStart(2, "0")}:${String(draft.minute ?? 0).padStart(2, "0")}`);
  if (draft.slots) parts.push(`משך: ${(draft.slots as number) / 2} שעות`);
  if (draft.email) parts.push(`מייל: ${draft.email}`);
  return parts.join(" · ") || "עדיין לא נאסף מידע";
}

function NoAiBookingSessionsCard() {
  const fetchSessions = useServerFn(listNoAiBookingSessions);
  const q = useQuery({ queryKey: ["admin-noai-booking-sessions"], queryFn: () => fetchSessions({}) });
  const rows = (q.data ?? []) as NoAiBookingSessionRow[];
  const inProgress = rows.filter((r) => r.stage.startsWith("nb_"));
  const finished = rows.filter((r) => !r.stage.startsWith("nb_"));

  return (
    <div className="bg-card rounded-2xl border border-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-primary">
        <CalendarCheck2 className="h-4 w-4 text-blush-deep" /> שיחות בתהליך השריון הקבוע — 50 האחרונות
      </div>
      <p className="text-xs text-muted-foreground">
        שריון שהושלם בהצלחה נראה כרגיל ברשימת ההזמנות. הרשימה הזו נועדה לאתר מי התחילה תהליך ולא סיימה (למשל נתקעה על שאלה) — שווה חזרה טלפונית.
      </p>
      {q.isLoading && <p className="text-xs text-muted-foreground">טוען…</p>}
      {!q.isLoading && rows.length === 0 && <p className="text-xs text-muted-foreground">אין עדיין שיחות דרך התהליך הזה.</p>}
      {inProgress.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-medium text-blush-deep">באמצע התהליך / לא הושלם ({inProgress.length})</div>
          {inProgress.map((r) => (
            <div key={r.callSid} className="rounded-xl border border-blush/40 bg-blush/10 p-3 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span dir="ltr" className="font-medium text-primary">{r.phone || "מספר לא ידוע"}</span>
                <span className="text-muted-foreground">{new Date(r.updatedAt).toLocaleString("he-IL")}</span>
              </div>
              <div className="text-muted-foreground">{NB_STAGE_LABELS[r.stage] ?? r.stage}</div>
              <div className="text-muted-foreground">{draftSummary(r.draft)}</div>
            </div>
          ))}
        </div>
      )}
      {finished.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-medium text-muted-foreground">יצאו מהתהליך (הושלם/בוטל) ({finished.length})</div>
          {finished.map((r) => (
            <div key={r.callSid} className="rounded-xl border border-primary/5 p-3 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span dir="ltr" className="font-medium text-primary">{r.phone || "מספר לא ידוע"}</span>
                <span className="text-muted-foreground">{new Date(r.updatedAt).toLocaleString("he-IL")}</span>
              </div>
              <div className="text-muted-foreground">{draftSummary(r.draft)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VoiceBotTextAdmin() {
  const fetchPhrases = useServerFn(listVoiceBotPhrases);
  const fetchMode = useServerFn(getVoiceMenuMode);
  const q = useQuery({ queryKey: ["admin-voice-bot-phrases"], queryFn: () => fetchPhrases({}) });
  // Same queryKey as MenuModeCard's own query — React Query dedupes/shares
  // the cache, so this doesn't cost a second network round trip.
  const modeQ = useQuery({ queryKey: ["admin-voice-menu-mode"], queryFn: () => fetchMode({}) });
  const rows = (q.data ?? []) as VoiceBotPhraseRow[];
  const menuMode = modeQ.data ?? "ai";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="font-display text-xl text-primary mb-1 flex items-center gap-2">
          <Mic className="h-5 w-5" /> מלל בוט הטלפון
        </h2>
        <p className="text-sm text-muted-foreground">
          כל מה שהבוט הקולי (שני הקווים) אומר בקול, מילה במילה. עריכה כאן משנה מיד מה שנשמע בשיחה הבאה — בלי צורך בפריסה מחדש.
          הניקוד (הסימנים מעל ומתחת לאותיות) עוזר להקראה נכונה — עדיף לא למחוק אותו כשעורכים.
        </p>
      </div>

      <div className="space-y-3">
        <div className="pt-1">
          <h3 className="text-sm font-semibold text-primary">אפשרויות התנהגות הבוט</h3>
          <p className="text-xs text-muted-foreground">ארבע הגדרות נפרדות — כל אחת עומדת בפני עצמה, בכרטיס משלה, עם הסבר מלא מתחת לאפשרויות.</p>
        </div>
        <MenuModeCard />
        <NoAiBookingCard />
        <BotVoiceGenderCard />
        <ThinkingFillerCard />
      </div>

      <NoAiBookingSessionsCard />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-primary pt-1">כל משפט שהבוט אומר (לעריכה חופשית)</h3>
        {rows.map((row) => (
          // Remount whenever the resolved value changes (after a save or
          // reset elsewhere/refetch) so local draft state can't go stale.
          <PhraseCard key={`${row.key}:${row.value}`} row={row} menuMode={menuMode} />
        ))}
        {q.isLoading && <p className="text-sm text-muted-foreground text-center py-10">טוען…</p>}
      </div>
    </div>
  );
}

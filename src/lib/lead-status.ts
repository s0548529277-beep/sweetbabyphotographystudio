// Stages of an inquiry lead (public.inquiry_leads.status). One list for the admin screen and the digest mail buttons.
export const LEAD_STAGES: { key: string; label: string; cls: string }[] = [
  { key: "new", label: "חדשה – לא נענתה", cls: "bg-rose-100 text-rose-800" },
  { key: "replied", label: "נענתה", cls: "bg-sky-100 text-sky-800" },
  { key: "in_talk", label: "בשיחה", cls: "bg-violet-100 text-violet-800" },
  { key: "follow_up", label: "נשלח מעקב", cls: "bg-amber-100 text-amber-800" },
  { key: "booked", label: "סגרה ✓", cls: "bg-emerald-100 text-emerald-800" },
  { key: "not_relevant", label: "לא רלוונטי", cls: "bg-stone-200 text-stone-600" },
];
export const LEAD_STATUS_KEYS = LEAD_STAGES.map((s) => s.key);
export const leadStageLabel = (k: string) => LEAD_STAGES.find((s) => s.key === k)?.label ?? k;
/** Stages that are still "open" (not closed and not dropped). */
export const OPEN_LEAD_STAGES = ["new", "replied", "in_talk", "follow_up"];

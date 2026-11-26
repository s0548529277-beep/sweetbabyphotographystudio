import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { he } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import {
  listNewbornOrders,
  createNewbornOrder,
  toggleNewbornOrderStep,
  updateNewbornOrderContact,
  updateNewbornOrderPayment,
  markNewbornGalleryOpened,
  deleteNewbornOrder,
  sendNewbornPaymentReminderEmails,
} from "@/lib/newborn-orders.functions";
import {
  listNewbornPackageTypes,
  saveNewbornPackageType,
  deleteNewbornPackageType,
} from "@/lib/newborn-package-types.functions";
import {
  NEWBORN_PACKAGES,
  NEWBORN_PACKAGE_CATEGORIES,
  NEWBORN_ADDONS,
  findNewbornPackage,
} from "@/lib/newborn-packages";
import { heError } from "@/lib/he-errors";
import { supabase } from "@/integrations/supabase/client";
import {
  CM_SETTINGS_KEY,
  parseCmSettings,
  ymd,
  formatDateIL,
} from "@/lib/client-management";
import { HebrewCalendar, type CalendarItem } from "@/components/client-management/CalendarTab";
import { SettingsTab } from "@/components/client-management/SettingsTab";
import { DateHints, confirmRestDay } from "@/components/client-management/DateHints";
import {
  Baby,
  Plus,
  Trash2,
  Check,
  Circle,
  CalendarDays,
  Loader2,
  Images,
  List,
  CalendarRange,
  LayoutDashboard,
  Wallet,
  Wallet2,
  Clock,
  CalendarCheck2,
  Table2,
  Gift,
  X as XIcon,
  Settings as SettingsIcon,
  Search,
  Download,
  ArrowRight,
} from "lucide-react";

import {
  listPhotoClients,
  sendPaymentReminderEmails,
  updatePhotoClientPayment,
  PHOTO_PACKAGES,
} from "@/lib/photo-clients.functions";
import {
  toggleOutdoorOrderStep,
  updateOutdoorOrderPayment,
  sendOutdoorPaymentReminderEmails,
} from "@/lib/outdoor-orders.functions";
import { sendOutdoorContract } from "@/lib/outdoor-packages.functions";
import {
  listStudioCustomOrders,
  deleteStudioCustomOrder,
  updateStudioCustomOrderPayment,
  toggleStudioCustomOrderStep,
} from "@/lib/studio-custom-orders.functions";
import {
  HUB_KINDS,
  hubBalance,
  hubKind,
  generalToHub,
  newbornToHub,
  outdoorToHub,
  sortHubRows,
  studioToHub,
  type HubFilter,
  type HubKind,
  type HubRow,
} from "@/lib/client-hub";
import {
  HubCalendarView,
  HubDashboardView,
  HubKindChooser,
  HubPaymentsView,
  HubTableView,
  GeneralHubCard,
  NewbornHubCard,
  OutdoorHubCard,
  StudioHubCard,
  generalServiceLabel,
} from "@/components/client-hub/HubViews";
import { OutdoorOrderDialog, StudioOrderDialog, type ClientPrefill } from "@/components/client-hub/HubDialogs";
import { GeneralClientDialog } from "@/components/client-hub/GeneralClientDialog";
import { OutdoorPackageTypesSection } from "@/components/client-hub/OutdoorPackageTypes";

const FILTER_KEYS = ["all", "newborn", "outdoor", "studio", "general"] as const;

export const Route = createFileRoute("/_authenticated/admin/newborn-packages")({
  // ?kind=… opens the page already filtered (the old /admin/photo-clients and /admin/outdoor-packages
  // links redirect here). "send" (the old "send photos only" tab) is now part of the general kind.
  // ?fromLead=<inquiry_leads id> (the "כבר לקוחה — פתיחת כרטיס לקוח" button of the lead mails and /admin/leads) opens the
  // new-client flow with that lead's name / phone / e-mail already filled in.
  validateSearch: (search: Record<string, unknown>): { kind?: HubFilter; fromLead?: string } => {
    const k = search.kind === "send" ? "general" : search.kind;
    const out: { kind?: HubFilter; fromLead?: string } = {};
    if (FILTER_KEYS.includes(k as any) && k !== "all") out.kind = k as HubFilter;
    if (typeof search.fromLead === "string" && /^[0-9a-f-]{36}$/i.test(search.fromLead)) out.fromLead = search.fromLead;
    return out;
  },
  component: NewbornPackagesAdmin,
});

type OrderRow = {
  id: string;
  package_id: string;
  addons: { id: string; label: string; price: number }[];
  base_price: number;
  addons_price: number;
  total_price: number;
  amount_paid: number;
  last_payment_at: string | null;
  gallery_opened_at: string | null;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  session_date: string | null;
  session_time: string | null;
  birth_basket_used: boolean;
  session_place?: string | null;
  notes: string | null;
  created_at: string;
  [key: string]: any; // ${step.key}_at columns
};

const emptyCreateForm = {
  package_id: "",
  addon_ids: [] as string[],
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  session_date: "",
  session_time: "",
  birth_basket_used: false,
  session_place: "studio" as "studio" | "home",
  notes: "",
};

type EditForm = {
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  session_date: string;
  session_time: string;
  birth_basket_used: boolean;
  session_place: "studio" | "home";
  notes: string;
  total_price: string;
};

function toEditForm(o: OrderRow): EditForm {
  return {
    contact_name: o.contact_name,
    contact_phone: o.contact_phone,
    contact_email: o.contact_email ?? "",
    session_date: o.session_date ?? "",
    session_time: o.session_time ?? "",
    birth_basket_used: !!o.birth_basket_used,
    session_place: o.session_place === "home" ? "home" : "studio",
    notes: o.notes ?? "",
    total_price: o.total_price != null ? String(o.total_price) : "",
  };
}

function NewbornPackagesAdmin() {
  // /admin/newborn-packages/$orderId (its own gallery-management page) is a
  // *child* route of this list page in the router tree — TanStack Router
  // only mounts a child route's component into an <Outlet/> placed by its
  // parent, so without this guard the list kept rendering itself no matter
  // the URL (same fix already applied to /admin/photo-clients, see its own
  // matching comment).
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isDetail = pathname !== "/admin/newborn-packages";

  const qc = useQueryClient();
  const nav = useNavigate();
  const fetchOrders = useServerFn(listNewbornOrders);
  const runCreate = useServerFn(createNewbornOrder);
  const runToggle = useServerFn(toggleNewbornOrderStep);
  const runUpdateContact = useServerFn(updateNewbornOrderContact);
  const runDelete = useServerFn(deleteNewbornOrder);
  const runUpdatePayment = useServerFn(updateNewbornOrderPayment);
  const runMarkGalleryOpened = useServerFn(markNewbornGalleryOpened);

  const orders = useQuery({
    queryKey: ["newborn-orders"],
    queryFn: () => fetchOrders({}),
    enabled: !isDetail,
  });
  const rows = (orders.data ?? []) as OrderRow[];

  const [view, setView] = useState<
    "dashboard" | "list" | "table" | "hebcal" | "calendar" | "payments" | "packages" | "settings"
  >("dashboard");
  const [search, setSearch] = useState("");
  const cmSettings = useQuery({
    queryKey: ["cm-settings"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("app_settings")
        .select("value")
        .eq("key", CM_SETTINGS_KEY)
        .maybeSingle();
      return parseCmSettings(data?.value);
    },
    enabled: !isDetail,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [saving, setSaving] = useState(false);
  const [busyStep, setBusyStep] = useState<string | null>(null); // `${orderId}:${stepKey}`
  const [openingGalleryId, setOpeningGalleryId] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<OrderRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // ---- the other two kinds (outdoor = חום, custom studio = בז') ----
  const searchKind = Route.useSearch().kind;
  const [kindFilter, setKindFilter] = useState<HubFilter>(searchKind ?? "all");
  // Coming back from a client page (or an old link) with ?kind=… re-applies that filter even though this
  // component stayed mounted behind the child route.
  useEffect(() => {
    if (searchKind) setKindFilter(searchKind);
  }, [searchKind]);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [chooserDate, setChooserDate] = useState<string | undefined>(undefined);
  const [outdoorDialog, setOutdoorDialog] = useState<{ open: boolean; initial: any | null; date?: string; prefill?: ClientPrefill | null }>({
    open: false,
    initial: null,
  });
  const [studioDialog, setStudioDialog] = useState<{ open: boolean; initial: any | null; date?: string; prefill?: ClientPrefill | null }>({
    open: false,
    initial: null,
  });
  const [generalDialog, setGeneralDialog] = useState<{ open: boolean; date?: string; prefill?: ClientPrefill | null }>({ open: false });
  // A lead that turned out to be a customer: her details wait here until the kind of card is picked.
  const [leadPrefill, setLeadPrefill] = useState<ClientPrefill | null>(null);
  const [busyHubStep, setBusyHubStep] = useState<string | null>(null);
  const [sendingContractId, setSendingContractId] = useState<string | null>(null);
  const runToggleOutdoorStep = useServerFn(toggleOutdoorOrderStep);
  const runOutdoorPayment = useServerFn(updateOutdoorOrderPayment);
  const runOutdoorReminders = useServerFn(sendOutdoorPaymentReminderEmails);
  const runSendOutdoorContract = useServerFn(sendOutdoorContract);
  const fetchStudioOrders = useServerFn(listStudioCustomOrders);
  const runDeleteStudio = useServerFn(deleteStudioCustomOrder);
  const runStudioPayment = useServerFn(updateStudioCustomOrderPayment);
  const runToggleStudioStep = useServerFn(toggleStudioCustomOrderStep);
  const runNewbornReminders = useServerFn(sendNewbornPaymentReminderEmails);
  const fetchPhotoClients = useServerFn(listPhotoClients);
  const runGeneralPayment = useServerFn(updatePhotoClientPayment);
  const runGeneralReminders = useServerFn(sendPaymentReminderEmails);

  const outdoorOrders = useQuery({
    queryKey: ["admin-outdoor-orders"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("outdoor_package_orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !isDetail,
  });
  const studioOrders = useQuery({
    queryKey: ["studio-custom-orders"],
    queryFn: () => fetchStudioOrders({}),
    enabled: !isDetail,
  });

  const generalClients = useQuery({
    queryKey: ["photo-clients"],
    queryFn: () => fetchPhotoClients({}),
    enabled: !isDetail,
  });

  if (isDetail) {
    return <Outlet />;
  }

  const selectedPackage = findNewbornPackage(createForm.package_id);
  const addonsTotal = NEWBORN_ADDONS.filter((a) => createForm.addon_ids.includes(a.id)).reduce(
    (s, a) => s + a.price,
    0,
  );
  const total = (selectedPackage?.price ?? 0) + addonsTotal;

  const toggleAddon = (id: string) =>
    setCreateForm((f) => ({
      ...f,
      addon_ids: f.addon_ids.includes(id)
        ? f.addon_ids.filter((a) => a !== id)
        : [...f.addon_ids, id],
    }));

  const submitCreate = async () => {
    if (!createForm.package_id) return toast.error("יש לבחור חבילה");
    if (!createForm.contact_name.trim() || !createForm.contact_phone.trim())
      return toast.error("שם וטלפון הם שדות חובה");
    if (!confirmRestDay(createForm.session_date)) return;
    setSaving(true);
    try {
      const created: any = await runCreate({
        data: {
          package_id: createForm.package_id,
          addon_ids: createForm.addon_ids,
          contact_name: createForm.contact_name.trim(),
          contact_phone: createForm.contact_phone.trim(),
          contact_email: createForm.contact_email.trim() || null,
          session_date: createForm.session_date || null,
          session_time: createForm.session_time || null,
          birth_basket_used: createForm.birth_basket_used,
          session_place: createForm.session_place,
          notes: createForm.notes.trim() || null,
        },
      });
      if (created?._schemaFallback) {
        // Honest, not a silent drop: the order itself WAS created, but
        // session_time/birth_basket_used couldn't be saved yet — the
        // database update that adds those columns hasn't landed on this
        // deployment. Surfaced instead of a plain success toast so it
        // doesn't read as "the time was saved" when it wasn't (this is also
        // why the calendar event can land on the default 10:00 instead of
        // the real chosen time).
        toast.warning(
          "ההזמנה נוצרה, אבל שעת הצילום/סל לידה עדיין לא נשמרו — יש לעדכן את מסד הנתונים ולנסות שוב",
        );
      } else if (created?._bookingBlockError) {
        // This is the important one: it means the slot is NOT actually
        // blocked, so a customer could still rent the studio at the same
        // time. Shown ahead of a calendar-only failure since it's the real
        // double-booking risk, not just a missing visual mirror.
        toast.warning(
          `ההזמנה נוצרה, אבל חסימת השעות ביומן הסטודיו נכשלה — יתכן שהשעות עדיין פתוחות להזמנה: ${created._bookingBlockError}`,
        );
      } else if (created?._calendarError) {
        // Secondary — Google Calendar is a visual mirror only; the studio's
        // own availability is already protected via the booking block above.
        toast.warning(
          `ההזמנה נוצרה והשעות חסומות באתר, אבל השריון ביומן Google נכשל: ${created._calendarError}`,
        );
      } else if (created?._bookingBlockConfirmed) {
        // Real proof — a fresh, independent read-back right after the
        // insert, not just "the insert didn't error". Shows the exact
        // date/time so it's obvious whether it matches what was actually
        // typed.
        const c = created._bookingBlockConfirmed;
        toast.success(
          `ההזמנה נוצרה, והשעות נחסמו ביומן הסטודיו: ${c.date} ${c.start}–${c.end} — הכרטיסייה מוכנה למטה`,
        );
      } else {
        toast.success("ההזמנה נוצרה — הכרטיסייה מוכנה למטה");
      }
      setCreateForm(emptyCreateForm);
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ["newborn-orders"] });
    } catch (e) {
      toast.error(heError(e, "יצירת ההזמנה נכשלה"));
    } finally {
      setSaving(false);
    }
  };

  const toggleStep = async (order: OrderRow, stepKey: string, done: boolean) => {
    setBusyStep(`${order.id}:${stepKey}`);
    // Optimistic — the checklist should feel instant; rolled back via a refetch if the save actually fails.
    qc.setQueryData(["newborn-orders"], (prev: OrderRow[] | undefined) =>
      prev?.map((o) =>
        o.id === order.id ? { ...o, [`${stepKey}_at`]: done ? new Date().toISOString() : null } : o,
      ),
    );
    try {
      await runToggle({ data: { id: order.id, step_key: stepKey, done } });
    } catch (e) {
      toast.error(heError(e, "העדכון נכשל"));
      qc.invalidateQueries({ queryKey: ["newborn-orders"] });
    } finally {
      setBusyStep(null);
    }
  };

  const openEdit = (order: OrderRow) => {
    setEditTarget(order);
    setEditForm(toEditForm(order));
  };

  const submitEdit = async () => {
    if (!editTarget || !editForm) return;
    if (!editForm.contact_name.trim() || !editForm.contact_phone.trim())
      return toast.error("שם וטלפון הם שדות חובה");
    if (
      editForm.session_date !== (editTarget.session_date ?? "") &&
      !confirmRestDay(editForm.session_date)
    )
      return;
    setEditSaving(true);
    try {
      const result: any = await runUpdateContact({
        data: {
          id: editTarget.id,
          contact_name: editForm.contact_name.trim(),
          contact_phone: editForm.contact_phone.trim(),
          contact_email: editForm.contact_email.trim() || null,
          session_date: editForm.session_date || null,
          session_time: editForm.session_time || null,
          birth_basket_used: editForm.birth_basket_used,
          session_place: editForm.session_place,
          notes: editForm.notes.trim() || null,
          ...(editForm.total_price.trim() ? { total_price: Number(editForm.total_price) } : {}),
        },
      });
      if (result?._schemaFallback) {
        // See submitCreate's matching comment.
        toast.warning(
          "שאר הפרטים עודכנו, אבל שעת הצילום/סל לידה עדיין לא נשמרו — יש לעדכן את מסד הנתונים ולנסות שוב",
        );
      } else if (result?._bookingBlockError) {
        toast.warning(
          `הפרטים עודכנו, אבל חסימת השעות ביומן הסטודיו נכשלה — יתכן שהשעות עדיין פתוחות להזמנה: ${result._bookingBlockError}`,
        );
      } else if (result?._calendarError) {
        toast.warning(
          `הפרטים עודכנו והשעות חסומות באתר, אבל השריון ביומן Google נכשל: ${result._calendarError}`,
        );
      } else if (result?._bookingBlockConfirmed) {
        const c = result._bookingBlockConfirmed;
        toast.success(`הפרטים עודכנו, והשעות נחסמו ביומן הסטודיו: ${c.date} ${c.start}–${c.end}`);
      } else {
        toast.success("הפרטים עודכנו");
      }
      setEditTarget(null);
      qc.invalidateQueries({ queryKey: ["newborn-orders"] });
    } catch (e) {
      toast.error(heError(e, "העדכון נכשל"));
    } finally {
      setEditSaving(false);
    }
  };

  const remove = async (order: OrderRow) => {
    if (!confirm(`למחוק את ההזמנה של ${order.contact_name}?`)) return;
    try {
      await runDelete({ data: { id: order.id } });
      qc.invalidateQueries({ queryKey: ["newborn-orders"] });
    } catch (e) {
      toast.error(heError(e, "המחיקה נכשלה"));
    }
  };

  // Opens this order's OWN gallery — a completely separate system from
  // the general photo-delivery one (/admin/photo-clients), per explicit
  // request: her newborn-photography clients get their own table
  // (newborn_order_images) and their own token-gated page
  // (/newborn/gallery/$token), never touching the general system.
  const openGallery = (order: OrderRow) => {
    if (!order.gallery_opened_at) {
      runMarkGalleryOpened({ data: { id: order.id } })
        .then(() => qc.invalidateQueries({ queryKey: ["newborn-orders"] }))
        .catch(() => {
          // best-effort — this only feeds the dashboard's "galleries" stat, never blocks the real navigation below
        });
    }
    nav({ to: "/admin/newborn-packages/$orderId", params: { orderId: order.id } });
  };

  // ---- ChikTime-style helpers (search, Hebrew calendar, same-day warning, CSV) ----
  const allHub: HubRow[] = sortHubRows([
    ...rows.map(newbornToHub),
    ...((outdoorOrders.data ?? []) as any[]).map(outdoorToHub),
    ...((studioOrders.data ?? []) as any[]).map(studioToHub),
    ...((generalClients.data ?? []) as any[]).map((r) =>
      generalToHub(r, generalServiceLabel(r, r.package_type ? PHOTO_PACKAGES[r.package_type as keyof typeof PHOTO_PACKAGES]?.label ?? "" : "")),
    ),
  ]);
  const kindHub = kindFilter === "all" ? allHub : allHub.filter((r) => r.kind === kindFilter);

  const sameDayTimes = (date: string | null | undefined, excludeId?: string) =>
    date
      ? allHub.filter((r) => r.date === date && r.id !== excludeId).map((r) => r.time || "?")
      : [];

  const term = search.trim().toLowerCase();
  const shownHub = term
    ? kindHub.filter((r) =>
        [r.name, r.phone, r.email, r.notes, r.packageName].some((v) =>
          (v ?? "").toLowerCase().includes(term),
        ),
      )
    : kindHub;
  const shownNewbornRows = term
    ? shownHub.filter((r) => r.kind === "newborn").map((r) => r.raw as OrderRow)
    : rows;

  const calendarItems: CalendarItem[] = kindHub
    .filter((r) => r.date)
    .map((r) => {
      const paid = r.total > 0 && r.paid >= r.total;
      return {
        id: `${r.kind}:${r.id}`,
        date: r.date as string,
        time: r.time || "",
        label: r.name,
        tone: paid ? "bg-emerald-100 text-emerald-800" : hubKind(r.kind).tone,
        title: `${r.time ?? ""} ${r.name} · ${r.packageName}`,
      };
    });

  const openCreateFor = (date?: string) => {
    if (kindFilter === "all") {
      setChooserDate(date);
      setChooserOpen(true);
      return;
    }
    startCreate(kindFilter, date);
  };

  const startCreate = (kind: HubKind, date?: string, prefill?: ClientPrefill | null) => {
    setChooserOpen(false);
    if (kind === "newborn") {
      setCreateForm({ ...emptyCreateForm, session_date: date ?? "", contact_name: prefill?.name ?? "", contact_phone: prefill?.phone ?? "", contact_email: prefill?.email ?? "" });
      setCreateOpen(true);
    } else if (kind === "outdoor") {
      setOutdoorDialog({ open: true, initial: null, date, prefill });
    } else if (kind === "general") {
      setGeneralDialog({ open: true, date, prefill });
    } else {
      setStudioDialog({ open: true, initial: null, date, prefill });
    }
  };

  // "כבר לקוחה" from a lead mail: load the lead, fill her details in and open the new-client flow.
  const fromLead = Route.useSearch().fromLead;
  useEffect(() => {
    if (!fromLead) return;
    let alive = true;
    (async () => {
      const { data } = await (supabase as any).from("inquiry_leads").select("name, phone, email").eq("id", fromLead).maybeSingle();
      if (!alive) return;
      nav({ to: "/admin/newborn-packages", search: (prev: any) => ({ kind: prev.kind }), replace: true } as never);
      if (!data) {
        toast.error("הליד לא נמצא");
        return;
      }
      const prefill: ClientPrefill = { name: data.name ?? "", phone: data.phone ?? "", email: data.email ?? "" };
      toast.success(`פותחת כרטיס לקוח: ${prefill.name || prefill.phone || prefill.email}`);
      if (kindFilter === "all") {
        setLeadPrefill(prefill);
        setChooserDate(undefined);
        setChooserOpen(true);
      } else {
        startCreate(kindFilter, undefined, prefill);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromLead]);

  const openEditHub = (r: HubRow) => {
    if (r.kind === "newborn") openEdit(r.raw as OrderRow);
    else if (r.kind === "outdoor") setOutdoorDialog({ open: true, initial: r.raw });
    else if (r.kind === "general") nav({ to: "/admin/photo-clients/$bookingId", params: { bookingId: r.id } });
    else setStudioDialog({ open: true, initial: r.raw });
  };

  const toggleHubStep = async (r: HubRow, stepKey: string, done: boolean) => {
    setBusyHubStep(`${r.id}:${stepKey}`);
    try {
      if (r.kind === "outdoor") await runToggleOutdoorStep({ data: { id: r.id, step_key: stepKey, done } });
      else await runToggleStudioStep({ data: { id: r.id, step_key: stepKey as "shoot_done" | "payment_done", done } });
      qc.invalidateQueries({ queryKey: r.kind === "outdoor" ? ["admin-outdoor-orders"] : ["studio-custom-orders"] });
    } catch (e) {
      toast.error(heError(e, "העדכון נכשל"));
    } finally {
      setBusyHubStep(null);
    }
  };

  const removeHub = async (r: HubRow) => {
    if (!confirm(`למחוק את ${r.name}?`)) return;
    try {
      if (r.kind === "outdoor") {
        const { error } = await (supabase as any).from("outdoor_package_orders").delete().eq("id", r.id);
        if (error) throw new Error(error.message);
        qc.invalidateQueries({ queryKey: ["admin-outdoor-orders"] });
      } else {
        await runDeleteStudio({ data: { id: r.id } });
        qc.invalidateQueries({ queryKey: ["studio-custom-orders"] });
      }
      toast.success("נמחק");
    } catch (e) {
      toast.error(heError(e, "המחיקה נכשלה"));
    }
  };

  const toggleOutdoorDeposit = async (r: HubRow) => {
    const { error } = await (supabase as any)
      .from("outdoor_package_orders")
      .update({ deposit_paid: !r.raw.deposit_paid })
      .eq("id", r.id);
    if (error) return toast.error(heError(error.message));
    qc.invalidateQueries({ queryKey: ["admin-outdoor-orders"] });
  };

  const sendContractHub = async (r: HubRow) => {
    if (!r.email) return toast.error("לא נמצאה כתובת מייל ללקוחה הזו");
    if (!r.date) return toast.error("יש להגדיר תאריך צילום לפני שליחת החוזה");
    setSendingContractId(r.id);
    try {
      await runSendOutdoorContract({ data: { id: r.id } });
      toast.success("החוזה נשלח");
      qc.invalidateQueries({ queryKey: ["admin-outdoor-orders"] });
    } catch (e) {
      toast.error(heError(e, "שליחת החוזה נכשלה"));
    } finally {
      setSendingContractId(null);
    }
  };

  const saveHubPayment = async (r: HubRow, amount: number) => {
    if (r.kind === "newborn") await runUpdatePayment({ data: { id: r.id, amount_paid: amount } });
    else if (r.kind === "outdoor") await runOutdoorPayment({ data: { id: r.id, amount_paid: amount } });
    else if (r.kind === "general") await runGeneralPayment({ data: { workflowId: r.id, amountPaid: amount } });
    else await runStudioPayment({ data: { id: r.id, amount_paid: amount } });
  };

  const sendHubReminders = async (picked: HubRow[]) => {
    const out: { sent: boolean; reason?: string }[] = [];
    const nb = picked.filter((r) => r.kind === "newborn").map((r) => r.id);
    const od = picked.filter((r) => r.kind === "outdoor").map((r) => r.id);
    if (nb.length) out.push(...(await runNewbornReminders({ data: { orderIds: nb } })).results);
    if (od.length) out.push(...(await runOutdoorReminders({ data: { orderIds: od } })).results);
    const gn = picked.filter((r) => r.kind === "general").map((r) => r.id);
    if (gn.length) out.push(...(await runGeneralReminders({ data: { workflowIds: gn } })).results);
    return out;
  };

  const exportCsv = () => {
    const header = ["סוג", "שם", "טלפון", "מייל", "חבילה", "תאריך צילום", "שעה", "סה״כ", "שולם", "יתרה", "הערות"];
    const lines = shownHub.map((r) => [
      hubKind(r.kind).label,
      r.name,
      r.phone,
      r.email ?? "",
      r.packageName,
      r.date ?? "",
      r.time ?? "",
      String(r.total),
      String(r.paid),
      String(hubBalance(r)),
      r.notes ?? "",
    ]);
    const csv =
      "\uFEFF" +
      [header, ...lines]
        .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
        .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `לקוחות-${ymd(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const missingEmail = kindHub.filter(
    (r) => r.kind !== "studio" && r.date && r.date >= ymd(new Date()) && !r.email,
  );

  const TABS = [
    { key: "dashboard", label: "מסך ראשי", icon: LayoutDashboard },
    { key: "list", label: "לקוחות", icon: List },
    { key: "hebcal", label: "לוח שנה", icon: CalendarRange },
    { key: "calendar", label: "יומן יומי", icon: CalendarDays },
    { key: "table", label: "טבלה", icon: Table2 },
    { key: "payments", label: "תשלומים", icon: Wallet },
    { key: "packages", label: "חבילות", icon: Baby },
    { key: "settings", label: "הגדרות", icon: SettingsIcon },
  ] as const;

  const kindOptions = [
    { key: "all" as HubFilter, label: "הכל", dot: "bg-newborn-ink" },
    ...HUB_KINDS.map((k) => ({ key: k.key as HubFilter, label: k.label, dot: k.dot })),
  ];
  const kindCount = (key: HubFilter) =>
    key === "all" ? allHub.length : allHub.filter((r) => r.kind === key).length;

  return (
    <div
      dir="rtl"
      className={`${kindFilter === "all" ? "kind-newborn" : hubKind(kindFilter).scope} min-h-screen bg-gradient-to-b from-newborn-canvas via-white to-newborn-blush/30`}
    >
      {/* Standalone header — this page fills the whole screen (see admin.tsx FULLSCREEN_PATHS) */}
      <header className="sticky top-0 z-30 border-b border-newborn-rose/15 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              to="/admin"
              className="grid h-9 w-9 place-items-center rounded-full border border-newborn-rose/20 text-newborn-ink hover:bg-newborn-blush/50"
              title="חזרה לניהול"
            >
              <ArrowRight className="h-4 w-4" />
            </Link>
            <div>
              <p className="text-[10px] tracking-[0.3em] text-newborn-gold">
                MICHAL SIBONI · CLIENTS
              </p>
              <h1 className="font-display text-2xl leading-tight text-newborn-ink">
                {kindFilter === "all" ? "לקוחות" : `לקוחות ${hubKind(kindFilter).label}`}
              </h1>
            </div>
          </div>
          <Button
            onClick={() => openCreateFor()}
            className="rounded-full bg-newborn-rose text-white shadow-lg shadow-newborn-rose/20 hover:bg-newborn-rose/90 gap-2"
          >
            <Plus className="h-4 w-4" /> הזמנה חדשה
          </Button>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 lg:flex-row lg:items-start lg:gap-6">
        {/* Phones / tablets: the same choices as a scrolling row on top */}
        <div className="space-y-2 lg:hidden">
          <nav className="flex gap-1 overflow-x-auto pb-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setView(t.key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm transition ${
                  view === t.key ? "bg-newborn-ink text-white shadow" : "bg-white text-newborn-ink/70 hover:bg-newborn-blush/50"
                }`}
              >
                <t.icon className="h-4 w-4" /> {t.label}
              </button>
            ))}
          </nav>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {kindOptions.map((k) => {
              const active = kindFilter === k.key;
              return (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => setKindFilter(k.key)}
                  className={`flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition ${
                    active
                      ? "border-newborn-ink bg-newborn-ink text-white shadow"
                      : "border-newborn-rose/25 bg-white text-newborn-ink/80 hover:bg-newborn-blush/40"
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${k.dot}`} />
                  {k.label}
                  <span className={`text-xs ${active ? "text-white/80" : "text-muted-foreground"}`}>{kindCount(k.key)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Desktop: one column on the side — views first, then the client type filter */}
        <aside className="hidden w-56 shrink-0 lg:sticky lg:top-24 lg:block">
          <div className="space-y-4 rounded-3xl border border-newborn-rose/20 bg-white/90 p-3 shadow-sm">
            <div>
              <p className="px-3 pb-1 text-[11px] font-medium tracking-wide text-newborn-gold">תצוגה</p>
              <nav className="space-y-0.5">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setView(t.key)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-right text-sm transition ${
                      view === t.key ? "bg-newborn-ink text-white shadow" : "text-newborn-ink/75 hover:bg-newborn-blush/50"
                    }`}
                  >
                    <t.icon className="h-4 w-4 shrink-0" /> {t.label}
                  </button>
                ))}
              </nav>
            </div>
            <div className="border-t border-newborn-rose/15 pt-3">
              <p className="px-3 pb-1 text-[11px] font-medium tracking-wide text-newborn-gold">סוג לקוחה</p>
              <div className="space-y-0.5">
                {kindOptions.map((k) => {
                  const active = kindFilter === k.key;
                  return (
                    <button
                      key={k.key}
                      type="button"
                      onClick={() => setKindFilter(k.key)}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-right text-sm transition ${
                        active ? "bg-newborn-blush/70 font-medium text-newborn-ink" : "text-newborn-ink/75 hover:bg-newborn-blush/40"
                      }`}
                    >
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${k.dot}`} />
                      <span className="flex-1">{k.label}</span>
                      <span className="text-xs text-muted-foreground">{kindCount(k.key)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

      <main className="min-w-0 flex-1 space-y-6">
        {(orders.isLoading || outdoorOrders.isLoading || studioOrders.isLoading || generalClients.isLoading) && (
          <p className="text-sm text-muted-foreground">טוען…</p>
        )}
        {!orders.isLoading &&
          !outdoorOrders.isLoading &&
          !studioOrders.isLoading &&
          !generalClients.isLoading &&
          kindHub.length === 0 &&
          view !== "settings" &&
          view !== "packages" && (
            <div className="rounded-3xl border border-newborn-rose/20 bg-white p-8 text-center text-sm text-muted-foreground">
              עדיין אין הזמנות
              {kindFilter === "all" ? "" : ` ${hubKind(kindFilter).label}`}. אפשר להתחיל בכפתור "הזמנה חדשה".
            </div>
          )}

        {generalClients.isError && (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-medium">טעינת לקוחות הצילום הכללי נכשלה — הם לא מופיעים ברשימה</p>
            <p className="mt-0.5" dir="ltr">
              {(generalClients.error as any)?.message ?? String(generalClients.error)}
            </p>
          </div>
        )}

        {view === "dashboard" && (
          <>
            <HubDashboardView
              rows={kindHub}
              onGoToCalendar={() => setView("hebcal")}
              onGoToPayments={() => setView("payments")}
              onOpen={openEditHub}
            />
            {missingEmail.length > 0 && (
              <div className="rounded-3xl border border-amber-200 bg-amber-50/70 p-4 text-sm">
                <div className="mb-2 font-medium text-amber-900">
                  ⚠️ לא יקבלו תזכורת אוטומטית (אין מייל)
                </div>
                <div className="flex flex-wrap gap-2">
                  {missingEmail.map((o) => (
                    <button
                      key={`${o.kind}:${o.id}`}
                      type="button"
                      onClick={() => openEditHub(o)}
                      className="rounded-full bg-white px-3 py-1 text-xs text-amber-900 shadow-sm hover:bg-amber-100"
                    >
                      {o.name} · {formatDateIL(o.date)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {view === "hebcal" && (
          <HebrewCalendar
            items={calendarItems}
            onPickDay={(date) => openCreateFor(date)}
            onPickItem={(id) => {
              const o = allHub.find((r) => `${r.kind}:${r.id}` === id);
              if (o) openEditHub(o);
            }}
          />
        )}

        {view === "calendar" && (
          <HubCalendarView
            rows={kindHub}
            onEdit={openEditHub}
            onOpenGallery={(r) => openGallery(r.raw as OrderRow)}
            openingGalleryId={openingGalleryId}
          />
        )}

        {(view === "list" || view === "table") && kindHub.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש לפי שם, טלפון, מייל, חבילה…"
                className="rounded-full bg-white pr-9"
              />
            </div>
            <span className="text-sm text-muted-foreground">{shownHub.length} לקוחות</span>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full gap-1.5"
              onClick={exportCsv}
            >
              <Download className="h-4 w-4" /> ייצוא לאקסל
            </Button>
          </div>
        )}

        {view === "table" &&
          (kindFilter === "newborn" ? (
            <NewbornTableView rows={shownNewbornRows} />
          ) : (
            <HubTableView rows={shownHub} />
          ))}

        {view === "payments" && (
          <HubPaymentsView
            rows={kindHub}
            savePayment={saveHubPayment}
            sendReminders={sendHubReminders}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["newborn-orders"] });
              qc.invalidateQueries({ queryKey: ["admin-outdoor-orders"] });
              qc.invalidateQueries({ queryKey: ["studio-custom-orders"] });
              qc.invalidateQueries({ queryKey: ["photo-clients"] });
            }}
          />
        )}

        {view === "packages" && (
          <>
            {(kindFilter === "all" || kindFilter === "newborn") && <PackageTypesSection />}
            {(kindFilter === "all" || kindFilter === "outdoor") && <OutdoorPackageTypesSection />}
            {(kindFilter === "studio" || kindFilter === "general") && (
              <p className="rounded-2xl border border-newborn-rose/20 bg-white p-6 text-center text-sm text-muted-foreground">
                ל{hubKind(kindFilter).label} אין סוגי חבילות קבועים — הפרטים נקבעים בכל הזמנה.
              </p>
            )}
          </>
        )}

        {view === "settings" &&
          (cmSettings.data ? (
            <SettingsTab data={{ settings: cmSettings.data }} />
          ) : (
            <p className="text-sm text-muted-foreground">טוען…</p>
          ))}

        {view === "list" && (
          <div className="grid gap-4 lg:grid-cols-2">
            {shownHub.map((r) => {
              if (r.kind === "outdoor") {
                return (
                  <OutdoorHubCard
                    key={`outdoor:${r.id}`}
                    row={r}
                    busyStep={busyHubStep}
                    sendingContract={sendingContractId === r.id}
                    onToggleStep={(stepKey, done) => toggleHubStep(r, stepKey, done)}
                    onToggleDeposit={() => toggleOutdoorDeposit(r)}
                    onSendContract={() => sendContractHub(r)}
                    onEdit={() => openEditHub(r)}
                    onDelete={() => removeHub(r)}
                  />
                );
              }
              if (r.kind === "general") {
                return <GeneralHubCard key={`general:${r.id}`} row={r} onEdit={() => openEditHub(r)} />;
              }
              if (r.kind === "studio") {
                return (
                  <StudioHubCard
                    key={`studio:${r.id}`}
                    row={r}
                    busyStep={busyHubStep}
                    onToggleStep={(stepKey, done) => toggleHubStep(r, stepKey, done)}
                    onEdit={() => openEditHub(r)}
                    onDelete={() => removeHub(r)}
                  />
                );
              }
              const order = r.raw as OrderRow;
              return (
                <NewbornHubCard
                  key={`newborn:${r.id}`}
                  row={r}
                  busyStep={busyStep}
                  openingGallery={openingGalleryId === order.id}
                  onToggleStep={(stepKey, done) => toggleStep(order, stepKey, done)}
                  onEdit={() => openEdit(order)}
                  onDelete={() => remove(order)}
                  onOpenGallery={() => openGallery(order)}
                />
              );
            })}
          </div>
        )}
      </main>
      </div>

      <HubKindChooser
        open={chooserOpen}
        onOpenChange={(o) => {
          setChooserOpen(o);
          if (!o) setLeadPrefill(null);
        }}
        onPick={(k) => {
          startCreate(k, chooserDate, leadPrefill);
          setLeadPrefill(null);
        }}
      />
      <OutdoorOrderDialog
        open={outdoorDialog.open}
        onOpenChange={(o) => setOutdoorDialog((d) => ({ ...d, open: o }))}
        initial={outdoorDialog.initial}
        defaultDate={outdoorDialog.date}
        prefill={outdoorDialog.prefill}
        sameDayTimes={sameDayTimes}
      />
      <GeneralClientDialog
        open={generalDialog.open}
        onOpenChange={(o) => setGeneralDialog((d) => ({ ...d, open: o }))}
        defaultDate={generalDialog.date}
        prefill={generalDialog.prefill}
        sameDayTimes={sameDayTimes}
        onCreated={(workflowId) => {
          qc.invalidateQueries({ queryKey: ["photo-clients"] });
          nav({ to: "/admin/photo-clients/$bookingId", params: { bookingId: workflowId } });
        }}
      />
      <StudioOrderDialog
        open={studioDialog.open}
        onOpenChange={(o) => setStudioDialog((d) => ({ ...d, open: o }))}
        initial={studioDialog.initial}
        defaultDate={studioDialog.date}
        prefill={studioDialog.prefill}
        sameDayTimes={sameDayTimes}
      />

      {/* New order */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>הזמנת חבילת ניו-בורן חדשה</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-4">
              <Label className="mb-2 block">בחירת חבילה</Label>
              {NEWBORN_PACKAGE_CATEGORIES.map((cat) => {
                const pkgs = NEWBORN_PACKAGES.filter((p) => !p.retired && p.categories.includes(cat.id));
                if (pkgs.length === 0) return null;
                return (
                  <div key={cat.id} className="space-y-2">
                    <div className="text-xs font-semibold text-blush-deep">{cat.label}</div>
                    {pkgs.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setCreateForm((f) => ({ ...f, package_id: p.id }))}
                        className={`w-full text-right rounded-xl border p-3 transition-colors ${
                          createForm.package_id === p.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-primary">{p.name}</span>
                          <span className="font-display text-lg text-primary">₪{p.price}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {p.features.join(" · ")}
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>

            <div>
              <Label className="mb-2 block">תוספות</Label>
              <div className="grid grid-cols-2 gap-2">
                {NEWBORN_ADDONS.map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center gap-2 text-sm rounded-lg border border-border p-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={createForm.addon_ids.includes(a.id)}
                      onCheckedChange={() => toggleAddon(a.id)}
                    />
                    <span className="flex-1">{a.label}</span>
                    <span className="text-muted-foreground">+₪{a.price}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-blush/40 p-3">
              <span className="text-sm font-medium text-primary">סה״כ</span>
              <span className="font-display text-2xl text-primary">₪{total}</span>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>שם הלקוחה *</Label>
                <Input
                  value={createForm.contact_name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, contact_name: e.target.value }))}
                />
              </div>
              <div>
                <Label>טלפון *</Label>
                <Input
                  dir="ltr"
                  value={createForm.contact_phone}
                  onChange={(e) => setCreateForm((f) => ({ ...f, contact_phone: e.target.value }))}
                />
              </div>
              <div>
                <Label>מייל</Label>
                <Input
                  dir="ltr"
                  type="email"
                  value={createForm.contact_email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, contact_email: e.target.value }))}
                />
              </div>
              <div>
                <Label>תאריך צילום (אם ידוע)</Label>
                <Input
                  type="date"
                  value={createForm.session_date}
                  onChange={(e) => setCreateForm((f) => ({ ...f, session_date: e.target.value }))}
                />
                <DateHints
                  date={createForm.session_date}
                  sameDayTimes={sameDayTimes(createForm.session_date)}
                />
              </div>
              <div>
                <Label>שעת צילום</Label>
                <Input
                  type="time"
                  value={createForm.session_time}
                  onChange={(e) => setCreateForm((f) => ({ ...f, session_time: e.target.value }))}
                />
              </div>
            </div>
<div>
                <Label>מקום הצילום</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={createForm.session_place}
                  onChange={(e) => setCreateForm((f) => ({ ...f, session_place: e.target.value as "studio" | "home" }))}
                >
                  <option value="studio">בסטודיו (חוסם שעות סטודיו וחדר משפחה)</option>
                  <option value="home">בבית הלקוחה (לא תופס סטודיו וחדר משפחה)</option>
                </select>
              </div>
            <BirthBasketToggle
              value={createForm.birth_basket_used}
              onChange={(v) => setCreateForm((f) => ({ ...f, birth_basket_used: v }))}
            />
            <div>
              <Label>הערות</Label>
              <Textarea
                value={createForm.notes}
                onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submitCreate} disabled={saving} className="rounded-full w-full">
              {saving ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : null}
              יצירת הזמנה ופתיחת כרטיסייה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit contact card */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>עריכת פרטי לקוחה</DialogTitle>
          </DialogHeader>
          {editForm && (
            <div className="space-y-3 py-2">
              <div>
                <Label>שם הלקוחה *</Label>
                <Input
                  value={editForm.contact_name}
                  onChange={(e) => setEditForm((f) => f && { ...f, contact_name: e.target.value })}
                />
              </div>
              <div>
                <Label>טלפון *</Label>
                <Input
                  dir="ltr"
                  value={editForm.contact_phone}
                  onChange={(e) => setEditForm((f) => f && { ...f, contact_phone: e.target.value })}
                />
              </div>
              <div>
                <Label>מייל</Label>
                <Input
                  dir="ltr"
                  type="email"
                  value={editForm.contact_email}
                  onChange={(e) => setEditForm((f) => f && { ...f, contact_email: e.target.value })}
                />
              </div>
              <div>
                <Label>תאריך צילום</Label>
                <Input
                  type="date"
                  value={editForm.session_date}
                  onChange={(e) => setEditForm((f) => f && { ...f, session_date: e.target.value })}
                />
                <DateHints
                  date={editForm.session_date}
                  sameDayTimes={sameDayTimes(editForm.session_date, editTarget?.id)}
                />
              </div>
              <div>
                <Label>שעת צילום</Label>
                <Input
                  type="time"
                  value={editForm.session_time}
                  onChange={(e) => setEditForm((f) => f && { ...f, session_time: e.target.value })}
                />
              </div>
<div>
                <Label>מקום הצילום</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={editForm.session_place}
                  onChange={(e) => setEditForm((f) => f && { ...f, session_place: e.target.value as "studio" | "home" })}
                >
                  <option value="studio">בסטודיו (חוסם שעות סטודיו וחדר משפחה)</option>
                  <option value="home">בבית הלקוחה (לא תופס סטודיו וחדר משפחה)</option>
                </select>
              </div>
              <BirthBasketToggle
                value={editForm.birth_basket_used}
                onChange={(v) => setEditForm((f) => f && { ...f, birth_basket_used: v })}
              />
              <div>
                <Label>סכום כולל (₪)</Label>
                <Input
                  type="number"
                  min={0}
                  dir="ltr"
                  value={editForm.total_price}
                  onChange={(e) => setEditForm((f) => f && { ...f, total_price: e.target.value })}
                  placeholder="לדוגמה אם סוכם מחיר שונה מהמחירון בטלפון"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  זה הסכום שיופיע בחוזה שנשלח — לא משנה את מה שכבר שולם.
                </p>
              </div>
              <div>
                <Label>הערות</Label>
                <Textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => f && { ...f, notes: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={submitEdit} disabled={editSaving} className="rounded-full w-full">
              {editSaving ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : null}
              שמירה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** A single toggle button (not a checkbox — requested specifically as "כפתור") for whether the קופת חולים "סל לידה" birth-basket benefit was used for this order — see photography-options.ts's own doc comment on how the benefit works. Purely informational bookkeeping; doesn't affect pricing anywhere in this page. */
function BirthBasketToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
        value
          ? "border-primary bg-primary/5 text-primary"
          : "border-border text-muted-foreground hover:border-primary/50"
      }`}
    >
      <span className="flex items-center gap-2">
        <Gift className="h-4 w-4" /> נוצל סל לידה (הטבת קופת חולים)
      </span>
      {value ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
    </button>
  );
}


/** "טבלה" — one row per order, all the at-a-glance fields Michal asked for in a single scan: contact info, date+time, how many sets/edited photos the package includes, whether it has a collage/album, and whether it's fully paid. Read-only (editing happens via the pencil icon → the same edit dialog every other view uses). */
function NewbornTableView({ rows }: { rows: OrderRow[] }) {
  const YesNo = ({ yes }: { yes: boolean }) =>
    yes ? (
      <Check className="h-4 w-4 text-forest inline" />
    ) : (
      <XIcon className="h-4 w-4 text-destructive/70 inline" />
    );

  return (
    <div className="bg-card rounded-2xl border border-primary/10 overflow-x-auto">
      <table className="w-full text-sm min-w-[1000px]">
        <thead>
          <tr className="border-b border-primary/10 text-right text-xs text-muted-foreground">
            <th className="px-3 py-3 font-medium">שם</th>
            <th className="px-3 py-3 font-medium">טלפון</th>
            <th className="px-3 py-3 font-medium">מייל</th>
            <th className="px-3 py-3 font-medium">תאריך ושעה</th>
            <th className="px-3 py-3 font-medium text-center">כמות סטים</th>
            <th className="px-3 py-3 font-medium text-center">תמונות מעובדות</th>
            <th className="px-3 py-3 font-medium text-center">קולאז'</th>
            <th className="px-3 py-3 font-medium text-center">אלבום</th>
            <th className="px-3 py-3 font-medium text-center">פרטי אלבום</th>
            <th className="px-3 py-3 font-medium text-center">שולם</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const pkg = findNewbornPackage(o.package_id);
            const paid =
              Number(o.amount_paid) >= Number(o.total_price) && Number(o.total_price) > 0;
            return (
              <tr key={o.id} className="border-b border-primary/5 last:border-0 hover:bg-cream/40">
                <td className="px-3 py-2.5 font-medium text-primary whitespace-nowrap">
                  {o.contact_name}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap" dir="ltr">
                  {o.contact_phone}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap" dir="ltr">
                  {o.contact_email || "—"}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {o.session_date ? (
                    <>
                      {o.session_date}
                      {o.session_time ? (
                        <span className="text-muted-foreground"> · {o.session_time}</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-muted-foreground">טרם נקבע</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center">
                  {pkg
                    ? pkg.sessions > 1
                      ? `${pkg.sets} · ${pkg.sessions} סשנים`
                      : pkg.sets
                    : "—"}
                </td>
                <td className="px-3 py-2.5 text-center">{pkg?.photosToEdit ?? "—"}</td>
                <td className="px-3 py-2.5 text-center">
                  <YesNo yes={!!pkg?.hasCollage} />
                </td>
                <td className="px-3 py-2.5 text-center">
                  <YesNo yes={!!pkg?.hasAlbum} />
                </td>
                <td className="px-3 py-2.5 text-center">
                  <YesNo yes={!!o.album_details_submitted_at} />
                </td>
                <td className="px-3 py-2.5 text-center">
                  <YesNo yes={paid} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-10">אין עדיין הזמנות.</p>
      )}
    </div>
  );
}

/**
 * "חבילות" — admin-editable newborn package list (name/price/description),
 * ported as-is from the photographer-portal project's PackageTypesSection
 * (admin.settings.tsx there) per explicit request to compare it against
 * the existing hardcoded NEWBORN_PACKAGES list above. Reads/writes
 * newborn_package_types — a brand-new, separate table; nothing here
 * touches NEWBORN_PACKAGES or order creation.
 */
function PackageTypesSection() {
  const qc = useQueryClient();
  const runList = useServerFn(listNewbornPackageTypes);
  const runSave = useServerFn(saveNewbornPackageType);
  const runDelete = useServerFn(deleteNewbornPackageType);
  const packages = useQuery({ queryKey: ["newborn_package_types"], queryFn: () => runList({}) });

  const [newPkg, setNewPkg] = useState({ name: "", price: "", description: "" });

  const add = async () => {
    if (!newPkg.name.trim()) return;
    try {
      await runSave({
        data: {
          name: newPkg.name,
          price: Number(newPkg.price) || 0,
          description: newPkg.description,
        },
      });
      setNewPkg({ name: "", price: "", description: "" });
      qc.invalidateQueries({ queryKey: ["newborn_package_types"] });
    } catch (e) {
      toast.error(heError(e, "ההוספה נכשלה"));
    }
  };

  const remove = async (pkgId: string) => {
    if (!confirm("למחוק את החבילה?")) return;
    await runDelete({ data: { id: pkgId } });
    qc.invalidateQueries({ queryKey: ["newborn_package_types"] });
  };

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">חבילות</h2>
      <div className="bg-card border border-primary/10 rounded-2xl p-5 space-y-4 max-w-2xl">
        <div className="divide-y divide-border">
          {(packages.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground py-2">אין עדיין חבילות.</p>
          )}
          {(packages.data ?? []).map((p: any) => (
            <div key={p.id} className="py-3 flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">
                  {p.name} — ₪{p.price}
                </div>
                {p.description && (
                  <div className="text-xs text-muted-foreground">{p.description}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(p.id)}
                className="h-8 w-8 rounded-full hover:bg-destructive/10 text-destructive flex items-center justify-center"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="grid sm:grid-cols-[1fr_120px_1fr_auto] gap-2 pt-2 border-t border-border">
          <Input
            placeholder="שם החבילה"
            value={newPkg.name}
            onChange={(e) => setNewPkg({ ...newPkg, name: e.target.value })}
          />
          <Input
            placeholder="מחיר"
            type="number"
            value={newPkg.price}
            onChange={(e) => setNewPkg({ ...newPkg, price: e.target.value })}
          />
          <Input
            placeholder="תיאור (אופציונלי)"
            value={newPkg.description}
            onChange={(e) => setNewPkg({ ...newPkg, description: e.target.value })}
          />
          <Button onClick={add} className="gap-1.5">
            <Plus className="h-4 w-4" /> הוספה
          </Button>
        </div>
      </div>
    </section>
  );
}


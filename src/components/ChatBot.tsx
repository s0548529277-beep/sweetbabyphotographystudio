import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Mail,
  PackageSearch,
  Plus,
  Send,
  ShoppingBag,
  UserRound,
  X,
} from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { chatWithBot } from "@/lib/ai.functions";
import { adminSetStatus } from "@/lib/admin-orders.functions";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { checkItemsAvailability } from "@/lib/orders.functions";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useSiteIcon } from "@/lib/page-images";
import botAntennaHeart from "@/assets/bot-antenna-heart.png";
import heartIcon from "@/assets/heart-gradient.png";

type ChatUi = {
  photos?: Array<{ url: string; caption: string }>;
  products: Array<{ sku: string; name: string; price: number; img: string | null; available?: boolean }>;
  buttons: Array<{ label: string; href: string }>;
  actions: Array<{ kind: "order_status" | "booking_status" | "lead_status"; id: string; status: string; summary: string }>;
};
type Msg = { role: "user" | "assistant"; content: string; ui?: ChatUi };

/** Only our own images (site paths / storage) are rendered from bot markdown. */
function isSafeImg(src?: string): boolean {
  if (!src) return false;
  return (src.startsWith("/") && !src.startsWith("//")) || /^https:\/\/[a-z0-9-]+\.supabase\.co\//.test(src) || /^https:\/\/(www\.)?(sweetbabyphoto\.shop|michalsiboni\.co\.il)\//.test(src);
}

/** Small inline heart, sized to sit in a line of text — used to render the
 * 💗 in bot messages as the studio's own heart image instead of a plain
 * emoji character (which can render as a flat red/black glyph on some
 * platforms/fonts). */
function InlineHeartImg(props: { src?: string }) {
  return <img src={props.src} alt="💗" className="inline-block h-4 w-4 align-text-bottom mx-0.5" />;
}

/** Replaces every 💗 in bot text with a markdown image pointing at `heartSrc`
 * — MessageResponse (Streamdown) renders that as a real <img>, styled small
 * via the `img` component override passed alongside it. */
function withHeartImage(text: string, heartSrc: string): string {
  return linkifyPaths(text).split("💗").join(`![](${heartSrc})`);
}

const PATH_LABELS: Record<string, string> = {
  "/rental-catalog": "לקטלוג האביזרים",
  "/studio-rental": "להשכרת הסטודיו",
  "/booking": "לבחירת מועד",
  "/studio-photography": "לצילומים עם מיכל",
  "/collage-maker": "ליצירת קולאז׳",
  "/account": "לאזור האישי",
  "/contact": "ליצירת קשר",
  "/cart": "לעגלה",
  "/auth": "להתחברות",
  "/admin/leads": "ללידים",
  "/admin": "לניהול",
};

/** Turns bare site paths the bot wrote as plain text (e.g. "/rental-catalog")
 * into Markdown links, so they render as pill buttons. Skips paths already
 * inside Markdown link syntax. */
export function linkifyPaths(text: string): string {
  return text.replace(/(^|[\s:(])(\/(?:[a-z0-9-]+)(?:\/[a-z0-9-]+)*)(?=$|[\s.,!?)])/gi, (m, pre, path, offset, full) => {
    const before = full[offset - 1];
    if (pre === "(" && before === "]") return m;
    const label = PATH_LABELS[path];
    if (!label) return m;
    return `${pre === "(" ? "(" : pre}[${label}](${path})`;
  });
}

const QUICK_QUESTIONS = [
  { label: "מתי הסטודיו פנוי?", icon: CalendarDays },
  { label: "מצאי לי אביזרים", icon: PackageSearch },
  { label: "האזור האישי שלי", icon: UserRound },
  { label: "כמה עולה השכרה?", icon: Clock3 },
  { label: "הודעה למיכל", icon: Mail },
];

const ADMIN_QUICK = [
  { label: "מה יש היום ומחר?", icon: CalendarDays },
  { label: "מיילים מלקוחות שעוד לא עניתי עליהם", icon: Mail },
  { label: "כמה נכנס החודש?", icon: Clock3 },
  { label: "לידים חדשים", icon: UserRound },
];

export function ChatBot() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const isAuth = !!user;
  const cart = useCart();
  const setStatus = useServerFn(adminSetStatus);
  const [doneActions, setDoneActions] = useState<Set<string>>(new Set());
  // Fixed permanently to her chosen artwork (bot-antenna-heart.png) — this
  // used to be admin-replaceable from /admin/gallery, but that async
  // lookup could flash the old bundled avatar before the custom one
  // resolved, same class of issue as the home hero's fixed-variant fix.
  const avatarSrc = botAntennaHeart;
  // Same admin-replaceable heart used for the favicon/hero — see
  // /admin/gallery ← "סמל האתר (הלב)".
  const { url: customHeart } = useSiteIcon();
  const heartSrc = customHeart ?? heartIcon;
  const userName =
    (user?.user_metadata as { full_name?: string; name?: string } | null)?.full_name ||
    (user?.user_metadata as { full_name?: string; name?: string } | null)?.name ||
    user?.email?.split("@")[0] ||
    undefined;
  const greeting = isAdmin
    ? `היי מיכל 💗\nמצב ניהול: אפשר לשאול אותי על הזמנות, הכנסות, לידים ולקוחות, לבקש שאחפש במיילים ושאכין טיוטות תשובה (אני לא שולחת — רק טיוטה), ולבקש שינויי סטטוס עם כפתור אישור.`
    : isAuth
    ? `היי ${userName || ""}, אני נועה 💗\nאני כאן כדי לבדוק זמינות אמיתית, למצוא אביזרים, לחשב מחיר וגם לעזור לך לסגור הזמנה.`
    : "היי, אני נועה 💗\nהעוזרת של Sweetbaby. אפשר לבדוק איתי זמינות אמיתית, למצוא אביזרים, לחשב מחיר ולקבל עזרה בהזמנה.";

  const [open, setOpen] = useState(false);
  const [showNudge, setShowNudge] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: greeting }]);
  const [loading, setLoading] = useState(false);
  const [availOpen, setAvailOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [skuInput, setSkuInput] = useState("");
  const [availLoading, setAvailLoading] = useState(false);
  // Auth/admin state resolves after first render — refresh the greeting
  // while the conversation hasn't started yet.
  useEffect(() => {
    setMessages((m) => (m.length === 1 && m[0].role === "assistant" ? [{ role: "assistant", content: greeting }] : m));
  }, [greeting]);
  const chat = useServerFn(chatWithBot);
  const checkAvail = useServerFn(checkItemsAvailability);

  const [sessionId] = useState(() => {
    try {
      const key = "sweetbaby-chat-session-id";
      const existing = sessionStorage.getItem(key);
      if (existing) return existing;
      const fresh = crypto.randomUUID();
      sessionStorage.setItem(key, fresh);
      return fresh;
    } catch {
      return crypto.randomUUID();
    }
  });

  useEffect(() => {
    if (open) return;
    try {
      if (sessionStorage.getItem("sweetbaby-chat-nudge-shown")) return;
    } catch {
      // Storage may be unavailable in privacy mode; the invitation can still appear.
    }
    const timer = setTimeout(() => {
      setShowNudge(true);
      try {
        sessionStorage.setItem("sweetbaby-chat-nudge-shown", "1");
      } catch {
        // No persistence is needed for the chat to work.
      }
    }, 25_000);
    return () => clearTimeout(timer);
  }, [open]);

  // The nudge grows the button in place (see the JSX below) instead of
  // popping a separate card — it only needs to catch the eye for a few
  // seconds, then shrinks back to the normal compact pill on its own.
  useEffect(() => {
    if (!showNudge) return;
    const timer = setTimeout(() => setShowNudge(false), 7_000);
    return () => clearTimeout(timer);
  }, [showNudge]);

  // Lets the floating button be dragged a little out of the way (e.g. if it
  // covers something on the page) without that drag being mistaken for a
  // click that opens the chat — a real click never moves the pointer past
  // the small threshold below, so `moved` stays false and the click fires
  // normally.
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const justDraggedRef = useRef(false);

  const onDragPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: dragPos.x, origY: dragPos.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDragPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const ds = dragState.current;
    if (!ds) return;
    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) ds.moved = true;
    if (ds.moved) setDragPos({ x: ds.origX + dx, y: ds.origY + dy });
  };
  const onDragPointerUp = () => {
    if (dragState.current?.moved) justDraggedRef.current = true;
    dragState.current = null;
  };
  const handleBubbleClick = () => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    setOpen(true);
    setShowNudge(false);
  };

  const send = async (rawText: string) => {
    const text = rawText.trim();
    if (!text || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const res = await chat({
        data: {
          accessToken: sess.session?.access_token,
          messages: next.map(({ role, content }) => ({ role, content: content.slice(0, 6000) })).slice(-20),
          userName,
          isAuthenticated: isAuth,
          sessionId,
        },
      });
      setMessages([...next, { role: "assistant", content: res.reply || "…", ui: res.ui }]);
    } catch (error) {
      console.error("[SWEETBABY] chat bot request failed", error);
      setMessages([
        ...next,
        {
          role: "assistant",
          content:
            "יש לי רגע קטן של עומס 💗 נסי שוב בעוד דקה. אם דחוף, מיכל זמינה ב־054-8529277 או במייל s0548529277@gmail.com.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (p: ChatUi["products"][number]) => {
    cart.add({ id: p.sku, sku: p.sku, name: p.name, price: p.price, image_url: p.img });
    toast.success(`${p.name} נוסף לעגלה`);
  };

  const runAction = async (a: ChatUi["actions"][number]) => {
    const key = `${a.kind}:${a.id}:${a.status}`;
    try {
      if (a.kind === "lead_status") {
        const { error } = await (supabase as any)
          .from("inquiry_leads")
          .update({ status: a.status, updated_at: new Date().toISOString() })
          .eq("id", a.id);
        if (error) throw error;
      } else {
        await setStatus({ data: { kind: a.kind === "order_status" ? "order" : "booking", id: a.id, status: a.status } });
      }
      setDoneActions((s) => new Set(s).add(key));
      toast.success("עודכן ✓");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "העדכון נכשל");
    }
  };

  const runAvailability = async () => {
    if (!dateFrom || !dateTo) return;
    const skus = skuInput
      .split(/[,\s]+/)
      .map((sku) => sku.trim())
      .filter(Boolean);
    if (skus.length === 0) {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: "כתבי מק״טים מופרדים בפסיק, לדוגמה: 461, 483, 510." },
      ]);
      return;
    }
    setAvailLoading(true);
    try {
      const result = await checkAvail({ data: { skus, from: dateFrom, to: dateTo } });
      const lines = [`בדקתי זמינות לתאריכים ${dateFrom}–${dateTo}:`];
      for (const sku of skus) {
        const item = result[sku];
        if (!item) lines.push(`• מק״ט ${sku}: לא נמצא בקטלוג`);
        else lines.push(`• מק״ט ${sku}: ${item.available > 0 ? "פנוי ✓" : "תפוס בתאריכים האלה"}`);
      }
      lines.push("אפשר להמשיך לבחירה בקטלוג האביזרים: /rental-catalog");
      setMessages((current) => [...current, { role: "assistant", content: lines.join("\n") }]);
      setAvailOpen(false);
    } catch {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: "לא הצלחתי לבדוק את המלאי כרגע. נסי שוב בעוד רגע 💗" },
      ]);
    } finally {
      setAvailLoading(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed bottom-4 left-4 z-[100] font-body sm:bottom-6 sm:left-6"
      style={dragPos.x || dragPos.y ? { transform: `translate(${dragPos.x}px, ${dragPos.y}px)` } : undefined}
    >
      {!open && (
        <button
          type="button"
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={onDragPointerUp}
          onPointerCancel={onDragPointerUp}
          onClick={handleBubbleClick}
          aria-label="פתיחת הצ׳אט עם נועה"
          className={`group relative flex items-center gap-3 rounded-full border border-bone/60 bg-gradient-to-br from-bone via-bone to-sand/40 pr-2.5 pl-5 text-foreground shadow-[0_22px_55px_-18px_color-mix(in_oklab,var(--color-ink)_42%,transparent)] ring-1 ring-white/40 transition-all duration-500 hover:scale-[1.04] active:scale-95 touch-none select-none ${
            showNudge ? "py-4 pl-6 max-w-[280px] ring-2 ring-accent/60" : "py-2.5"
          }`}
        >
          <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
            <span className="absolute -right-6 -top-8 size-24 rounded-full bg-white/30 blur-2xl transition-opacity duration-500 group-hover:opacity-80" />
          </span>
          <span className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/70 bg-white/85 shadow-inner">
            <img
              src={avatarSrc}
              alt=""
              width={768}
              height={768}
              className="h-full w-full object-contain"
            />
            <span className="absolute bottom-1 right-1 size-3.5 rounded-full border-2 border-white bg-accent shadow-sm" />
          </span>
          {showNudge ? (
            <span className="relative text-right">
              <span className="block text-base font-bold leading-snug text-ink">היי! אני כאן לעזור — נסו אותי</span>
              <span className="mt-1 block text-xs font-medium leading-tight text-ink-soft">
                תנסו ואולי תופתעו
              </span>
            </span>
          ) : (
            <span className="relative text-right">
              <span className="block text-[11px] font-semibold leading-none text-ink-soft">
                נועה · זמינה עכשיו
              </span>
              <span className="mt-1 block text-base font-bold leading-tight text-ink">
                איך אפשר לעזור?
              </span>
            </span>
          )}
        </button>
      )}

      {open && (
        <section
          aria-label="צ׳אט עם נועה"
          className="flex h-[min(680px,calc(100dvh-32px))] w-[min(410px,calc(100vw-32px))] origin-bottom-left animate-in flex-col overflow-hidden rounded-2xl border border-secondary bg-card shadow-[0_30px_80px_-28px_color-mix(in_oklab,var(--color-primary)_45%,transparent)] zoom-in-95 duration-300"
        >
          <header className="relative overflow-hidden border-b border-secondary bg-secondary/70 px-4 py-3.5">
            <div className="absolute inset-y-0 left-0 w-24 bg-accent/20 blur-2xl" />
            <div className="relative flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative flex size-12 shrink-0 items-center justify-center rounded-full border border-card bg-card/80 shadow-sm">
                  <img
                    src={avatarSrc}
                    alt="נועה, העוזרת של Sweetbaby"
                    width={768}
                    height={768}
                    className="size-11 object-contain p-0.5"
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-card bg-accent" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-xl leading-none text-foreground">נועה</h2>
                    <span className="rounded-full bg-card/70 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      העוזרת של Sweetbaby
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Check className="size-3 text-accent" /> בודקת יומן ומלאי בזמן אמת
                  </p>
                </div>
              </div>
              <Button
                onClick={() => setOpen(false)}
                aria-label="סגירת הצ׳אט"
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-full border border-border/50 bg-card/70 hover:bg-card"
              >
                <X className="size-4" />
              </Button>
            </div>
          </header>

          <Conversation className="bg-background/65">
            <ConversationContent className="gap-4 px-4 py-5">
              {messages.map((message, index) => (
                <Message
                  key={`${message.role}-${index}`}
                  from={message.role}
                  className="max-w-[90%]"
                >
                  {message.role === "assistant" && (
                    <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                      <img
                        src={avatarSrc}
                        alt=""
                        width={768}
                        height={768}
                        loading="lazy"
                        className="size-6 rounded-full bg-secondary/60 object-contain p-0.5"
                      />
                      נועה
                    </div>
                  )}
                  <MessageContent
                    className={
                      message.role === "user"
                        ? "rounded-2xl rounded-bl-sm bg-primary px-4 py-3 text-primary-foreground"
                        : "leading-6"
                    }
                  >
                    <MessageResponse
                      className="text-sm leading-6"
                      components={{
                        a: ({ href, children }: any) => {
                          const h = String(href || "");
                          const internal = h.startsWith("/") || /^https?:\/\/(www\.)?sweetbabyphoto\.shop/.test(h);
                          const path = internal ? h.replace(/^https?:\/\/(www\.)?sweetbabyphoto\.shop/, "") || "/" : h;
                          const cls = "my-1 inline-flex items-center gap-1 rounded-full border border-primary/40 bg-secondary/60 px-3 py-1 text-xs font-medium text-primary no-underline shadow-sm transition hover:bg-primary hover:text-primary-foreground";
                          return internal ? (
                            <a href={path} className={cls} onClick={(e) => { e.preventDefault(); setOpen(false); navigate({ to: path as any }); }}>{children} ←</a>
                          ) : (
                            <a href={h} target="_blank" rel="noopener noreferrer" className={cls}>{children} ↗</a>
                          );
                        },
                        img: (props: any) =>
                          props.src === heartSrc ? (
                            <InlineHeartImg src={heartSrc} />
                          ) : isSafeImg(props.src) ? (
                            <img
                              src={props.src}
                              alt={props.alt || ""}
                              loading="lazy"
                              className="my-2 max-h-56 rounded-xl object-cover"
                            />
                          ) : null,
                      }}
                    >
                      {withHeartImage(message.content, heartSrc)}
                    </MessageResponse>
                  </MessageContent>
                  {!!message.ui?.photos?.length && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {message.ui.photos.map((photo) => (
                        <a key={photo.url} href={photo.url} target="_blank" rel="noopener noreferrer" aria-label={photo.caption || "פתיחת תמונה מהגלריה"}>
                          <img src={photo.url} alt={photo.caption || "צילום מהגלריה של מיכל"} loading="lazy" className="aspect-[3/4] w-full rounded-lg object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                  {message.ui && message.ui.products.length > 0 && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {message.ui.products.map((p) => {
                        const inCart = cart.lines.some((l) => l.sku === p.sku);
                        return (
                          <div key={p.sku} className="overflow-hidden rounded-xl border border-secondary bg-card shadow-sm">
                            {p.img ? (
                              <img src={p.img} alt={p.name} loading="lazy" className="aspect-square w-full object-cover" />
                            ) : (
                              <div className="flex aspect-square w-full items-center justify-center bg-secondary/40 text-muted-foreground">
                                <PackageSearch className="size-6" />
                              </div>
                            )}
                            <div className="p-2">
                              <p className="line-clamp-2 text-xs font-semibold leading-snug">{p.name}</p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                מק״ט {p.sku} · {p.price}₪
                                {p.available === false ? " · תפוס בתאריכים" : p.available ? " · פנוי ✓" : ""}
                              </p>
                              <Button
                                size="sm"
                                variant={inCart ? "secondary" : "default"}
                                disabled={inCart || p.available === false}
                                onClick={() => addToCart(p)}
                                className="mt-1.5 h-7 w-full rounded-full text-[11px]"
                              >
                                {inCart ? (
                                  <>
                                    <Check className="size-3" /> בעגלה
                                  </>
                                ) : (
                                  <>
                                    <Plus className="size-3" /> הוספה לעגלה
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {message.ui && (message.ui.buttons.length > 0 || message.ui.products.length > 0) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {message.ui.buttons.map((b) => (
                        <Button key={b.href + b.label} asChild size="sm" variant="outline" className="h-8 rounded-full border-primary/40 text-xs">
                          <Link to={b.href} onClick={() => setOpen(false)}>
                            {b.label}
                          </Link>
                        </Button>
                      ))}
                      {message.ui.products.length > 0 && !message.ui.buttons.some((b) => b.href === "/cart") && cart.count > 0 && (
                        <Button asChild size="sm" variant="outline" className="h-8 rounded-full border-primary/40 text-xs">
                          <Link to="/cart" onClick={() => setOpen(false)}>
                            <ShoppingBag className="size-3.5" /> לעגלה ({cart.count})
                          </Link>
                        </Button>
                      )}
                    </div>
                  )}
                  {message.ui?.actions?.map((a) => {
                    const key = `${a.kind}:${a.id}:${a.status}`;
                    const done = doneActions.has(key);
                    return (
                      <div key={key} className="mt-2 rounded-xl border border-accent/50 bg-accent/10 p-2.5 text-xs">
                        <p className="mb-2 font-medium">{a.summary || `שינוי סטטוס ל-${a.status}`}</p>
                        <Button size="sm" disabled={done} onClick={() => runAction(a)} className="h-7 rounded-full text-[11px]">
                          {done ? "בוצע ✓" : "אישור וביצוע"}
                        </Button>
                      </div>
                    );
                  })}
                </Message>
              ))}
              {loading && (
                <Message from="assistant">
                  <MessageContent className="flex-row items-center gap-2 text-muted-foreground">
                    <img
                      src={avatarSrc}
                      alt=""
                      width={768}
                      height={768}
                      loading="lazy"
                      className="size-7 rounded-full bg-secondary/60 object-contain p-0.5"
                    />
                    <Shimmer className="text-sm">נועה בודקת בשבילך...</Shimmer>
                  </MessageContent>
                </Message>
              )}
            </ConversationContent>
            <ConversationScrollButton className="bottom-3" aria-label="גלילה להודעה האחרונה" />
          </Conversation>

          <div className="border-t border-secondary/70 bg-card px-3 pt-3">
            {messages.length <= 1 && !loading && (
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                {(isAdmin ? ADMIN_QUICK : QUICK_QUESTIONS).map(({ label, icon: Icon }) => (
                  <Button
                    key={label}
                    onClick={() => send(label)}
                    variant="outline"
                    size="sm"
                    className="shrink-0 rounded-full border-secondary bg-secondary/25 text-foreground shadow-none hover:bg-secondary/55"
                  >
                    <Icon />
                    {label}
                  </Button>
                ))}
              </div>
            )}

            <div className="mb-3 overflow-hidden rounded-xl border border-secondary/80 bg-secondary/20">
              <Button
                onClick={() => setAvailOpen((value) => !value)}
                variant="ghost"
                className="h-10 w-full justify-between rounded-none px-3 text-sm hover:bg-secondary/30"
              >
                <span className="flex items-center gap-2">
                  <PackageSearch />
                  בדיקת אביזרים לפי מק״ט
                </span>
                <ChevronDown className={`transition-transform ${availOpen ? "rotate-180" : ""}`} />
              </Button>
              {availOpen && (
                <div className="grid gap-2 border-t border-secondary/70 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-muted-foreground">
                      מתאריך
                      <Input
                        type="date"
                        value={dateFrom}
                        onChange={(event) => setDateFrom(event.target.value)}
                        className="mt-1 bg-card"
                      />
                    </label>
                    <label className="text-xs text-muted-foreground">
                      עד תאריך
                      <Input
                        type="date"
                        value={dateTo}
                        onChange={(event) => setDateTo(event.target.value)}
                        className="mt-1 bg-card"
                      />
                    </label>
                  </div>
                  <Input
                    value={skuInput}
                    onChange={(event) => setSkuInput(event.target.value)}
                    placeholder="מק״טים, לדוגמה: 461, 483"
                    className="bg-card"
                  />
                  <Button
                    onClick={runAvailability}
                    disabled={availLoading || !dateFrom || !dateTo}
                    size="sm"
                    className="rounded-lg"
                  >
                    {availLoading ? "בודקת מלאי..." : "בדיקת זמינות"}
                  </Button>
                </div>
              )}
            </div>

            <PromptInput onSubmit={({ text }) => send(text)} className="pb-3">
              <PromptInputTextarea
                aria-label="כתיבת הודעה לנועה"
                placeholder="כתבי לי מה תרצי לדעת..."
                className="min-h-14 max-h-28 px-3 pt-3 text-sm"
              />
              <PromptInputFooter className="justify-between border-t border-secondary/50 px-2 py-2">
                <span className="pr-1 text-[10px] text-muted-foreground">
                  נועה היא בוט AI ועלולה לטעות לעיתים
                </span>
                <PromptInputSubmit
                  status={loading ? "submitted" : "ready"}
                  disabled={loading}
                  aria-label="שליחת הודעה"
                  className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Send className="size-4" />
                </PromptInputSubmit>
              </PromptInputFooter>
            </PromptInput>
          </div>
        </section>
      )}
    </div>
  );
}

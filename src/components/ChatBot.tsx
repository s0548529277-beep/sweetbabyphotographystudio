import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Check, ChevronDown, Clock3, PackageSearch, Send, X } from "lucide-react";
import { chatWithBot } from "@/lib/ai.functions";
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
import { useChatbotAvatar } from "@/lib/page-images";
import noaAvatar from "@/assets/noa-chat-avatar.png";

type Msg = { role: "user" | "assistant"; content: string };

const QUICK_QUESTIONS = [
  { label: "מתי הסטודיו פנוי?", icon: CalendarDays },
  { label: "מצאי לי אביזרים", icon: PackageSearch },
  { label: "כמה עולה השכרה?", icon: Clock3 },
];

export function ChatBot() {
  const { user } = useAuth();
  const isAuth = !!user;
  // Replaceable from /admin/gallery — falls back to the bundled artwork
  // until an admin uploads a custom one.
  const { url: customAvatar } = useChatbotAvatar();
  const avatarSrc = customAvatar ?? noaAvatar;
  const userName =
    (user?.user_metadata as { full_name?: string; name?: string } | null)?.full_name ||
    (user?.user_metadata as { full_name?: string; name?: string } | null)?.name ||
    user?.email?.split("@")[0] ||
    undefined;
  const greeting = isAuth
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

  const send = async (rawText: string) => {
    const text = rawText.trim();
    if (!text || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setLoading(true);
    try {
      const { reply } = await chat({
        data: { messages: next, userName, isAuthenticated: isAuth, sessionId },
      });
      setMessages([...next, { role: "assistant", content: reply }]);
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
    <div dir="rtl" className="fixed bottom-4 left-4 z-[100] font-body sm:bottom-6 sm:left-6">
      {!open && showNudge && (
        <div className="absolute bottom-[calc(100%+12px)] left-0 w-[min(310px,calc(100vw-32px))] animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="relative overflow-hidden rounded-2xl border border-secondary bg-card p-4 shadow-[0_20px_55px_-22px_color-mix(in_oklab,var(--color-primary)_30%,transparent)]">
            <div className="absolute inset-x-0 top-0 h-1 bg-secondary" />
            <Button
              onClick={() => setShowNudge(false)}
              aria-label="סגירת ההודעה"
              variant="ghost"
              size="icon-sm"
              className="absolute left-2 top-2 rounded-full text-muted-foreground"
            >
              <X />
            </Button>
            <div className="flex items-center gap-3 pl-7">
              <img
                src={avatarSrc}
                alt="נועה, העוזרת של Sweetbaby"
                width={768}
                height={768}
                className="size-12 shrink-0 rounded-full bg-secondary/50 object-contain p-1"
              />
              <div>
                <p className="font-semibold text-foreground">צריכה יד קטנה?</p>
                <p className="mt-0.5 text-sm leading-6 text-muted-foreground">
                  אני יכולה לבדוק מועד, למצוא אביזר או לחשב מחיר — ממש כאן.
                </p>
              </div>
            </div>
            <Button
              onClick={() => {
                setShowNudge(false);
                setOpen(true);
              }}
              className="mt-3 w-full rounded-xl bg-secondary text-secondary-foreground shadow-none hover:bg-secondary/80"
            >
              דברי עם נועה
              <Send />
            </Button>
          </div>
        </div>
      )}

      {!open && (
        <Button
          onClick={() => {
            setOpen(true);
            setShowNudge(false);
          }}
          aria-label="פתיחת הצ׳אט עם נועה"
          className="group h-auto rounded-full border border-secondary bg-card py-2 pr-2 pl-4 text-foreground shadow-[0_18px_50px_-20px_color-mix(in_oklab,var(--color-primary)_45%,transparent)] transition-transform hover:scale-[1.02] hover:bg-card"
        >
          <span className="relative flex size-14 items-center justify-center overflow-hidden rounded-full bg-secondary/60">
            <img
              src={avatarSrc}
              alt=""
              width={768}
              height={768}
              className="size-13 object-contain p-1"
            />
            <span className="absolute bottom-1 right-1 size-3 rounded-full border-2 border-card bg-accent" />
          </span>
          <span className="text-right">
            <span className="block text-[11px] font-medium text-muted-foreground">
              נועה · זמינה עכשיו
            </span>
            <span className="block text-sm font-semibold">איך אפשר לעזור?</span>
          </span>
        </Button>
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
                className="shrink-0 rounded-full hover:bg-card/60"
              >
                <ChevronDown />
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
                    <MessageResponse className="text-sm leading-6">
                      {message.content}
                    </MessageResponse>
                  </MessageContent>
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
                {QUICK_QUESTIONS.map(({ label, icon: Icon }) => (
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
                  אפשר לשאול גם במילים פשוטות
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

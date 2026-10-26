import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Send } from "lucide-react";
import { confirmNewbornContractByToken, getNewbornContractStatusByToken } from "@/lib/newborn-orders.functions";
import { getContractForSigning, submitContractSigning } from "@/lib/contract-signing.functions";
import michalLogoWordmark from "@/assets/michal-logo-wordmark.png";

// Section-by-section contract signing — owner request 2026-10-26: the client
// ticks "קראתי" next to every section, and only when all are ticked can she
// send; the studio then gets an email listing every confirmed section.
// Token-only, no login (same surface as /newborn/gallery/$token). Sending is
// a separate real click — never on page load — because some email clients
// pre-fetch links. kind: newborn | photo | outdoor.
export const Route = createFileRoute("/contract/$kind/$token")({
  head: () => ({
    meta: [{ title: "קריאה ואישור ההסכם | מיכל סיבוני" }, { name: "robots", content: "noindex" }],
  }),
  component: ContractSigningPage,
});

type Section = { title: string; html: string };
type Loaded = { contactName: string; confirmedAt: string | null; sections: Section[] };

const ROSE = "#c23b6d";

function ContractSigningPage() {
  const { kind, token } = Route.useParams();
  const isNewborn = kind === "newborn";
  const validKind = isNewborn || kind === "photo" || kind === "outdoor";

  const getNewborn = useServerFn(getNewbornContractStatusByToken);
  const confirmNewborn = useServerFn(confirmNewbornContractByToken);
  const getOther = useServerFn(getContractForSigning);
  const submitOther = useServerFn(submitContractSigning);

  const [read, setRead] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["contract-signing", kind, token],
    enabled: validKind,
    retry: false,
    queryFn: async (): Promise<Loaded> =>
      isNewborn
        ? ((await getNewborn({ data: { token } })) as Loaded)
        : ((await getOther({ data: { kind: kind as "photo" | "outdoor", token } })) as Loaded),
  });

  const shell = (children: React.ReactNode) => (
    <div
      dir="rtl"
      className="min-h-screen bg-[#fdf3ec] text-[#4a3221] px-4 py-10"
      style={{ fontFamily: "'Fira Sans', sans-serif" }}
    >
      <div className="max-w-2xl mx-auto">
        <Link to="/">
          <img src={michalLogoWordmark} alt="michal" className="h-10 mx-auto mb-8" />
        </Link>
        {children}
      </div>
    </div>
  );

  if (validKind && query.isLoading) {
    return shell(
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[#8a6338]" />
      </div>,
    );
  }

  if (!validKind || query.isError || !query.data) {
    return shell(
      <p className="text-center">הקישור לא תקין או שפג תוקפו. אפשר לפנות אליי ישירות ואשלח קישור חדש.</p>,
    );
  }

  const { contactName, confirmedAt, sections } = query.data;

  if (sent || confirmedAt) {
    return shell(
      <div className="text-center py-10">
        <div className="h-16 w-16 rounded-full bg-[#4a3221] text-white flex items-center justify-center mx-auto mb-5">
          <Check className="h-7 w-7" />
        </div>
        <h1 className="text-2xl mb-2" style={{ fontFamily: "'DM Serif Display', serif" }}>
          תודה{contactName ? `, ${contactName}` : ""}!
        </h1>
        <p className="text-sm text-[#4a3221]/75">האישור נשלח אליי — מחכה ממש לתעד לכם רגעים מרגשים 💗</p>
      </div>,
    );
  }

  const allRead = sections.length > 0 && read.size === sections.length;

  const toggle = (i: number) =>
    setRead((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const send = async () => {
    if (!allRead) return;
    setSending(true);
    setError(null);
    try {
      if (isNewborn) await confirmNewborn({ data: { token, readCount: read.size } });
      else await submitOther({ data: { kind: kind as "photo" | "outdoor", token, readCount: read.size } });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "השליחה לא הצליחה, אפשר לנסות שוב");
    } finally {
      setSending(false);
    }
  };

  return shell(
    <>
      <h1 className="text-2xl text-center mb-2" style={{ fontFamily: "'DM Serif Display', serif", color: ROSE }}>
        היי {contactName || "יקרה"},
      </h1>
      <p className="text-sm text-center text-[#4a3221]/80 mb-8 leading-relaxed">
        נא לקרוא כל סעיף ולסמן ״קראתי״. בסוף, כשכל הסעיפים מסומנים, לוחצים על שליחה — זו החתימה הדיגיטלית שלך.
      </p>

      <div className="space-y-4">
        {sections.map((s, i) => {
          const isRead = read.has(i);
          return (
            <section
              key={`${i}-${s.title}`}
              className={`rounded-2xl bg-white/85 border p-5 transition-colors ${
                isRead ? "border-[#4a3221]/40" : "border-[#d9b98a]/40"
              }`}
            >
              <h2 className="font-semibold mb-2" style={{ color: ROSE }}>
                {s.title}
              </h2>
              <div
                className="text-sm leading-relaxed text-[#4a3221] [&_p]:my-1 [&_ul]:list-disc [&_ul]:ps-5"
                dangerouslySetInnerHTML={{ __html: s.html }}
              />
              <label className="mt-4 flex items-center gap-2 cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  checked={isRead}
                  onChange={() => toggle(i)}
                  className="h-5 w-5 accent-[#4a3221]"
                />
                <span className="text-sm font-semibold">קראתי</span>
              </label>
            </section>
          );
        })}
      </div>

      <div className="sticky bottom-0 mt-8 bg-[#fdf3ec]/95 backdrop-blur py-4 text-center">
        <p className="text-xs text-[#4a3221]/70 mb-3">
          סומנו {read.size} מתוך {sections.length} סעיפים
        </p>
        <button
          type="button"
          onClick={send}
          disabled={!allRead || sending}
          className="inline-flex items-center gap-2 bg-[#4a3221] text-white px-8 py-3.5 rounded-full font-semibold disabled:opacity-40"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          קראתי ואני מאשרת — שליחה
        </button>
        {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
      </div>
    </>,
  );
}

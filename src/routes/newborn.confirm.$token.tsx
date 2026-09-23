import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2 } from "lucide-react";
import {
  confirmNewbornContractByToken,
  getNewbornContractStatusByToken,
} from "@/lib/newborn-orders.functions";
import michalLogoWordmark from "@/assets/michal-logo-wordmark.png";

// The "קראתי ואני מאשרת" one-click confirmation landing page — same
// unbranded, no-login, token-only surface as /newborn/gallery/$token
// (see that route's own comment). Deliberately a separate real click on
// this page rather than auto-confirming on load: some email clients
// pre-fetch links for previews/scanning, which would otherwise record a
// false confirmation nobody actually gave.
export const Route = createFileRoute("/newborn/confirm/$token")({
  head: () => ({
    meta: [{ title: "אישור קריאת ההסכם | מיכל סיבוני" }, { name: "robots", content: "noindex" }],
  }),
  component: NewbornConfirmPage,
});

function NewbornConfirmPage() {
  const { token } = Route.useParams();
  const getStatus = useServerFn(getNewbornContractStatusByToken);
  const doConfirm = useServerFn(confirmNewbornContractByToken);
  const [confirming, setConfirming] = useState(false);
  const [justConfirmed, setJustConfirmed] = useState(false);

  const query = useQuery({
    queryKey: ["newborn-contract-status", token],
    queryFn: () => getStatus({ data: { token } }),
    retry: false,
  });

  if (query.isLoading) {
    return (
      <div dir="rtl" className="min-h-screen bg-[#fdf3ec] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#8a6338]" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div
        dir="rtl"
        className="min-h-screen bg-[#fdf3ec] flex items-center justify-center px-6 text-center"
      >
        <div>
          <Link to="/">
            <img src={michalLogoWordmark} alt="michal" className="h-10 mx-auto mb-4" />
          </Link>
          <p className="text-[#4a3221]">
            הקישור לא תקין או שפג תוקפו. אפשר לפנות אליי ישירות ואשלח קישור חדש.
          </p>
        </div>
      </div>
    );
  }

  const confirmed = justConfirmed || !!query.data.confirmedAt;

  const confirm = async () => {
    setConfirming(true);
    try {
      await doConfirm({ data: { token } });
      setJustConfirmed(true);
    } catch {
      // Best-effort UI: leave the button available to try again.
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#fdf3ec] text-[#4a3221] flex items-center justify-center px-6"
      style={{ fontFamily: "'Fira Sans', sans-serif" }}
    >
      <div className="max-w-sm w-full text-center py-16">
        <Link to="/">
          <img src={michalLogoWordmark} alt="michal" className="h-10 mx-auto mb-8" />
        </Link>

        {confirmed ? (
          <>
            <div className="h-16 w-16 rounded-full bg-[#4a3221] text-white flex items-center justify-center mx-auto mb-5">
              <Check className="h-7 w-7" />
            </div>
            <h1 className="text-2xl mb-2" style={{ fontFamily: "'DM Serif Display', serif" }}>
              תודה, {query.data.contactName}!
            </h1>
            <p className="text-sm text-[#4a3221]/75">
              האישור נקלט אצלי — מחכה ממש לתעד לכם רגעים מרגשים 💗
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl mb-3" style={{ fontFamily: "'DM Serif Display', serif" }}>
              היי {query.data.contactName},
            </h1>
            <p className="text-sm text-[#4a3221]/75 mb-8 leading-relaxed">
              לחיצה על הכפתור מהווה אישור שקראת את ההסכם במלואו ומסכימה לתנאיו — זו החתימה הדיגיטלית
              שלך.
            </p>
            <button
              type="button"
              onClick={confirm}
              disabled={confirming}
              className="inline-flex items-center gap-2 bg-[#4a3221] text-white px-8 py-3.5 rounded-full font-semibold disabled:opacity-60"
            >
              {confirming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              קראתי ואני מאשרת
            </button>
          </>
        )}
      </div>
    </div>
  );
}

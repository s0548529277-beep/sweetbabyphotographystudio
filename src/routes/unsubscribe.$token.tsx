import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { unsubscribeByToken } from "@/lib/newsletter-list.functions";

export const Route = createFileRoute("/unsubscribe/$token")({
  head: () => ({ meta: [{ title: "הסרה מרשימת התפוצה | Sweetbaby" }, { name: "robots", content: "noindex" }] }),
  component: Unsubscribe,
});

function Unsubscribe() {
  const { token } = Route.useParams();
  const run = useServerFn(unsubscribeByToken);
  const [state, setState] = useState<"working" | "done" | "missing" | "error">("working");

  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(token)) return setState("missing");
    run({ data: { token } })
      .then((r) => setState(r.ok ? "done" : "missing"))
      .catch(() => setState("error"));
  }, [token]);

  const text = {
    working: "מסירה אותך מהרשימה…",
    done: "הוסרת מרשימת התפוצה ולא תקבלי מאיתנו עוד עדכונים במייל.",
    missing: "הקישור לא תקין או שכבר הוסרת מהרשימה.",
    error: "משהו השתבש. אפשר לפנות אלינו בטלפון ונסיר אותך ידנית.",
  }[state];

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-20 text-center">
        <h1 className="font-display text-3xl text-primary mb-4">הסרה מרשימת התפוצה</h1>
        <p className="text-forest/80 text-lg">{text}</p>
      </main>
      <Footer />
    </div>
  );
}

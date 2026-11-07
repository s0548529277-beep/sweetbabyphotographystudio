import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Send, Printer, FileText } from "lucide-react";
import { heError } from "@/lib/he-errors";
import { listQuoteTemplates, previewQuote, sendQuote } from "@/lib/quotes.functions";

export const Route = createFileRoute("/_authenticated/admin/quotes")({
  component: QuotesAdmin,
});

function QuotesAdmin() {
  const listFn = useServerFn(listQuoteTemplates);
  const previewFn = useServerFn(previewQuote);
  const sendFn = useServerFn(sendQuote);
  const templates = useQuery({ queryKey: ["quote-templates"], queryFn: () => listFn() });
  const [templateId, setTemplateId] = useState("mini_studio");
  const [clientName, setClientName] = useState("");
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const preview = useQuery({
    queryKey: ["quote-preview", templateId, clientName],
    queryFn: () => previewFn({ data: { templateId, clientName } }),
  });

  const send = async () => {
    if (!to.trim()) return toast.error("נא למלא כתובת מייל");
    if (!window.confirm(`לשלוח את הצעת המחיר אל ${to.trim()}?`)) return;
    setSending(true);
    try {
      await sendFn({ data: { templateId, clientName, to: to.trim() } });
      toast.success("ההצעה נשלחה");
    } catch (e) {
      toast.error(heError(e));
    } finally {
      setSending(false);
    }
  };

  const print = () => {
    const w = window.open("", "_blank");
    if (!w || !preview.data) return;
    w.document.write(preview.data.html);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl">
          <FileText className="h-6 w-6" /> הצעות מחיר
        </h1>
        <p className="text-sm text-muted-foreground">
          הצעת מחיר מעוצבת עם הלוגו שלך. נשלחת רק כשאת לוחצת "שליחה" — שום דבר לא יוצא אוטומטית.
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4 rounded-2xl border bg-card p-4">
          <div className="space-y-1.5">
            <Label>תבנית</Label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              {(templates.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>שם הלקוחה (לא חובה)</Label>
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>מייל הלקוחה</Label>
            <Input type="email" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={send} disabled={sending}>
              <Send className="ml-1 h-4 w-4" /> שליחה
            </Button>
            <Button variant="outline" onClick={print} disabled={!preview.data}>
              <Printer className="ml-1 h-4 w-4" /> הדפסה / PDF
            </Button>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border bg-card">
          {preview.data ? (
            <iframe title="תצוגה מקדימה" srcDoc={preview.data.html} className="h-[820px] w-full" />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">{preview.isError ? "טעינת התצוגה נכשלה" : "טוען…"}</p>
          )}
        </div>
      </div>
    </div>
  );
}

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const intakeSchema = z.object({
  clientName: z.string().min(1).max(120),
  phone: z.string().min(5).max(40),
  email: z.string().email().max(200),
  sessionType: z.string().max(200).optional().default(""),
  sessionDate: z.string().max(200).optional().default(""),
  peopleCount: z.string().max(60).optional().default(""),
  babyAge: z.string().max(120).optional().default(""),
  cameraBrand: z.string().max(200).optional().default(""),
  flashExperience: z.string().max(200).optional().default(""),
  needProps: z.string().max(500).optional().default(""),
  specialRequests: z.string().max(2000).optional().default(""),
  agreed: z.literal(true),
});

const STUDIO_EMAIL = "s0548529277@gmail.com";

export const submitStudioIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => intakeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Save to DB
    const { error: insErr } = await supabase.from("studio_intake_forms").insert({
      user_id: userId,
      payload: JSON.parse(JSON.stringify(data)),
    });
    if (insErr) throw new Error(insErr.message);

    // Send confirmation emails to customer + studio
    try {
      const key = process.env.RESEND_API_KEY;
      const lovableKey = process.env.LOVABLE_API_KEY;
      if (key && lovableKey) {
        const rows: Array<[string, string]> = [
          ["שם מלא", data.clientName],
          ["טלפון", data.phone],
          ["אימייל", data.email],
          ["סוג הצילום", data.sessionType],
          ["תאריך/שעה מבוקשים", data.sessionDate],
          ["מספר משתתפים", data.peopleCount],
          ["גיל התינוק", data.babyAge],
          ["מותג מצלמה", data.cameraBrand],
          ["ניסיון פלאש/סטודיו", data.flashExperience],
          ["אביזרים בהשכרה", data.needProps],
          ["בקשות מיוחדות", data.specialRequests],
        ];
        const tableRows = rows
          .filter(([, v]) => v && String(v).trim().length > 0)
          .map(
            ([k, v]) =>
              `<tr><td style="padding:6px 10px;color:#6b8a63;white-space:nowrap"><strong>${k}</strong></td><td style="padding:6px 10px">${String(v).replace(/</g, "&lt;")}</td></tr>`,
          )
          .join("");
        const html = `<div dir="rtl" style="font-family:Arial,sans-serif;color:#2d3d2b;max-width:600px;margin:auto">
          <h2 style="color:#2d3d2b">הסכם תיאום ציפיות · Sweetbaby 💗</h2>
          <p>שלום ${data.clientName}, תודה שמילאת את טופס תיאום הציפיות להשכרת הסטודיו.</p>
          <table style="width:100%;border-collapse:collapse;background:#faf7f4;border-radius:8px">${tableRows}</table>
          <p style="margin-top:16px">אישרת שקראת והסכמת להסכם תיאום הציפיות ולכללי הסטודיו.</p>
          <p style="color:#6b8a63;font-size:13px">כתובת הסטודיו: תלמוד ירושלמי 24, בית שמש · לשאלות: ${STUDIO_EMAIL} / 054-8529277</p>
        </div>`;

        const subject = `הסכם תיאום ציפיות · ${data.clientName}`;
        const recipients = [STUDIO_EMAIL, data.email];
        for (const to of recipients) {
          await fetch("https://connector-gateway.lovable.dev/resend/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${lovableKey}`,
              "X-Connection-Api-Key": key,
            },
            body: JSON.stringify({
              from: "Sweetbaby <onboarding@resend.dev>",
              to: [to],
              subject,
              html,
            }),
          }).catch((e) => console.error("[SWEETBABY] intake resend failed", to, e));
        }
      }
    } catch (e) {
      console.error("[SWEETBABY] studio intake email failed", e);
    }

    // Admin notification row (best-effort)
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("admin_notifications").insert({
        type: "studio_intake",
        title: `טופס תיאום ציפיות · ${data.clientName}`,
        body: data as unknown as Record<string, unknown>,
      });
    } catch (e) {
      console.error("[SWEETBABY] intake admin notify failed", e);
    }

    return { ok: true };
  });

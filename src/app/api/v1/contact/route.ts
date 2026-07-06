import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/contact — Public contact / partner intake.
 *
 * Accepts { name, email, phone?, subject?, message, kind? } and inserts a row
 * into public.contact_messages via the service-role client (the table has a
 * public insert policy too, but we use service-role so the write never depends
 * on the caller's session and to keep the payload shape locked server-side).
 *
 * Best-effort: after a successful insert, if N8N_WEBHOOK_BASE_URL is set, POSTs
 * the message to `${base}/contact` for the notification workflow. That call is
 * wrapped in try/catch and never fails the request.
 *
 * The contact_messages table may not yet exist on the remote DB — on insert
 * error we log and still return an error status, but any unexpected throw is
 * caught and reported cleanly.
 */
export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const kind = body.kind === "partner" ? "partner" : "contact";

    // Validate required fields.
    if (!email || !message) {
      return NextResponse.json(
        { error: "البريد الإلكتروني والرسالة مطلوبان" },
        { status: 400 },
      );
    }

    // Minimal email sanity check.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "البريد الإلكتروني غير صحيح" },
        { status: 400 },
      );
    }

    const supabase = await createServiceClient();
    const { error } = await supabase.from("contact_messages").insert({
      name: name || null,
      email,
      phone: phone || null,
      subject: subject || null,
      message,
      kind,
      status: "new",
      metadata: {},
    });

    if (error) {
      console.error(
        "[contact POST] Supabase error:",
        error.message,
        error.details,
        error.hint,
        error.code,
      );
      return NextResponse.json(
        { error: "تعذّر إرسال رسالتك، حاول مرة أخرى" },
        { status: 500 },
      );
    }

    // Best-effort push to n8n (inert unless N8N_WEBHOOK_BASE_URL is set). Never
    // fails the request.
    const base = process.env.N8N_WEBHOOK_BASE_URL;
    if (base) {
      try {
        await fetch(`${base.replace(/\/$/, "")}/contact`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name || null,
            email,
            phone: phone || null,
            subject: subject || null,
            message,
            kind,
            timestamp: new Date().toISOString(),
          }),
        });
      } catch (e) {
        console.error(
          "[contact POST] n8n dispatch failed:",
          (e as Error).message,
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[contact POST] Unexpected error:", err);
    return NextResponse.json(
      { error: "تعذّر إرسال رسالتك، حاول مرة أخرى" },
      { status: 500 },
    );
  }
}

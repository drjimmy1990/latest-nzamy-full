import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { assertRole } from "@/lib/auth/assertRole";
import { PAYMENT_LINK_COLUMNS, readIssuerVat } from "@/lib/finance/invoiceFinanceCore";
import { readInvoiceVat } from "@/lib/finance/invoiceVat";
import { buildInvoiceMessage, invoiceNotification, statementReference } from "@/lib/finance/invoiceMessage";
import { emailConfigured, isPlainEmail, renderEmailAr, sendEmail } from "@/lib/email/sendEmail";

/**
 * POST /api/v1/lawyer/finance/<paymentId>/send — «إرسال بيان الأتعاب للموكّل»
 * (owner TODO 17-Nov, N01-13).
 *
 * There is NO online «payment link» for an office's statement: offices
 * collect in cash / by bank transfer and record it by hand, and the platform's
 * /checkout sells only the platform's own catalog (office payments are the
 * open B3 step, an owner decision). So this route never charges, never builds
 * a pay URL, and says so in the message (src/lib/finance/invoiceMessage.ts).
 * What it does:
 *   1. returns the statement as plain text — the page copies it for WhatsApp
 *      or any other channel the lawyer uses;
 *   2. when the statement's client card is linked to a platform account
 *      (lawyer_clients.client_user_id), writes ONE in-app notification to that
 *      account (no link: the client has no screen for it) — not again within
 *      10 minutes;
 *   3. when e-mail is configured on this server (RESEND_API_KEY + EMAIL_FROM)
 *      and the card has an address, e-mails it once per statement per day
 *      (Resend idempotency key).
 *
 * Only the statement's issuer may send it (metadata.issued_by / owner_user_id),
 * only while it is open (requires_payment) — never a void or settled one. The
 * statement and the card are read THROUGH the session (RLS); the service role
 * only writes the notification and reads the issuer's VAT identity.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const RECENT_MS = 10 * 60 * 1000;

type EmailOutcome = "sent" | "unavailable" | "failed" | "no_address";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await params;
    if (!id || id.length > 100) return NextResponse.json({ error: "paymentId required" }, { status: 400 });

    const { data: row, error } = await supabase
      .from("payments")
      .select(PAYMENT_LINK_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("[lawyer/finance send] read failed:", error.message);
      return NextResponse.json({ error: "تعذّرت قراءة بيان الأتعاب" }, { status: 500 });
    }
    const p = (row ?? null) as Record<string, unknown> | null;
    const meta = ((p?.metadata as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
    // The participants policy also lets a REQUESTER read a payment of his
    // request: reading it is not owning it. Only the issuer sends.
    const isIssuer = !!p && meta.invoice === true && (meta.issued_by === user.id || p.owner_user_id === user.id);
    if (!isIssuer) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (p.status !== "requires_payment") {
      return NextResponse.json(
        { error: p.status === "void" ? "هذا البيان ملغى، فلا يُرسل." : "هذا البيان مسدّد بالكامل، فلا مطالبة لإرسالها." },
        { status: 409 },
      );
    }

    const vat = readInvoiceVat(meta);
    let issuerName = vat?.issuerName ?? "";
    const service = await createServiceClient();
    if (!issuerName) {
      const issuer = await readIssuerVat({ admin: service }, user.id);
      if (issuer.ok) issuerName = issuer.issuer.name;
    }

    const totalHalalas = Math.round(Number(p.amount ?? 0) * 100);
    const paidHalalas = Math.round(Number(typeof meta.paidAmount === "number" ? meta.paidAmount : 0) * 100);
    const created = typeof p.created_at === "string" ? new Date(p.created_at) : null;
    const input = {
      issuerName,
      clientName: typeof meta.client === "string" ? meta.client : "",
      description: typeof meta.description === "string" ? meta.description : "أتعاب قانونية",
      reference: statementReference(String(p.id)),
      date: created && Number.isFinite(created.getTime())
        ? created.toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" })
        : "",
      totalHalalas,
      paidHalalas,
      vat,
    };
    const message = buildInvoiceMessage(input);

    // The client card — through the session, so only the issuer's own card.
    const cardId = typeof p.lawyer_client_id === "string" ? p.lawyer_client_id
      : typeof meta.clientId === "string" ? meta.clientId : null;
    let clientUserId: string | null = null;
    let clientEmail: string | null = null;
    if (cardId) {
      const { data: card } = await supabase
        .from("lawyer_clients")
        .select("client_user_id, email")
        .eq("id", cardId)
        .eq("owner_user_id", user.id)
        .maybeSingle();
      clientUserId = typeof card?.client_user_id === "string" ? card.client_user_id : null;
      clientEmail = isPlainEmail(card?.email) ? (card?.email as string) : null;
    }

    // 2. in-app notification, at most once per 10 minutes per statement
    let notified = false;
    let notifySkipped: "no_account" | "recent" | "failed" | null = clientUserId ? null : "no_account";
    if (clientUserId) {
      const note = invoiceNotification(input);
      const since = new Date(Date.now() - RECENT_MS).toISOString();
      const { data: recent, error: recentError } = await service
        .from("notifications")
        .select("id")
        .eq("user_id", clientUserId)
        .eq("title", note.title)
        .eq("body", note.body)
        .gte("created_at", since)
        .limit(1);
      if (!recentError && (recent ?? []).length > 0) {
        notifySkipped = "recent";
      } else {
        const { error: insError } = await service
          .from("notifications")
          .insert({ user_id: clientUserId, title: note.title, body: note.body, href: null });
        if (insError) {
          console.error("[lawyer/finance send] notification failed:", insError.message);
          notifySkipped = "failed";
        } else {
          notified = true;
        }
      }
    }

    // 3. e-mail, only where it is configured
    let email: EmailOutcome = "no_address";
    if (clientEmail) {
      if (!emailConfigured()) {
        email = "unavailable";
      } else {
        const rendered = renderEmailAr({
          heading: message.heading,
          paragraphs: message.paragraphs,
          details: message.details,
          footer: message.footer,
        });
        const day = new Date().toISOString().slice(0, 10);
        email = await sendEmail({
          to: clientEmail,
          subject: message.subject,
          text: rendered.text,
          html: rendered.html,
          tag: "fee_statement",
          idempotencyKey: `fee-statement-${String(p.id)}-${day}`,
        });
      }
    }

    return NextResponse.json({ text: message.text, notified, notifySkipped, email }, { headers: NO_STORE });
  } catch (err) {
    console.error("[lawyer/finance send] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

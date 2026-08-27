import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/access-control";
import { isReceiptMethod } from "@/lib/services/receiptSerial";
import { tafqit } from "@/lib/services/tafqit";

/**
 * سندات القبض — owner item ١٥.
 *
 * The only door. `public.receipts` has a SELECT policy and nothing else (see
 * 20260826_receipts.sql), so RLS cannot write a row at all and this route,
 * behind requireAdmin() with the service-role client, is the sole way a
 * receipt comes into existence. A permissive insert policy would have let any
 * signed-in client mint a receipt against their own order.
 *
 * The serial is NOT sent, computed, or accepted here. It is a stored generated
 * column over the table's bigserial, so two admins issuing at the same instant
 * get different numbers by construction rather than by a read-then-write this
 * route would have to get right.
 *
 * What this route does NOT do: render a PDF. The owner's ruling on س٧ was a
 * dual path — a generated document plus a manual upload — and only the manual
 * half is buildable today. Rendering Arabic to PDF on the server needs text
 * shaping and an embedded Arabic font, which the installed jsPDF does not do
 * (its bundled fonts are Latin-only and it performs no bidi or joining), and
 * the ZATCA QR needs a package that is not installed either. Adding both is a
 * dependency decision, not something to slip in behind a feature. The record
 * this route writes is complete enough that the document can be generated from
 * it whenever that decision is made — including `amount_words`, stored rather
 * than recomputed so an issued receipt keeps saying what it said.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.isAdmin || !gate.userId) {
    return NextResponse.json({ error: gate.error ?? "غير مصرح" }, { status: gate.status ?? 403 });
  }

  let body: {
    requestId?: string;
    amount?: number | string;
    payerName?: string;
    method?: string;
    reference?: string;
    notes?: string;
    attachmentId?: string | number;
  };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 }); }

  const amount = typeof body.amount === "string" ? Number(body.amount) : body.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "المبلغ مطلوب ويجب أن يكون أكبر من صفر." }, { status: 400 });
  }
  if (!isReceiptMethod(body.method)) {
    return NextResponse.json({ error: "طريقة السداد غير معروفة." }, { status: 400 });
  }

  // Refused rather than stored blank. `amount_words` is NOT NULL in the table
  // and a receipt with no words line is not a receipt — tafqit() returns ""
  // for anything it cannot express, and that has to surface here rather than
  // become an empty column nobody notices until a client is holding it.
  const amountWords = tafqit(amount);
  if (!amountWords) {
    return NextResponse.json({ error: "تعذّر تفقيط هذا المبلغ. راجع القيمة." }, { status: 400 });
  }

  const admin = await createServiceClient();

  // The order must exist before a receipt points at it: `request_id` is
  // nullable (a receipt outlives its order on purpose) so the FK alone would
  // accept null and silently orphan a receipt whose id was mistyped.
  if (body.requestId) {
    const { data: order } = await admin
      .from("service_requests").select("id").eq("id", body.requestId).maybeSingle();
    if (!order) {
      return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
    }
  }

  // The scanned paper receipt, when one was uploaded — bound to THIS order
  // before it is recorded, the same check the deliverable path makes. Without
  // it a receipt could point at another order's attachment.
  let attachmentId: number | null = null;
  if (body.attachmentId !== undefined && body.attachmentId !== null && body.attachmentId !== "") {
    const raw = String(body.attachmentId);
    if (!/^\d+$/.test(raw)) {
      return NextResponse.json({ error: "معرف المرفق غير صالح" }, { status: 400 });
    }
    const { data: attachment } = await admin
      .from("attachments").select("request_id").eq("id", raw).maybeSingle();
    if (!attachment || (body.requestId && attachment.request_id !== body.requestId)) {
      return NextResponse.json({ error: "المرفق غير مرتبط بهذا الطلب" }, { status: 400 });
    }
    attachmentId = Number(raw);
  }

  const { data: receipt, error } = await admin
    .from("receipts")
    .insert({
      request_id: body.requestId ?? null,
      // Rounded to the halala here as well as inside tafqit(), so the figure
      // stored and the words stored can never describe different amounts.
      amount: Math.round(amount * 100) / 100,
      amount_words: amountWords,
      payer_name: body.payerName?.trim() || null,
      method: body.method,
      reference: body.reference?.trim() || null,
      notes: body.notes?.trim() || null,
      attachment_id: attachmentId,
      issued_by: gate.userId,
    })
    .select()
    .single();

  if (error) {
    console.error("[admin receipts] insert failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: receipt });
}

/**
 * How many receipts one read returns.
 *
 * 100 because that is what this route has always returned, not because 100 is
 * a meaningful number of receipts — it was picked as "more than anyone will
 * ever scroll". Left where it is: the only caller passes `?requestId=`
 * (ReceiptPanel.tsx:51), and an order carries one receipt, or two when a fee
 * is collected in instalments. The unfiltered branch has no caller at all.
 *
 * What changes is that the cap is no longer silent. Before this, a hundredth
 * receipt was the last one that existed as far as any reader was concerned.
 */
const RECEIPTS_PAGE = 100;

/**
 * GET /api/v1/admin/receipts?requestId=… — the receipts issued against one
 * order, or the latest 100 when no order is named.
 *
 * `total` is the count of receipts matching the SAME filter this read applied
 * — `request_id` is a query predicate, not something derived afterwards, so
 * the number is comparable to `data.length` and a caller can tell a full list
 * from a capped one. `null` when PostgREST returned no count: an unknown total
 * is withheld, never reported as `data.length`, which would make every capped
 * read look complete.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.isAdmin) {
    return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
  }

  const requestId = new URL(request.url).searchParams.get("requestId");
  const admin = await createServiceClient();
  let query = admin
    .from("receipts")
    .select("*", { count: "exact" })
    .order("id", { ascending: false })
    .limit(RECEIPTS_PAGE);
  if (requestId) query = query.eq("request_id", requestId);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    success: true,
    data: data ?? [],
    total: typeof count === "number" ? count : null,
  });
}

import { NextResponse } from "next/server";
import { getPaymentGatewayDiagnostic, requireStaff } from "@/lib/access-control";

/**
 * GET /api/v1/admin/payments/gateway-status — why online payment is or is not
 * on, for the «بوابة الدفع» card. Returns derived labels only (see
 * src/lib/payments/gatewayDiagnostic.ts); no key is ever returned or logged.
 *
 * NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY is inlined at build time, so this
 * reflects the build's publishable key — the one the checkout really uses.
 */
export async function GET() {
  const gate = await requireStaff("payments.read");
  if (!gate.ok) return gate.response;
  try {
    const diagnostic = await getPaymentGatewayDiagnostic();
    if (!diagnostic) {
      return NextResponse.json(
        { error: "حالة بوابة الدفع غير متاحة مؤقتاً" },
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return NextResponse.json(diagnostic, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json(
      { error: "حالة بوابة الدفع غير متاحة مؤقتاً" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

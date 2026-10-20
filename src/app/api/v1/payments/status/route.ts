import { NextResponse } from "next/server";
import { getPaymentGatewayStatus } from "@/lib/access-control";

/**
 * GET /api/v1/payments/status — Public payment gateway status.
 *
 * Returns: { status: "disabled" | "test" | "live", provider: string | null, disabled: boolean }
 *
 * Anon-readable so client pages (consultation/new, requests/new, find-lawyer,
 * wallet, finance) can gate payment actions on the admin-controlled flag
 * without needing admin credentials.
 */
export async function GET() {
  try {
    const { status, provider, disabled } = await getPaymentGatewayStatus();
    // Name the three public fields: nothing else the state may grow ever leaks.
    return NextResponse.json({ status, provider, disabled }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[payments/status] error:", err);
    // Fail closed: treat as disabled on error so we never silently allow a stub.
    return NextResponse.json(
      { status: "disabled", provider: null, disabled: true },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
import { NextResponse } from "next/server";
import { getPaymentGatewayStatus } from "@/lib/access-control";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { viewerGatewayState } from "@/lib/payments/testModeAccess";

/**
 * GET /api/v1/payments/status — Public payment gateway status.
 *
 * Returns: { status: "disabled" | "test" | "live", provider: string | null, disabled: boolean }
 *
 * Anon-readable so client pages (consultation/new, requests/new, find-lawyer,
 * wallet, finance) can gate payment actions on the admin-controlled flag
 * without needing admin credentials.
 *
 * Test mode is for platform staff and the accounts in public.test_accounts
 * only (B1 final review): everyone else, guests included, gets the disabled
 * state, so their buy buttons keep the request flow. Live and disabled are
 * answered without reading the session (viewerGatewayState,
 * src/lib/payments/testModeAccess.ts). The answer depends on the viewer, so
 * it is never cached.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { status, provider, disabled } = await viewerGatewayState(await getPaymentGatewayStatus(), {
      userId: async () => {
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        return user?.id ?? null;
      },
      admin: () => createServiceClient(),
    });
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
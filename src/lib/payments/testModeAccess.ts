/**
 * testModeAccess.ts — who may pay while the Moyasar gateway is in TEST mode
 * (B1 final review, finding 1). The owner runs test mode on the real site
 * first; test mode must not be open to the public there.
 *
 * In test mode online checkout is open ONLY to:
 *   - platform staff: profiles.user_type = 'admin', or a row in
 *     public.platform_staff (20261019_30);
 *   - the accounts in public.test_accounts (service-only, 20261017_44).
 * Everyone else — guests included — sees the gateway exactly as disabled:
 *   GET /api/v1/payments/status → {status:"disabled", provider:null,
 *   disabled:true}; POST /api/v1/payments/checkout → 503
 *   «الدفع الإلكتروني غير متاح حالياً»; /checkout → the same notice; so the
 *   buy buttons keep today's request flow (owner ٢٤٦). Live mode is NOT gated.
 *
 * The lookups use the service client, keyed only by the signed-in user's id.
 * Deploy order: test_accounts missing (42P01 / PGRST205) → not a test account,
 * logged once; platform_staff missing → only the admin profile counts. Any
 * other read error, or a throw, fails closed (not allowed). Never throws.
 *
 * Fulfilment, the webhook, the sweep and refunds do not pass through here:
 * they act on orders that already exist, with no viewer.
 *
 * Pure: relative imports only (type-only for Supabase), so `node --test`
 * loads it (testModeAccess.test.ts).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentGatewayState } from "../paymentGatewayPolicy.ts";

export interface TestModeAccess {
  isStaff: boolean;
  isTestAccount: boolean;
}

const NO_ACCESS: TestModeAccess = { isStaff: false, isTestAccount: false };

const DISABLED_STATE: PaymentGatewayState = { status: "disabled", provider: null, disabled: true };

/**
 * The rule. `live` is open to every buyer (not gated); `test` only to staff
 * or a listed test account; anything else is closed.
 */
export function testModeAllowed(input: { mode: unknown; isStaff: boolean; isTestAccount: boolean }): boolean {
  if (input.mode === "live") return true;
  if (input.mode === "test") return input.isStaff === true || input.isTestAccount === true;
  return false;
}

/** What a viewer sees: in test mode a refused viewer gets the disabled state. */
export function gatewayStateFor(state: PaymentGatewayState, allowed: boolean): PaymentGatewayState {
  if (state.status === "test" && !allowed) return { ...DISABLED_STATE };
  return state;
}

const isMissingTable = (code: string | undefined): boolean => code === "42P01" || code === "PGRST205";

const missingLogged = new Set<string>();

function logMissingOnce(table: string, consequence: string): void {
  if (missingLogged.has(table)) return;
  missingLogged.add(table);
  console.warn(`[payments/test-mode] public.${table} does not exist yet; ${consequence}`);
}

type Row = { data: unknown; error: { code?: string; message?: string } | null };

/**
 * profiles.user_type, platform_staff and test_accounts for this user, with the
 * service client. A null / empty id reads nothing and allows nothing.
 */
export async function readTestModeAccess(admin: SupabaseClient, userId: string | null): Promise<TestModeAccess> {
  if (!userId) return { ...NO_ACCESS };
  try {
    const [profile, staff, testAccount] = (await Promise.all([
      admin.from("profiles").select("user_type").eq("id", userId).maybeSingle(),
      admin.from("platform_staff").select("user_id").eq("user_id", userId).maybeSingle(),
      admin.from("test_accounts").select("user_id").eq("user_id", userId).maybeSingle(),
    ])) as Row[];

    if (profile.error) {
      console.error("[payments/test-mode] reading the profile failed; test mode refused:", profile.error.code);
      return { ...NO_ACCESS };
    }
    let staffRow = false;
    if (staff.error) {
      if (isMissingTable(staff.error.code)) {
        logMissingOnce("platform_staff", "only profiles.user_type = 'admin' counts as staff for test mode");
      } else {
        console.error("[payments/test-mode] reading platform_staff failed; test mode refused:", staff.error.code);
        return { ...NO_ACCESS };
      }
    } else {
      staffRow = staff.data !== null && staff.data !== undefined;
    }
    let testRow = false;
    if (testAccount.error) {
      if (isMissingTable(testAccount.error.code)) {
        logMissingOnce("test_accounts", "no account counts as a test account for test mode");
      } else {
        console.error("[payments/test-mode] reading test_accounts failed; test mode refused:", testAccount.error.code);
        return { ...NO_ACCESS };
      }
    } else {
      testRow = testAccount.data !== null && testAccount.data !== undefined;
    }

    const isAdmin = (profile.data as { user_type?: unknown } | null)?.user_type === "admin";
    return { isStaff: isAdmin || staffRow, isTestAccount: testRow };
  } catch (err) {
    console.error("[payments/test-mode] the lookup threw; test mode refused:", err instanceof Error ? err.message : "unknown");
    return { ...NO_ACCESS };
  }
}

/**
 * GET /api/v1/payments/status and /checkout: the gateway state this viewer
 * sees. Live and disabled pass through untouched (no session read, no
 * lookup); test mode reads the session, then the lookups. Never throws: a
 * failure is the disabled state.
 */
export async function viewerGatewayState(
  state: PaymentGatewayState,
  deps: { userId: () => Promise<string | null>; admin: () => Promise<SupabaseClient> },
): Promise<PaymentGatewayState> {
  if (state.status !== "test" || state.disabled) return state;
  try {
    const userId = await deps.userId();
    if (!userId) return { ...DISABLED_STATE };
    const access = await readTestModeAccess(await deps.admin(), userId);
    return gatewayStateFor(state, testModeAllowed({ mode: state.status, ...access }));
  } catch (err) {
    console.error("[payments/test-mode] the viewer check threw; gateway shown as disabled:", err instanceof Error ? err.message : "unknown");
    return { ...DISABLED_STATE };
  }
}

/**
 * POST /api/v1/payments/checkout: may this signed-in user start a checkout in
 * this gateway mode? Live → true with no lookup. Never throws.
 */
export async function checkoutModeAllowed(
  admin: SupabaseClient,
  mode: "test" | "live",
  userId: string,
): Promise<boolean> {
  if (mode === "live") return true;
  const access = await readTestModeAccess(admin, userId);
  return testModeAllowed({ mode, ...access });
}

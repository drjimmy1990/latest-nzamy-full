import { resolveMoyasarConfig, type MoyasarEnv } from "./payments/moyasarConfig.ts";

export type PaymentGatewayStatus = "disabled" | "test" | "live";

/**
 * Public: GET /api/v1/payments/status returns exactly these three fields to
 * anyone. Never add a key, a secret or a disabled reason here.
 */
export interface PaymentGatewayState {
  status: PaymentGatewayStatus;
  provider: string | null;
  disabled: boolean;
}

export interface PaymentGatewayRuntime {
  deploymentEnvironment?: string;
  allowStubPayments?: boolean;
  /** Moyasar keys from the server environment (never logged or returned). */
  moyasar?: MoyasarEnv;
  /** isBillingCompanyComplete() of platform_settings.billing_company. */
  billingCompanyComplete?: boolean;
}

const DISABLED_GATEWAY: PaymentGatewayState = {
  status: "disabled",
  provider: null,
  disabled: true,
};

/**
 * Resolve the stored setting through a fail-closed runtime policy.
 *
 * - unknown/malformed values are disabled;
 * - the stub is accepted only as `test`, with an explicit local/staging
 *   environment and an explicit server-side opt-in;
 * - `moyasar` goes through resolveMoyasarConfig: `test` needs test keys,
 *   `live` needs live keys and a complete billing company, both need the
 *   webhook secret. It is not tied to the deployment environment (the owner
 *   runs test mode on the real site first).
 */
export function resolvePaymentGatewayState(
  storedValue: unknown,
  runtime: PaymentGatewayRuntime = {},
): PaymentGatewayState {
  if (typeof storedValue !== "object" || storedValue === null || Array.isArray(storedValue)) {
    return DISABLED_GATEWAY;
  }

  const { status, provider } = storedValue as {
    status?: unknown;
    provider?: unknown;
  };
  const environment = runtime.deploymentEnvironment?.trim().toLowerCase();
  const stubEnvironment = environment === "local" || environment === "staging";

  if (
    status === "test" &&
    provider === "stub" &&
    runtime.allowStubPayments === true &&
    stubEnvironment
  ) {
    return { status: "test", provider: "stub", disabled: false };
  }

  if (provider === "moyasar") {
    const cfg = resolveMoyasarConfig(
      storedValue,
      runtime.moyasar ?? {},
      runtime.billingCompanyComplete === true,
    );
    if (cfg.enabled) return { status: cfg.mode, provider: "moyasar", disabled: false };
  }

  return DISABLED_GATEWAY;
}

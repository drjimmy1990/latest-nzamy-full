export type PaymentGatewayStatus = "disabled" | "test" | "live";

export interface PaymentGatewayState {
  status: PaymentGatewayStatus;
  provider: string | null;
  disabled: boolean;
}

export interface PaymentGatewayRuntime {
  deploymentEnvironment?: string;
  allowStubPayments?: boolean;
}

const DISABLED_GATEWAY: PaymentGatewayState = {
  status: "disabled",
  provider: null,
  disabled: true,
};

/**
 * Resolve the stored setting through a fail-closed runtime policy.
 *
 * There is no production payment-provider adapter yet. Consequently:
 * - unknown/malformed values are disabled;
 * - `live` is disabled even if an administrator stores it;
 * - the stub is accepted only with an explicit local/staging environment and
 *   an explicit server-side opt-in.
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

  return DISABLED_GATEWAY;
}


"use client";

import { useEffect, useState } from "react";

export type PaymentGatewayStatus = "disabled" | "test" | "live";

export interface PaymentsStatus {
  status: PaymentGatewayStatus;
  provider: string | null;
  disabled: boolean;
}

const DEFAULT_STATUS: PaymentsStatus = {
  status: "disabled",
  provider: null,
  disabled: true,
};

/**
 * usePaymentsStatus — reads the admin-controlled payment gateway flag.
 *
 * When `disabled` is true, payment call-sites must block submit and show
 * "الدفع غير متاح حالياً". Re-fetches periodically so an admin toggle takes
 * effect without a full reload.
 */
export function usePaymentsStatus(intervalMs = 60_000) {
  const [status, setStatus] = useState<PaymentsStatus>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/v1/payments/status", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setStatus(DEFAULT_STATUS);
          return;
        }
        const data = (await res.json()) as PaymentsStatus;
        if (!cancelled) {
          setStatus({
            status: data.status ?? "disabled",
            provider: data.provider ?? null,
            disabled: data.disabled ?? data.status === "disabled",
          });
        }
      } catch {
        if (!cancelled) setStatus(DEFAULT_STATUS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchStatus();
    const id = setInterval(fetchStatus, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { ...status, loading };
}
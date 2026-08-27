/**
 * entitlementService.ts — client helper for the entitlement request flow.
 * Paid CTAs (pricing/wallet/library/media) call requestEntitlement() instead of
 * dead-ending, since no real gateway exists yet. Admin reviews the request in
 * /dashboard/admin/entitlements/requests.
 */

import { listOk, listFailed, type ListRead } from "@/lib/services/listRead";

export type EntitlementKind = "plan" | "credits" | "wallet" | "library" | "media";

export interface EntitlementRequestInput {
  kind: EntitlementKind;
  requested_ref?: string;
  amount?: number;
  note?: string;
}

export interface MyEntitlementRequest {
  id: string;
  kind: string;
  status: "pending" | "approved" | "rejected";
  requested_ref: string | null;
  amount: number | null;
  note: string | null;
  created_at: string;
}

export async function requestEntitlement(
  input: EntitlementRequestInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/v1/entitlement-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: json.error ?? "تعذّر إرسال الطلب" };
    return { ok: true };
  } catch {
    return { ok: false, error: "تعذّر الاتصال بالخادم" };
  }
}

/**
 * The caller's own entitlement requests.
 *
 * This was the worst-shaped reader of the three defects in this file: it did
 * not even look at `res.ok`, so a 401 (session expired) and a 500 both parsed
 * into `{ error: "…" }`, missed `.data`, and returned `[]`. A user who had
 * asked the admin for a plan was shown «لا توجد طلبات» — i.e. told their
 * request was never made — and would send it a second time.
 *
 * `ListRead` because the empty case here is real and common (most users have
 * never asked for anything) and must stay distinguishable from the failure.
 */
export async function getMyEntitlementRequests(): Promise<ListRead<MyEntitlementRequest>> {
  try {
    const res = await fetch("/api/v1/entitlement-requests", { cache: "no-store" });
    // Checked BEFORE the body: the route's error shape is `{ error }`, which
    // has no `data` key, and treating a missing key as an empty list is the
    // defect. `res.ok` says outright that there is nothing to read.
    if (!res.ok) return listFailed<MyEntitlementRequest>();
    const json = (await res.json().catch(() => null)) as
      | { data?: MyEntitlementRequest[] | null }
      | null;
    if (!json || !Array.isArray(json.data)) return listFailed<MyEntitlementRequest>();
    // No `total` on this route — it returns the whole set unpaged, so there is
    // nothing to be truncated against and no count to invent.
    return listOk(json.data);
  } catch {
    return listFailed<MyEntitlementRequest>();
  }
}

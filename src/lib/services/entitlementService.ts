/**
 * entitlementService.ts — client helper for the entitlement request flow.
 * Paid CTAs (pricing/wallet/library/media) call requestEntitlement() instead of
 * dead-ending, since no real gateway exists yet. Admin reviews the request in
 * /dashboard/admin/entitlements/requests.
 */

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

export async function getMyEntitlementRequests(): Promise<MyEntitlementRequest[]> {
  try {
    const res = await fetch("/api/v1/entitlement-requests");
    const json = (await res.json().catch(() => ({}))) as { data?: MyEntitlementRequest[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

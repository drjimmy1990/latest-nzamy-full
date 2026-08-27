/**
 * adminService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode admin verification service.
 * Manages provider verification workflows (KYC) for the admin dashboard.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, type ListRead } from "@/lib/services/listRead";
import type { VerificationStatus } from "@/types/database";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProviderType = "firm" | "lawyer" | "notary" | "arbitrator" | "bailiff";

export type VerificationDisplayStatus = VerificationStatus | "needs_docs" | "approved";

export interface VerificationRequest {
  id: string;
  user_id: string;
  name: string;
  type: ProviderType;
  date: string;
  docs: string[];
  aiScore: number;
  status: VerificationDisplayStatus;
  license_number?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface VerificationListResponse {
  verifications: VerificationRequest[];
  total: number;
}

interface VerificationActionResponse {
  success: boolean;
  message: string;
  verification: VerificationRequest;
}

export interface VerificationFilters {
  status?: string;
  search?: string;
  type?: ProviderType;
}

// ─── Mock data (matches existing page.tsx) ────────────────────────────────────

const MOCK_REQUESTS: VerificationRequest[] = [
  {
    id: "PV-042", user_id: "mock-042", name: "شركة السند للمحاماة والاستشارات", type: "firm", date: "منذ ساعة",
    docs: ["سجل تجاري", "ترخيص شركة مهنية", "بيانات الشركاء", "تفويض الشريك المدير"], aiScore: 89, status: "pending",
  },
  {
    id: "PV-041", user_id: "mock-041", name: "أ. سلطان المطيري", type: "lawyer", date: "منذ ساعتين",
    docs: ["رخصة محاماة", "بطاقة هوية", "شهادة جامعية"], aiScore: 92, status: "pending",
  },
  {
    id: "PV-040", user_id: "mock-040", name: "عبدالرحمن الغامدي — موثّق", type: "notary", date: "منذ ٥ ساعات",
    docs: ["تصريح وزاري", "بطاقة هوية"], aiScore: 78, status: "pending",
  },
  {
    id: "PV-039", user_id: "mock-039", name: "أ. فاطمة الحربي", type: "lawyer", date: "منذ يوم",
    docs: ["رخصة محاماة", "بطاقة هوية", "شهادة جامعية", "خبرة عملية"], aiScore: 97, status: "verified",
  },
  {
    id: "PV-038", user_id: "mock-038", name: "محمد البلوي — محكّم", type: "arbitrator", date: "منذ ٣ أيام",
    docs: ["شهادة تحكيم", "بطاقة هوية"], aiScore: 45, status: "rejected",
  },
  {
    id: "PV-037", user_id: "mock-037", name: "خالد الشهري — معقّب", type: "bailiff", date: "منذ ٤ أيام",
    docs: ["تصريح معقّب", "بطاقة هوية"], aiScore: 88, status: "verified",
  },
  {
    id: "PV-036", user_id: "mock-036", name: "أ. نوف العنزي", type: "lawyer", date: "منذ أسبوع",
    docs: ["رخصة محاماة", "بطاقة هوية"], aiScore: 61, status: "needs_docs",
  },
];

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Fetches all verification requests, optionally filtered.
 *
 * The failure case here is not cosmetic: an empty queue means "nobody is
 * waiting to be verified", so the old `catch { return [] }` told the admin
 * there was no pending KYC work while the query was in fact broken — and a
 * lawyer waiting on approval keeps waiting. Returns `ListRead` so the console
 * can distinguish an empty queue from an unread one.
 */
export async function getVerificationRequests(
  filters?: VerificationFilters,
): Promise<ListRead<VerificationRequest>> {
  if (!isSupabaseMode) {
    let requests = [...MOCK_REQUESTS];

    if (filters?.status && filters.status !== "all") {
      requests = requests.filter((r) => r.status === filters.status);
    }
    if (filters?.search) {
      const q = filters.search;
      requests = requests.filter(
        (r) => r.name.includes(q) || r.id.includes(q),
      );
    }
    if (filters?.type) {
      requests = requests.filter((r) => r.type === filters.type);
    }

    return listOk(requests, requests.length);
  }

  try {
    const response = await apiGet<VerificationListResponse>(
      "/api/v1/admin/verifications",
      {
        status: filters?.status,
        search: filters?.search,
        type: filters?.type,
      },
    );
    // This route's envelope is `{ verifications, total }`, not `{ data }`, so
    // `listFromApi` does not fit it — and it 500s on a Supabase error instead
    // of serving an empty 200, so it emits no `degraded` flag either.
    if (!Array.isArray(response?.verifications)) {
      return listFailed<VerificationRequest>();
    }
    return listOk(response.verifications, response.total);
  } catch (error) {
    console.error("[Nzamy] Admin verifications API failed:", error);
    return listFailed<VerificationRequest>();
  }
}

/**
 * Approves a verification request by user_id.
 */
export async function approveVerification(
  userId: string,
): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseMode) {
    const req = MOCK_REQUESTS.find((r) => r.user_id === userId || r.id === userId);
    if (req) req.status = "verified";
    return { success: true, message: `تم اعتماد ${req?.name ?? userId} بنجاح` };
  }

  try {
    const response = await apiMutate<VerificationActionResponse>(
      `/api/v1/admin/verifications/${userId}`,
      "PATCH",
      { action: "approve" },
    );
    return { success: response.success, message: response.message };
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "فشل في اعتماد الطلب",
    );
  }
}

/**
 * Rejects a verification request by user_id with a reason.
 */
export async function rejectVerification(
  userId: string,
  reason?: string,
): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseMode) {
    const req = MOCK_REQUESTS.find((r) => r.user_id === userId || r.id === userId);
    if (req) req.status = "rejected";
    return { success: true, message: `تم رفض ${req?.name ?? userId}` };
  }

  try {
    const response = await apiMutate<VerificationActionResponse>(
      `/api/v1/admin/verifications/${userId}`,
      "PATCH",
      { action: "reject", reason },
    );
    return { success: response.success, message: response.message };
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "فشل في رفض الطلب",
    );
  }
}

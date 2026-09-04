/**
 * lawyerServicesService.ts — the lawyer's priced service list (Phase 7, item 178).
 * ─────────────────────────────────────────────────────────
 *   lawyer side:  GET/POST /api/v1/lawyer/services · PATCH/DELETE /api/v1/lawyer/services/[id]
 *   public side:  the services ride on GET /api/v1/lawyers/[idOrSlug] (see lawyerPublicProfileService)
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, listFromApi, type ListRead } from "@/lib/services/listRead";
import type { PricingKind, ServiceCategory } from "@/lib/services/lawyerProfileFields";

export type { PricingKind, ServiceCategory };

/** Mirrors public.lawyer_services. */
export interface LawyerService {
  id: string;
  lawyerUserId: string;
  titleAr: string;
  descriptionAr: string;
  pricingKind: PricingKind;
  priceSar: number | null;
  durationLabel: string | null;
  category: ServiceCategory;
  active: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface LawyerServiceInput {
  titleAr: string;
  descriptionAr?: string;
  pricingKind: PricingKind;
  /** required unless pricingKind is "quote" */
  priceSar?: number | null;
  durationLabel?: string | null;
  category: ServiceCategory;
  active?: boolean;
  position?: number;
}

const BASE = "/api/v1/lawyer/services";
const DEMO = "قائمة الخدمات غير متاحة في وضع العرض التجريبي";

export async function getMyServices(): Promise<ListRead<LawyerService>> {
  if (!isSupabaseMode) return listOk([]);
  try {
    return listFromApi(await apiGet<{ data: LawyerService[]; total?: number }>(BASE));
  } catch (error) {
    console.error("[lawyerServicesService] getMyServices failed:", error);
    return listFailed<LawyerService>();
  }
}

export async function createService(input: LawyerServiceInput): Promise<LawyerService> {
  if (!isSupabaseMode) throw new Error(DEMO);
  const res = await apiMutate<{ data: LawyerService }>(BASE, "POST", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم الخدمة المحفوظة.");
  return res.data;
}

export async function updateService(id: string, patch: Partial<LawyerServiceInput>): Promise<LawyerService> {
  if (!isSupabaseMode) throw new Error(DEMO);
  const res = await apiMutate<{ data: LawyerService }>(`${BASE}/${encodeURIComponent(id)}`, "PATCH", patch);
  if (!res?.data) throw new Error("لم يُعِد الخادم الخدمة بعد التعديل.");
  return res.data;
}

export async function deleteService(id: string): Promise<void> {
  if (!isSupabaseMode) throw new Error(DEMO);
  await apiMutate<{ ok: true }>(`${BASE}/${encodeURIComponent(id)}`, "DELETE", {});
}

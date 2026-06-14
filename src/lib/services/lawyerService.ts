/**
 * lawyerService.ts
 * ─────────────────────────────────────────────────────────
 * Lawyer browsing service — fetches verified lawyers from the API.
 */

"use client";

import { apiGet } from "@/lib/services/api";
import type { Lawyer } from "@/app/dashboard/client/find-lawyer/data";

// Re-export the Lawyer type for consumers
export type { Lawyer as LawyerProfile };

// ─── API types ────────────────────────────────────────────────────────────────

interface LawyerListResponse {
  lawyers: Lawyer[];
  total: number;
}

interface LawyerDetailResponse {
  data: Lawyer;
}

// ─── Filter types ─────────────────────────────────────────────────────────────

export interface LawyerFilters {
  specialty?: string;
  city?: string;
  sort?: "rating" | "price" | "experience";
  available?: boolean;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function getLawyers(
  filters?: LawyerFilters,
): Promise<Lawyer[]> {
  try {
    const response = await apiGet<LawyerListResponse>("/api/v1/lawyers", {
      specialty: filters?.specialty,
      city: filters?.city,
      sort: filters?.sort,
      available: filters?.available,
    });
    return response.lawyers ?? [];
  } catch (error) {
    console.warn("[Nzamy] Failed to fetch lawyers:", error);
    return [];
  }
}

export async function getLawyerById(id: string): Promise<Lawyer | null> {
  try {
    const response = await apiGet<LawyerDetailResponse>(`/api/v1/lawyers/${id}`);
    return response.data ?? null;
  } catch (error) {
    console.warn(`[Nzamy] Failed to fetch lawyer ${id}:`, error);
    return null;
  }
}

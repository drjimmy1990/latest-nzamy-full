/**
 * lawyerService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode lawyer browsing service.
 */

"use client";

import { apiGet, isSupabaseMode } from "@/lib/services/api";
import { MOCK_LAWYERS } from "@/app/dashboard/client/find-lawyer/data";
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
  if (!isSupabaseMode) {
    let lawyers = [...MOCK_LAWYERS];

    if (filters?.specialty) {
      lawyers = lawyers.filter(
        (l) => l.specialtyKey === filters.specialty || l.specialty === filters.specialty,
      );
    }
    if (filters?.city) {
      lawyers = lawyers.filter((l) => l.city === filters.city);
    }
    if (filters?.available) {
      lawyers = lawyers.filter((l) => l.available);
    }
    if (filters?.sort) {
      switch (filters.sort) {
        case "price":
          lawyers.sort((a, b) => a.priceMin - b.priceMin);
          break;
        case "experience":
          lawyers.sort((a, b) => b.experienceYears - a.experienceYears);
          break;
        case "rating":
        default:
          lawyers.sort((a, b) => b.rating - a.rating);
          break;
      }
    }

    return lawyers;
  }

  try {
    const response = await apiGet<LawyerListResponse>("/api/v1/lawyers", {
      specialty: filters?.specialty,
      city: filters?.city,
      sort: filters?.sort,
      available: filters?.available,
    });
    return response.lawyers;
  } catch {
    return [...MOCK_LAWYERS];
  }
}

export async function getLawyerById(id: string): Promise<Lawyer | null> {
  if (!isSupabaseMode) {
    return MOCK_LAWYERS.find((l) => l.id === id) ?? null;
  }

  try {
    const response = await apiGet<LawyerDetailResponse>(`/api/v1/lawyers/${id}`);
    return response.data;
  } catch {
    return MOCK_LAWYERS.find((l) => l.id === id) ?? null;
  }
}

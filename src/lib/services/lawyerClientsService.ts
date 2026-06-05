/**
 * lawyerClientsService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode lawyer clients service.
 */

"use client";

import { apiGet, isSupabaseMode } from "@/lib/services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LawyerClient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  userType: string;
  requestCount: number;
  activeCount: number;
  lastActivity: string;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function getLawyerClients(): Promise<LawyerClient[]> {
  if (!isSupabaseMode) {
    return [];
  }

  try {
    return await apiGet<LawyerClient[]>("/api/v1/lawyer/clients");
  } catch {
    return [];
  }
}

/**
 * preferencesService.ts — small per-user state that used to live in
 * localStorage and now rides in public.user_settings.preferences (jsonb):
 * reading activity counters, recently opened laws. (Phase 6.)
 * ─────────────────────────────────────────────────────────
 *   GET   /api/v1/settings              — the existing envelope, now carrying `preferences`
 *   PATCH /api/v1/settings/preferences  — shallow-merges the given keys
 *
 * Only keys named here are merged; the route refuses anything else so the
 * column cannot become a dumping ground. The theme and the sidebar are NOT
 * here — they stay in the browser by the plan's rule.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";

export interface ReadingActivity {
  lawsThisWeek: number;
  lawsThisMonth: number;
  articles: number;
  principles: number;
  feqhPages: number;
  lastWeekReset: string | null;
  lastMonthReset: string | null;
}

export interface RecentSession {
  slug: string;
  title: string;
  titleEn?: string;
  catId?: string;
  type?: string;
  openedAt?: string;
}

export interface UserPreferences {
  readingActivity?: ReadingActivity;
  /** newest first, capped at 10 by the route */
  recentSessions?: RecentSession[];
  /** «light» / «full» dashboard density — mirrors *_profiles.display_mode; kept here for roles without one */
  dashboardMode?: "light" | "full";
}

export const PREFERENCE_KEYS = ["readingActivity", "recentSessions", "dashboardMode"] as const;

export async function getPreferences(): Promise<UserPreferences | null> {
  if (!isSupabaseMode) return null;
  try {
    const res = await apiGet<{ settings?: { preferences?: UserPreferences | null } }>("/api/v1/settings");
    return res?.settings?.preferences ?? {};
  } catch (error) {
    console.error("[preferencesService] getPreferences failed:", error);
    return null;
  }
}

/** Shallow merge of the given keys; returns the merged preferences. */
export async function patchPreferences(patch: Partial<UserPreferences>): Promise<UserPreferences> {
  if (!isSupabaseMode) throw new Error("التفضيلات السحابية غير متاحة في وضع العرض التجريبي");
  const res = await apiMutate<{ preferences: UserPreferences }>("/api/v1/settings/preferences", "PATCH", patch);
  if (!res?.preferences) throw new Error("لم يُعِد الخادم التفضيلات.");
  return res.preferences;
}

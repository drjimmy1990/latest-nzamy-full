/**
 * lawyerActivityService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode lawyer activity feed service.
 *
 * Mirrors GET /api/v1/lawyer/activity exactly. That route no longer returns a
 * bare array of raw `request_events` rows — it returns `{ items, stats,
 * nextCursor }`, where every item is already rendered in Arabic by
 * `describeRequestEvent()` (src/lib/events.ts). The old shape here
 * (`{type, action, payload, entityId}`) described columns the route stopped
 * handing out, so anything typed against it would have compiled fine and then
 * read `undefined` at runtime.
 */

"use client";

import { apiGet, isSupabaseMode } from "@/lib/services/api";
import type { ActivityBadge } from "@/lib/events";

// ─── Types ────────────────────────────────────────────────────────────────────

/** One feed row. `title`/`description` are Arabic — never a raw event token. */
export interface LawyerActivity {
  id: string;
  badge: ActivityBadge;
  title: string;
  description?: string;
  requestId: string | null;
  /** null when the request has no page that can be opened. */
  requestHref: string | null;
  requestTitle: string | null;
  serviceTitleAr: string | null;
  createdAt: string;
}

/** Exact head-counts for the stat cards. `null` when the counts failed. */
export interface LawyerActivityStats {
  ordersThisMonth: number;
  ordersActive: number;
  ordersCompleted: number;
  ordersTotal: number;
}

export interface LawyerActivityFeed {
  items: LawyerActivity[];
  stats: LawyerActivityStats | null;
  /** `createdAt` of the last row held; pass it back as `before`. null = end. */
  nextCursor: string | null;
}

/** A fresh object each time — a shared one would let one caller's `items.push`
 *  leak into the next caller's "empty" feed. */
const emptyFeed = (): LawyerActivityFeed => ({ items: [], stats: null, nextCursor: null });

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * `before` is the previous page's `nextCursor` (an ISO timestamp). Omit it for
 * the first page.
 */
export async function getLawyerActivity(before?: string): Promise<LawyerActivityFeed> {
  if (!isSupabaseMode) {
    return emptyFeed();
  }

  try {
    const data = await apiGet<LawyerActivityFeed>("/api/v1/lawyer/activity", { before });
    return {
      items: data?.items ?? [],
      stats: data?.stats ?? null,
      nextCursor: data?.nextCursor ?? null,
    };
  } catch {
    return emptyFeed();
  }
}

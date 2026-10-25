/**
 * trackingLinksService.ts — typed client for /api/v1/cases/[id]/tracking-links
 * (N3.6, the client's case tracking link; v2 = D2, owner ٢٧٦: lifetimes,
 * pause / resume on the same link, revoke).
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import type { TrackingLifetime, TrackingLinkState, TrackingPauseReason } from "@/lib/tracking/trackingLinkState";

export interface TrackingLink {
  id: string;
  createdAt: string;
  revokedAt: string | null;
  lastViewedAt: string | null;
  mine: boolean;
  lifetime: TrackingLifetime | null;
  expiresAt: string | null;
  pausedAt: string | null;
  /** manual | expired | locked (20 wrong digit tries — probably leaked); null when live. */
  pausedReason: TrackingPauseReason | null;
  state: TrackingLinkState;
  lockedUntil: string | null;
  /** The caller may re-activate it; null when the server did not say (then: maker or issuer). */
  mayResume: boolean | null;
}

export interface TrackingLinksList {
  links: TrackingLink[];
  /** The caller may create, pause, resume and revoke links on this case. */
  canIssue: boolean;
  /** false before migration 20261026_62: no lifetimes, no pause. */
  v2: boolean;
  /** The case file has a client mobile to open a link with; null when unknown. */
  hasPhone: boolean | null;
}

const base = (caseId: string) => `/api/v1/cases/${encodeURIComponent(caseId)}/tracking-links`;

export async function getTrackingLinks(caseId: string): Promise<TrackingLinksList> {
  if (!isSupabaseMode) return { links: [], canIssue: false, v2: false, hasPhone: null };
  const body = await apiGet<{ data: TrackingLink[]; canIssue?: boolean; v2?: boolean; hasPhone?: boolean | null }>(base(caseId));
  if (!Array.isArray(body?.data)) throw new Error("تعذّر تحميل روابط المتابعة.");
  return {
    links: body.data,
    canIssue: body.canIssue === true,
    v2: body.v2 === true,
    hasPhone: typeof body.hasPhone === "boolean" ? body.hasPhone : null,
  };
}

/** Creates a link and returns its full URL — shown once; only its hash is stored. */
export async function createTrackingLink(caseId: string, lifetime: TrackingLifetime): Promise<{ link: TrackingLink; url: string }> {
  if (!isSupabaseMode) throw new Error("روابط المتابعة غير متاحة في وضع العرض التجريبي");
  const res = await apiMutate<{ data: TrackingLink; path: string }>(base(caseId), "POST", { lifetime });
  if (!res?.data || typeof res.path !== "string" || !res.path.startsWith("/track/")) {
    throw new Error("لم يُعِد الخادم الرابط.");
  }
  return { link: res.data, url: `${window.location.origin}${res.path}` };
}

async function patchLink(caseId: string, linkId: string, body: Record<string, unknown>): Promise<TrackingLink> {
  if (!isSupabaseMode) throw new Error("روابط المتابعة غير متاحة في وضع العرض التجريبي");
  const res = await apiMutate<{ data: TrackingLink }>(`${base(caseId)}/${encodeURIComponent(linkId)}`, "PATCH", body);
  if (!res?.data) throw new Error("لم يُعِد الخادم الرابط.");
  return res.data;
}

/** Permanent cancel — never comes back. */
export function revokeTrackingLink(caseId: string, linkId: string): Promise<TrackingLink> {
  return patchLink(caseId, linkId, { action: "revoke" });
}

/** Pause: the client sees «الرابط موقوف مؤقتاً»; the URL stays. */
export function pauseTrackingLink(caseId: string, linkId: string): Promise<TrackingLink> {
  return patchLink(caseId, linkId, { action: "pause" });
}

/** Re-activate the SAME link with a new lifetime. */
export function resumeTrackingLink(caseId: string, linkId: string, lifetime: TrackingLifetime): Promise<TrackingLink> {
  return patchLink(caseId, linkId, { action: "resume", lifetime });
}

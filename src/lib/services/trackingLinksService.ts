/**
 * trackingLinksService.ts — typed client for /api/v1/cases/[id]/tracking-links
 * (N3.6, the client's case tracking link).
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";

export interface TrackingLink {
  id: string;
  createdAt: string;
  revokedAt: string | null;
  lastViewedAt: string | null;
  mine: boolean;
}

const base = (caseId: string) => `/api/v1/cases/${encodeURIComponent(caseId)}/tracking-links`;

/** The case's links, and whether the caller may create (and revoke) them. */
export async function getTrackingLinks(caseId: string): Promise<{ links: TrackingLink[]; canIssue: boolean }> {
  if (!isSupabaseMode) return { links: [], canIssue: false };
  const body = await apiGet<{ data: TrackingLink[]; canIssue?: boolean }>(base(caseId));
  if (!Array.isArray(body?.data)) throw new Error("تعذّر تحميل روابط المتابعة.");
  return { links: body.data, canIssue: body.canIssue === true };
}

/** Creates a link and returns its full URL — shown once; only its hash is stored. */
export async function createTrackingLink(caseId: string): Promise<{ link: TrackingLink; url: string }> {
  if (!isSupabaseMode) throw new Error("روابط المتابعة غير متاحة في وضع العرض التجريبي");
  const res = await apiMutate<{ data: TrackingLink; path: string }>(base(caseId), "POST");
  if (!res?.data || typeof res.path !== "string" || !res.path.startsWith("/track/")) {
    throw new Error("لم يُعِد الخادم الرابط.");
  }
  return { link: res.data, url: `${window.location.origin}${res.path}` };
}

export async function revokeTrackingLink(caseId: string, linkId: string): Promise<TrackingLink> {
  if (!isSupabaseMode) throw new Error("روابط المتابعة غير متاحة في وضع العرض التجريبي");
  const res = await apiMutate<{ data: TrackingLink }>(`${base(caseId)}/${encodeURIComponent(linkId)}`, "PATCH", { revoke: true });
  if (!res?.data) throw new Error("لم يُعِد الخادم الرابط الموقوف.");
  return res.data;
}

/**
 * ledgerService.ts — typed client for the legal outgoing / incoming register
 * (/api/v1/lawyer/ledger), the office activity tab
 * (/api/v1/lawyer/activity/office) and the case timeline
 * (/api/v1/cases/[id]/timeline). N3.7.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import type { LedgerChannel, LedgerDirection, LedgerEntryDto } from "@/lib/ledger/ledgerInput";
import type { TimelineItem } from "@/lib/caseTimeline/buildCaseTimeline";
import type { ActivityBadge } from "@/lib/events";

export type LedgerEntry = LedgerEntryDto;

/** Fired after a ledger write so the activity tab and the case timeline re-read. */
export const LEDGER_EVENT = "nzamy-ledger-updated";

function announce() {
  try { window.dispatchEvent(new CustomEvent(LEDGER_EVENT)); } catch {}
}

export interface LedgerQuery {
  direction?: LedgerDirection | null;
  channel?: LedgerChannel | null;
  caseId?: string | null;
  archived?: boolean;
  before?: string | null;
}

export interface LedgerPage {
  items: LedgerEntry[];
  nextCursor: string | null;
}

export async function getLedger(q: LedgerQuery = {}): Promise<LedgerPage> {
  if (!isSupabaseMode) return { items: [], nextCursor: null };
  const body = await apiGet<{ data: LedgerEntry[]; nextCursor: string | null }>("/api/v1/lawyer/ledger", {
    direction: q.direction ?? undefined,
    channel: q.channel ?? undefined,
    caseId: q.caseId ?? undefined,
    archived: q.archived ? "1" : undefined,
    before: q.before ?? undefined,
  });
  if (!Array.isArray(body?.data)) throw new Error("تعذّر تحميل سجل الصادر والوارد.");
  return { items: body.data, nextCursor: body.nextCursor ?? null };
}

export interface LedgerInput {
  caseRequestId: string;
  direction: LedgerDirection;
  channel: LedgerChannel;
  title: string;
  notes?: string;
  occurredAt?: string;
}

export async function createLedgerEntry(input: LedgerInput): Promise<LedgerEntry> {
  if (!isSupabaseMode) throw new Error("سجل الصادر والوارد غير متاح في وضع العرض التجريبي");
  const res = await apiMutate<{ data: LedgerEntry }>("/api/v1/lawyer/ledger", "POST", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم القيد المحفوظ.");
  announce();
  return res.data;
}

export async function updateLedgerEntry(
  id: string,
  patch: Partial<Omit<LedgerInput, "caseRequestId">> & { archived?: boolean },
): Promise<LedgerEntry> {
  if (!isSupabaseMode) throw new Error("سجل الصادر والوارد غير متاح في وضع العرض التجريبي");
  const res = await apiMutate<{ data: LedgerEntry }>(`/api/v1/lawyer/ledger/${encodeURIComponent(id)}`, "PATCH", patch);
  if (!res?.data) throw new Error("لم يُعِد الخادم القيد المعدّل.");
  announce();
  return res.data;
}

export interface OfficeActivityItem {
  id: string;
  title: string;
  badge: ActivityBadge;
  actorUserId: string | null;
  actorName: string | null;
  caseRequestId: string | null;
  createdAt: string;
}

export interface OfficeActivityPage {
  member: boolean;
  members: { id: string; name: string }[];
  items: OfficeActivityItem[];
  nextCursor: string | null;
}

export async function getOfficeActivity(q: { actor?: string | null; before?: string | null } = {}): Promise<OfficeActivityPage> {
  if (!isSupabaseMode) return { member: false, members: [], items: [], nextCursor: null };
  const body = await apiGet<{ member: boolean; members: { id: string; name: string }[]; data: OfficeActivityItem[]; nextCursor: string | null }>(
    "/api/v1/lawyer/activity/office",
    { actor: q.actor ?? undefined, before: q.before ?? undefined },
  );
  if (!Array.isArray(body?.data)) throw new Error("تعذّر تحميل نشاط المكتب.");
  return { member: body.member === true, members: body.members ?? [], items: body.data, nextCursor: body.nextCursor ?? null };
}

export async function getCaseTimeline(caseId: string): Promise<{ items: TimelineItem[]; partial: boolean }> {
  if (!isSupabaseMode) return { items: [], partial: false };
  const body = await apiGet<{ data: TimelineItem[]; partial?: boolean }>(`/api/v1/cases/${encodeURIComponent(caseId)}/timeline`);
  if (!Array.isArray(body?.data)) throw new Error("تعذّر تحميل السجل الزمني.");
  return { items: body.data, partial: body.partial === true };
}

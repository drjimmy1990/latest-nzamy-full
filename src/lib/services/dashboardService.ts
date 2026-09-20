/**
 * dashboardService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode dashboard summary service.
 */

"use client";

// Relative + explicit `.ts`, not the "@/" alias — the house convention for a
// module whose decision function must be reachable from `node --test`, which
// cannot resolve the alias outside the Next.js bundler (the reason is written
// out in profileEntityFields.ts's header). `./api.ts` itself imports only
// ../runtimeMode.ts, so nothing framework-bound is pulled in behind it.
// serviceOrders.ts:20 already imports `./api.ts` this way.
import { apiGet, isSupabaseMode } from "./api.ts";
import { listFailed, listOk, type ListRead } from "./listRead.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SubscriptionSummary {
  plan: string;
  name: string;
  limits: {
    aiQueries: number;
    contractDrafts: number;
    consultations: number;
  };
  used: {
    aiQueries: number;
    contractDrafts: number;
    consultations: number;
  };
}

export interface DashboardSummary {
  activeCases: unknown[];
  /**
   * How many active orders this account has IN TOTAL, as opposed to how many
   * are in `activeCases` — that array is a capped page, so counting it and
   * printing the answer as «لديك N قضايا نشطة» understates a busy account.
   *
   * Optional because DEMO_SUMMARY below and any cached older response will not
   * carry it; a consumer must treat its absence as "unknown", never as zero.
   * GET /api/v1/dashboard/summary has returned it since 2026-08-27.
   */
  activeCasesTotal?: number;
  nextAppointment: unknown | null;
  recentMessages: unknown[];
  subscription: SubscriptionSummary | null;
  communityPreview: unknown[];
  walletBalance: number;
  unreadNotifications: number;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEMO_SUMMARY: DashboardSummary = {
  activeCases: [],
  nextAppointment: null,
  recentMessages: [],
  subscription: {
    plan: "free",
    name: "مجانية",
    limits: { aiQueries: 1, contractDrafts: 0, consultations: 0 },
    used: { aiQueries: 0, contractDrafts: 0, consultations: 0 },
  },
  communityPreview: [],
  walletBalance: 0,
  unreadNotifications: 0,
};

// ─── The read ─────────────────────────────────────────────────────────────────
//
// WHAT USED TO BE HERE AND WHY IT COULD NOT STAY. getDashboardSummary() ended
// in `catch { return { ...DEMO_SUMMARY } }`, so a failed request arrived at
// /dashboard/client as a fully-formed object — `activeCases: []`,
// `nextAppointment: null`, `subscription: { plan: "free", name: "مجانية" }` —
// and the page drew it as fact: «قضاياي» vanished for a client who has cases,
// and no signal reached the page to tell "you have nothing" from "we could not
// read it". That is the exact defect src/lib/services/listRead.ts was written
// to end, so the summary is now carried in the same three-state read the
// documents card on that same page already uses.
//
// ListRead<T> IS A LIST TYPE AND A SUMMARY IS ONE OBJECT — reused on purpose.
// The page gets listViewState()/itemsOf() unchanged and one spelling of
// «تعذّرت القراءة» instead of a second, private one; the read carries either
// exactly one summary or no items at all, never a fixture.

/**
 * The decision, with no I/O in it: what a response body means.
 *
 * A body that is not a plain object is not an empty dashboard — it is an
 * error payload, a string, or `null`, and rendering any of those as a summary
 * is how the fixture got drawn in the first place.
 */
export function summaryReadFrom(body: unknown): ListRead<DashboardSummary> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return listFailed<DashboardSummary>();
  }
  return listOk([body as DashboardSummary]);
}

export async function getDashboardSummary(): Promise<ListRead<DashboardSummary>> {
  // Demo mode is not a failure: the fixture IS the answer when there is no
  // backend to ask. It is only a lie when it stands in for one that failed.
  if (!isSupabaseMode) {
    return listOk([{ ...DEMO_SUMMARY }]);
  }

  try {
    return summaryReadFrom(await apiGet<DashboardSummary>("/api/v1/dashboard/summary"));
  } catch {
    return listFailed<DashboardSummary>();
  }
}

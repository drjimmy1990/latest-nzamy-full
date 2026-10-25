/**
 * _shared.ts — the lawyer-side DTO of a client tracking link (N3.6; v2 = D2,
 * owner ٢٧٦, 20261026_62). The token hash is never selected (the table does
 * not even grant it to sessions); the plaintext token exists only in the POST
 * response that created it.
 *
 * Deploy order: the v2 columns may not exist yet. Reads try the v2 select and
 * fall back to the v1 one on a missing-column answer (isMissingFeatureColumn,
 * src/lib/library/optionalColumn.ts); a v1 row's state is active / revoked.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingFeatureColumn, type PgErrorLike } from "@/lib/library/optionalColumn";
import {
  effectiveTrackingState,
  isMissingRpcError,
  isTrackingLifetime,
  isTrackingLinkState,
  isTrackingPauseReason,
  type TrackingLifetime,
  type TrackingLinkState,
  type TrackingPauseReason,
} from "@/lib/tracking/trackingLinkState";

export const TRACKING_LINK_SELECT = "id, owner_user_id, created_at, revoked_at, last_viewed_at";
export const TRACKING_LINK_SELECT_V2 = `${TRACKING_LINK_SELECT}, lifetime, expires_at, paused_at, paused_reason, locked_until`;
const V2_COLUMNS = ["lifetime", "expires_at", "paused_at", "paused_reason", "locked_until"] as const;

/** A 42703 / PGRST204 / PGRST100 that names a v2 column: the database predates 20261026_62. */
export function isMissingV2Column(error: PgErrorLike | null | undefined): boolean {
  return V2_COLUMNS.some((c) => isMissingFeatureColumn(error, c));
}

/** Links per case that are not revoked (paused ones count: they come back with one click). */
export const MAX_ACTIVE_TRACKING_LINKS = 5;

export interface TrackingLinkRow {
  id: string;
  owner_user_id: string;
  created_at: string;
  revoked_at: string | null;
  last_viewed_at: string | null;
  lifetime?: string | null;
  expires_at?: string | null;
  paused_at?: string | null;
  paused_reason?: string | null;
  locked_until?: string | null;
}

export interface TrackingLinkDto {
  id: string;
  createdAt: string;
  revokedAt: string | null;
  lastViewedAt: string | null;
  mine: boolean;
  /** null on a v1 database. */
  lifetime: TrackingLifetime | null;
  expiresAt: string | null;
  pausedAt: string | null;
  /** manual | expired | locked (20 wrong digit tries — probably leaked); null when live. */
  pausedReason: TrackingPauseReason | null;
  state: TrackingLinkState;
  /** The client's digits check is locked (5 wrong tries) until this instant. */
  lockedUntil: string | null;
  /** The caller may re-activate it (a colleague's manual pause: maker, pauser or lead only); null when unknown. */
  mayResume: boolean | null;
}

/** One row of public.case_tracking_link_states. */
export interface TrackingLinkSqlState {
  state: string;
  mayResume: boolean | null;
}

/** `sql` is public.case_tracking_link_states' answer (it knows stage ends and who may resume); else the TS mirror. */
export function toTrackingLinkDto(row: TrackingLinkRow, uid: string, sql?: TrackingLinkSqlState | null): TrackingLinkDto {
  const now = Date.now();
  const sqlState = sql?.state;
  const state = isTrackingLinkState(sqlState)
    ? sqlState
    : effectiveTrackingState(
        {
          revokedAt: row.revoked_at,
          pausedAt: row.paused_at ?? null,
          pausedReason: row.paused_reason ?? null,
          expiresAt: row.expires_at ?? null,
          stageEnded: false,
        },
        now,
      );
  const locked = row.locked_until && Date.parse(row.locked_until) > now ? row.locked_until : null;
  return {
    id: row.id,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    lastViewedAt: row.last_viewed_at,
    mine: row.owner_user_id === uid,
    lifetime: isTrackingLifetime(row.lifetime) ? row.lifetime : null,
    expiresAt: row.expires_at ?? null,
    pausedAt: row.paused_at ?? null,
    pausedReason: isTrackingPauseReason(row.paused_reason) ? row.paused_reason : null,
    state,
    lockedUntil: locked,
    mayResume: typeof sql?.mayResume === "boolean" ? sql.mayResume : null,
  };
}

export type TrackingLinksRead =
  | { ok: true; v2: boolean; rows: TrackingLinkRow[]; states: Map<string, TrackingLinkSqlState> }
  | { ok: false };

/**
 * A case's links (or one link, `linkId`) through the caller's session (RLS),
 * newest first, with the states SQL computed (public.case_tracking_link_states,
 * which knows when a «stage» link's stage has ended and whether the caller
 * may re-activate each link). v1 database → the v1
 * columns and no states (the DTO then derives active / revoked).
 */
export async function readTrackingLinks(supabase: SupabaseClient, caseId: string, linkId?: string): Promise<TrackingLinksRead> {
  const run = (select: string) => {
    let q = supabase.from("case_tracking_links").select(select).eq("case_request_id", caseId);
    if (linkId) q = q.eq("id", linkId);
    return q.order("created_at", { ascending: false }).limit(50);
  };
  let v2 = true;
  let res = await run(TRACKING_LINK_SELECT_V2);
  if (res.error && isMissingV2Column(res.error)) {
    v2 = false;
    res = await run(TRACKING_LINK_SELECT);
  }
  if (res.error) {
    console.error("[tracking-links] read failed:", res.error.message, res.error.code);
    return { ok: false };
  }
  const states = new Map<string, TrackingLinkSqlState>();
  if (v2) {
    const st = await supabase.rpc("case_tracking_link_states", { p_request: caseId });
    if (st.error) {
      if (!isMissingRpcError(st.error, "case_tracking_link_states")) {
        console.error("[tracking-links] states failed:", st.error.message, st.error.code);
      }
    } else {
      for (const r of (st.data ?? []) as Array<{ link_id: string; state: string; may_resume?: boolean | null }>) {
        states.set(r.link_id, { state: r.state, mayResume: typeof r.may_resume === "boolean" ? r.may_resume : null });
      }
    }
  }
  return { ok: true, v2, rows: (res.data ?? []) as unknown as TrackingLinkRow[], states };
}

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export const NO_PHONE_AR = "أضف رقم جوال الموكل في ملف القضية أولاً — يفتح الموكل الرابط بآخر ٤ أرقام منه. الرقم يُؤخذ من بطاقة الموكل المرتبطة بالقضية، أو من حساب الموكل إن كان هو مقدّم الطلب.";
export const NO_STAGE_AR = "لا توجد مرحلة جارية مسجّلة لهذه القضية — أضف المرحلة في تبويب المراحل، أو اختر مدة بالأيام.";

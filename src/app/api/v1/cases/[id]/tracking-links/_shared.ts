/**
 * _shared.ts — the lawyer-side DTO of a client tracking link (N3.6). The
 * token hash is never selected (the table does not even grant it to
 * sessions); the plaintext token exists only in the POST response that
 * created it.
 */

export const TRACKING_LINK_SELECT = "id, owner_user_id, created_at, revoked_at, last_viewed_at";

/** Live links per case. Enough for a client and a relative; more is a sign to revoke old ones. */
export const MAX_ACTIVE_TRACKING_LINKS = 5;

export interface TrackingLinkRow {
  id: string;
  owner_user_id: string;
  created_at: string;
  revoked_at: string | null;
  last_viewed_at: string | null;
}

export interface TrackingLinkDto {
  id: string;
  createdAt: string;
  revokedAt: string | null;
  lastViewedAt: string | null;
  mine: boolean;
}

export function toTrackingLinkDto(row: TrackingLinkRow, uid: string): TrackingLinkDto {
  return {
    id: row.id,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    lastViewedAt: row.last_viewed_at,
    mine: row.owner_user_id === uid,
  };
}

export const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * founderMembershipView.ts — GET /api/v1/membership/founder's answer, from
 * the caller's own rows (P3 Task 6):
 *
 *   { member, endsAt, credits: { drafting_work: { total, remaining },
 *     independent_output: { total, remaining } }, libraryUntil }
 *
 * A member holds an ACTIVE founder seat whose end is still ahead. Anything
 * else (no seat, reserved, released, revoked, past its end) is NOT_A_FOUNDER:
 * zeros and nulls, so the UI never shows a credit the server would refuse
 * (ai_start_run_with_credit spends only on an active seat, before ends_at).
 *
 * Credits are the rows of THAT seat; a row past its end counts its total
 * but nothing remaining. libraryUntil is the end of the library coverage
 * running now (libraryCoverage: stacked grants chained), null when none.
 *
 * Pure: relative imports only, so `node --test` loads it directly.
 */
import { libraryCoverage, type LibraryGrantRow } from "../libraryAccess.ts";
import { FOUNDER_CREDITS, type FounderCreditKind } from "./founderPlan.ts";

export interface FounderSeatRow {
  id: string;
  status: string;
  ends_at: string | null;
}

export interface FounderCreditRow {
  seat_id: string;
  kind: string;
  total: number;
  remaining: number;
  ends_at: string;
}

export interface FounderMembershipView {
  member: boolean;
  endsAt: string | null;
  credits: Record<FounderCreditKind, { total: number; remaining: number }>;
  libraryUntil: string | null;
}

const KINDS = Object.keys(FOUNDER_CREDITS) as FounderCreditKind[];

function zeroCredits(): FounderMembershipView["credits"] {
  return { drafting_work: { total: 0, remaining: 0 }, independent_output: { total: 0, remaining: 0 } };
}

export const NOT_A_FOUNDER: Readonly<FounderMembershipView> = Object.freeze({
  member: false,
  endsAt: null,
  credits: zeroCredits(),
  libraryUntil: null,
});

const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

export function founderMembershipView(args: {
  seat: FounderSeatRow | null;
  credits: readonly FounderCreditRow[];
  grants: readonly LibraryGrantRow[];
  now: Date;
}): FounderMembershipView {
  const { seat, now } = args;
  const t = now.getTime();
  const seatEnd = seat?.ends_at ? Date.parse(seat.ends_at) : NaN;
  if (!seat || seat.status !== "active" || !Number.isFinite(seatEnd) || seatEnd <= t) {
    return { ...NOT_A_FOUNDER, credits: zeroCredits() };
  }

  const credits = zeroCredits();
  for (const row of args.credits) {
    if (!row || row.seat_id !== seat.id || !(KINDS as string[]).includes(row.kind)) continue;
    const c = credits[row.kind as FounderCreditKind];
    c.total += count(row.total);
    const end = Date.parse(row.ends_at);
    if (Number.isFinite(end) && end > t) c.remaining += count(row.remaining);
  }

  const coverage = libraryCoverage(args.grants, now);
  return {
    member: true,
    endsAt: seat.ends_at,
    credits,
    libraryUntil: coverage.status === "active" ? coverage.endsAt : null,
  };
}

/**
 * consultantScopeServer.ts — the one read behind "is this caller an
 * INDEPENDENT legal consultant?", shared by the proxy (pages and
 * /api/v1/lawyer), the AI run path and tool-status, so they cannot disagree.
 *
 * Independent = `lawyer_profiles.practice_kind` is exactly 'consultant' AND he
 * is not an active member of a firm. A consultant who is an active member keeps
 * the firm role's tools (FIRM_ROLE_ALLOWED_HREFS, e.g. legal_consultant): the
 * restriction is for the one who works alone, and the delegation phase builds
 * on that membership, so nothing here stands in its way.
 *
 * Reads through the caller's own RLS client (own rows only), never a service
 * client. Cost: one read for everyone, a second only for a consultant; the
 * proxy keeps the answer briefly (readConsultantStandingCached, below).
 *
 * Failure rules, each deliberate:
 *   - practice_kind unreadable or a missing column → advocate (the existing
 *     rule of assertCourtPractice: a blip never locks a real lawyer out);
 *     `readFailed` lets an API caller choose to answer 503 instead;
 *   - the membership read fails for a confirmed consultant → treated as NOT a
 *     member, i.e. independent: a doubt never opens the lawyer's workspace.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { practiceKindFromRead } from "./courtPracticeDecision.ts";
import { type PracticeKind } from "./practiceKind.ts";

export interface ConsultantStanding {
  practiceKind: PracticeKind;
  /** An active firm_members row exists (only read for a consultant). */
  firmMember: boolean;
  /** The practice_kind read errored for a reason other than a missing column. */
  readFailed: boolean;
  /** The kind the scope rules take: 'consultant' only for an independent one. */
  scopeKind: PracticeKind;
}

export async function readConsultantStanding(client: SupabaseClient, userId: string): Promise<ConsultantStanding> {
  let read: ReturnType<typeof practiceKindFromRead>;
  try {
    read = practiceKindFromRead(await client.from("lawyer_profiles").select("practice_kind").eq("user_id", userId).maybeSingle());
  } catch {
    return { practiceKind: "advocate", firmMember: false, readFailed: true, scopeKind: "advocate" };
  }
  const readFailed = read.readFailed && !read.missingColumn;
  if (read.practiceKind !== "consultant") {
    return { practiceKind: "advocate", firmMember: false, readFailed, scopeKind: "advocate" };
  }
  let firmMember = false;
  try {
    const { data, error } = await client
      .from("firm_members")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    firmMember = !error && !!data;
  } catch {
    firmMember = false;
  }
  return { practiceKind: "consultant", firmMember, readFailed, scopeKind: firmMember ? "advocate" : "consultant" };
}

/**
 * The proxy asks this on every page under /dashboard/lawyer and /ai and every
 * /api/v1/lawyer call, for every lawyer, not only consultants. One RLS read
 * per request (two for a consultant) is the cost the review of 23 Nov flagged,
 * so the proxy keeps each answer for a short while, per process:
 *   - keyed by the user id getUser() has just verified, never by anything the
 *     browser sends, so nothing a client holds can change the answer;
 *   - an answer lives CONSULTANT_STANDING_TTL_MS: a change of practice_kind or
 *     of firm membership reaches the guard within that time in each process;
 *   - a read that failed is never kept, so the next request reads again;
 *   - the map holds at most CONSULTANT_STANDING_CACHE_MAX users and drops the
 *     oldest first (a Map keeps insertion order).
 * Pure apart from the read itself; the clock is passed in so a test drives it.
 */
export const CONSULTANT_STANDING_TTL_MS = 60_000;
export const CONSULTANT_STANDING_CACHE_MAX = 5_000;

export class ConsultantStandingCache {
  private readonly entries = new Map<string, { standing: ConsultantStanding; expiresAt: number }>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(ttlMs: number = CONSULTANT_STANDING_TTL_MS, maxEntries: number = CONSULTANT_STANDING_CACHE_MAX) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  get(userId: string, now: number): ConsultantStanding | null {
    const hit = this.entries.get(userId);
    if (!hit) return null;
    if (hit.expiresAt <= now) {
      this.entries.delete(userId);
      return null;
    }
    return hit.standing;
  }

  set(userId: string, standing: ConsultantStanding, now: number): void {
    if (standing.readFailed) return;
    this.entries.delete(userId);
    this.entries.set(userId, { standing, expiresAt: now + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

const processCache = new ConsultantStandingCache();

/** readConsultantStanding behind the per-process cache (see above). */
export async function readConsultantStandingCached(
  client: SupabaseClient,
  userId: string,
  cache: ConsultantStandingCache = processCache,
  now: number = Date.now(),
): Promise<ConsultantStanding> {
  const hit = cache.get(userId, now);
  if (hit) return hit;
  const standing = await readConsultantStanding(client, userId);
  cache.set(userId, standing, now);
  return standing;
}

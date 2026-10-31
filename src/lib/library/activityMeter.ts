/**
 * activityMeter.ts — the pure half of «نشاط المكتبة» (20261031_10): an
 * in-process tally of a signed-in reader's library requests, searches and
 * library-AI calls per clock hour, drained in batches into
 * public.library_activity_bump by activityMeterServer.ts.
 *
 * Why a tally and not one database call per request: the proxy already
 * remembers allowed answers for 60 s (readQuotaServer.ts), so most requests
 * never reach Postgres; this tally is the only place every request is seen.
 * It is approximate by design — each server process keeps its own, and a
 * batch lost in a restart or a failed flush is not re-sent. Documents opened
 * are counted exactly elsewhere (inside library_read_quota_hit).
 *
 * No I/O; `node --test` loads it directly.
 */
import type { QuotaTarget } from "./readQuota.ts";

export type LibraryActivityKind = "doc" | "search" | "ai";

/** What a quota target is, for the tally: a document read, a search, or a library-AI call. */
export function libraryActivityKind(target: QuotaTarget, pathname: string): LibraryActivityKind {
  if (target.kind === "doc") return "doc";
  return pathname.startsWith("/api/library/") ? "search" : "ai";
}

/** One row of the batch, in the shape library_activity_bump reads. */
export interface ActivityBumpRow {
  u: string;
  h: string;
  r: number;
  s: number;
  a: number;
}

const HOUR_MS = 60 * 60 * 1000;

export function hourStartIso(now: number): string {
  return new Date(Math.floor(now / HOUR_MS) * HOUR_MS).toISOString();
}

export class ActivityMeter {
  private rows = new Map<string, ActivityBumpRow>();
  private readonly maxRows: number;

  constructor(maxRows = 5_000) {
    this.maxRows = maxRows;
  }

  /**
   * Counts one request. Every kind is a request; a search and a library-AI
   * call are also counted under their own column. Returns false (and counts
   * nothing) when the tally is full of OTHER readers — a flush is overdue.
   */
  record(userId: string, kind: LibraryActivityKind, now: number): boolean {
    const h = hourStartIso(now);
    const key = `${userId}\u0000${h}`;
    let row = this.rows.get(key);
    if (!row) {
      if (this.rows.size >= this.maxRows) return false;
      row = { u: userId, h, r: 0, s: 0, a: 0 };
      this.rows.set(key, row);
    }
    row.r += 1;
    if (kind === "search") row.s += 1;
    else if (kind === "ai") row.a += 1;
    return true;
  }

  /** Everything tallied so far, and an empty tally. */
  drain(): ActivityBumpRow[] {
    const out = [...this.rows.values()];
    this.rows = new Map();
    return out;
  }

  get size(): number {
    return this.rows.size;
  }
}

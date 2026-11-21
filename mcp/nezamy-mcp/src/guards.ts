/**
 * Library protection and access gates for the MCP layer (defence in depth: the
 * platform stays the authority; these rules apply even if a route is lenient).
 *
 * ASSUMPTION AWAITING OWNER CONFIRMATION (plan 2026-11-21, "حماية المكتبة"):
 *  - Claude gets a short excerpt + article number + status;
 *  - the FULL text only for an article that was actually cited (returned by
 *    check_citations or by a run's citations) in this server's memory;
 *  - a daily cap on full reads per token (default 30), a read log (metadata
 *    only, never text), and an instant kill switch.
 * `who` is NezamyClient.tokenId (a short hash of the token, never the token).
 * Everything here fails closed: restart the server, or lose memory, and the
 * result is excerpts only, never more text.
 */
import { appendFileSync, existsSync } from "node:fs";

export const EXCERPT_MAX = 240;
export const FULL_TEXT_MAX = 6000;
const CITED_MAX_PER_TOKEN = 500;

export interface ReadLogEntry {
  at: string;
  token: string; // short hash, never the token
  tool: string;
  item: string;
  outcome: "full" | "excerpt" | "denied";
  reason?: string;
}

export interface GuardOptions {
  /** Full-text reads per token per UTC day. 0 = no full text at all. Default 30. */
  dailyFullReads?: number;
  /** Where read-log lines go. Default: JSONL file at NEZAMY_MCP_READ_LOG when set, else memory only. */
  logSink?: (e: ReadLogEntry) => void;
  /** Instant kill: env NEZAMY_MCP_KILL=1 or a file at NEZAMY_MCP_KILL_FILE. Injectable for tests. */
  isKilled?: () => boolean;
  /** New v2 tools are staff-only at first (NEZAMY_MCP_STAFF_ONLY=0 opens them). */
  staffOnly?: boolean;
  /** Cap on distinct tokens seen per UTC day by this process (0 = unlimited). Hosted multi-user servers leave it 0. */
  maxDistinctTokens?: number;
  now?: () => Date;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

export class Guard {
  readonly dailyFullReads: number;
  readonly staffOnly: boolean;
  readonly log: ReadLogEntry[] = [];
  private readonly sink: (e: ReadLogEntry) => void;
  private readonly killed: () => boolean;
  private readonly maxTokens: number;
  private readonly now: () => Date;
  private readonly cited = new Map<string, Set<string>>();
  private readonly reads = new Map<string, { day: string; n: number }>();
  private readonly tokensToday = new Map<string, string>(); // key -> day
  private readonly staffCache = new Map<string, { until: number; ok: boolean }>();

  constructor(o: GuardOptions = {}) {
    const env = process.env;
    const envCap = env.NEZAMY_MCP_DAILY_FULL_READS !== undefined ? Number(env.NEZAMY_MCP_DAILY_FULL_READS) : NaN;
    this.dailyFullReads = o.dailyFullReads ?? (Number.isInteger(envCap) && envCap >= 0 ? envCap : 30);
    this.staffOnly = o.staffOnly ?? env.NEZAMY_MCP_STAFF_ONLY !== "0";
    this.maxTokens = o.maxDistinctTokens ?? (Number(env.NEZAMY_MCP_MAX_TOKENS) || 0);
    this.now = o.now ?? (() => new Date());
    this.killed =
      o.isKilled ??
      (() => env.NEZAMY_MCP_KILL === "1" || (!!env.NEZAMY_MCP_KILL_FILE && existsSync(env.NEZAMY_MCP_KILL_FILE)));
    const file = env.NEZAMY_MCP_READ_LOG;
    this.sink =
      o.logSink ??
      ((e) => {
        if (!file) return;
        try { appendFileSync(file, `${JSON.stringify(e)}\n`); } catch { /* logging must never break a tool */ }
      });
  }

  isKilled(): boolean { return this.killed(); }

  /** Returns an Arabic refusal, or null if this token may proceed. */
  admit(who: string): string | null {
    const k = who;
    const today = day(this.now());
    if (this.maxTokens > 0 && this.tokensToday.get(k) !== today) {
      for (const [key, d] of this.tokensToday) if (d !== today) this.tokensToday.delete(key);
      if (this.tokensToday.size >= this.maxTokens) return "تجاوز الخادم حد التوكنات المسموح بها اليوم. تواصل مع إدارة نظامي.";
      this.tokensToday.set(k, today);
    }
    return null;
  }

  /** Remember that these library ids were cited (so their full text may be read). */
  markCited(who: string, ids: Iterable<string | undefined>): void {
    const k = who;
    let set = this.cited.get(k);
    if (!set) this.cited.set(k, (set = new Set()));
    for (const id of ids) {
      if (!id) continue;
      if (set.size >= CITED_MAX_PER_TOKEN) set.delete(set.values().next().value as string);
      set.add(id);
    }
  }

  isCited(who: string, id: string): boolean { return this.cited.get(who)?.has(id) ?? false; }

  /** Decide full vs excerpt for one article read. Does not count until `recordFull`. */
  decideRead(who: string, id: string): { mode: "full" } | { mode: "excerpt"; reason: "not_cited" | "daily_cap" } {
    if (!this.isCited(who, id)) return { mode: "excerpt", reason: "not_cited" };
    const k = who;
    const today = day(this.now());
    const r = this.reads.get(k);
    const used = r && r.day === today ? r.n : 0;
    if (used >= this.dailyFullReads) return { mode: "excerpt", reason: "daily_cap" };
    return { mode: "full" };
  }

  recordFull(who: string): number {
    const k = who;
    const today = day(this.now());
    const r = this.reads.get(k);
    const n = (r && r.day === today ? r.n : 0) + 1;
    this.reads.set(k, { day: today, n });
    return Math.max(0, this.dailyFullReads - n);
  }

  record(who: string, tool: string, item: string, outcome: ReadLogEntry["outcome"], reason?: string): void {
    const e: ReadLogEntry = { at: this.now().toISOString(), token: who, tool, item: item.slice(0, 120), outcome, ...(reason ? { reason } : {}) };
    this.log.push(e);
    if (this.log.length > 2000) this.log.splice(0, this.log.length - 1000);
    this.sink(e);
  }

  staffVerdict(who: string): boolean | undefined {
    const c = this.staffCache.get(who);
    return c && c.until > Date.now() ? c.ok : undefined;
  }
  rememberStaff(who: string, ok: boolean): void { this.staffCache.set(who, { until: Date.now() + 60_000, ok }); }
}

export const clampExcerpt = (s: string) => (s.length > EXCERPT_MAX ? `${s.slice(0, EXCERPT_MAX)}…` : s);
export const clampFull = (s: string) => (s.length > FULL_TEXT_MAX ? { text: `${s.slice(0, FULL_TEXT_MAX)}…`, cut: true } : { text: s, cut: false });

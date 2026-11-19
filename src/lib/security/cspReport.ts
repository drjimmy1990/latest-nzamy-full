/**
 * cspReport.ts — reading the browser's Content-Security-Policy violation
 * reports (owner file 15 row 43, file 20 §3; batch l9).
 *
 * The policy stays REPORT-ONLY (owner register 24 / 71): it is enforced only
 * after the payment test passes AND a week of clean reports. Until now the
 * policy had no report-uri, so that week could never start. The browser now
 * POSTs each violation to /api/v1/security/csp-report, which writes ONE log
 * line per distinct violation (`[csp-report] {…}`) to the server log — read
 * with `docker logs <app> | grep csp-report`.
 *
 * Two formats arrive: the old `report-uri` one (application/csp-report,
 * `{"csp-report": {...}}`) and the Reporting API one
 * (application/reports+json, `[{type: "csp-violation", body: {...}}]`).
 *
 * Nothing personal is logged: URLs keep their origin and path only — no
 * query, no fragment — and any path segment that looks like a token or an id
 * (/track/<token>, payment ids, uuids) becomes ":id". No IP, no cookie, no
 * user agent. Pure, so `node --test` runs it.
 */

export const CSP_REPORT_PATH = "/api/v1/security/csp-report";
/** The Reporting-Endpoints group name the `report-to` directive points at. */
export const CSP_REPORT_GROUP = "csp-endpoint";
/** A body larger than this is dropped unread. */
export const CSP_REPORT_MAX_BYTES = 16 * 1024;

export interface CspViolation {
  document: string;
  blocked: string;
  directive: string;
  disposition: string;
  source: string;
}

const MAX_FIELD = 300;

/** A path segment that carries a token or an id rather than a page name. */
function isIdLike(segment: string): boolean {
  if (segment.length >= 16 && /\d/.test(segment) && /^[A-Za-z0-9_.~%-]+$/.test(segment)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return true;
  return /^\d{5,}$/.test(segment);
}

const TOKEN_PARENTS = new Set(["track", "share", "invite", "review", "reset-password", "verify", "group"]);

/**
 * Origin + path, no query or fragment, ids and tokens masked. Non-URL values
 * the browser sends for blocked-uri ("inline", "eval", "data", "blob",
 * "wasm-eval", "trusted-types-sink") pass through as they are.
 */
export function sanitizeReportUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const v = value.trim();
  if (!v) return "";
  if (/^[a-z-]+$/i.test(v)) return v.slice(0, 40);
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return "";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return url.protocol.replace(/:$/, "");
  const parts = url.pathname.split("/");
  const out = parts.map((seg, i) => (i > 0 && (isIdLike(seg) || TOKEN_PARENTS.has(parts[i - 1] ?? "")) && seg ? ":id" : seg));
  return `${url.origin}${out.join("/")}`.slice(0, MAX_FIELD);
}

function text(value: unknown, max = 80): string {
  return typeof value === "string" ? value.replace(/[^\x20-\x7e]/g, "").trim().slice(0, max) : "";
}

function fromLegacy(r: Record<string, unknown>): CspViolation | null {
  const directive = text(r["effective-directive"]) || text(r["violated-directive"]);
  if (!directive) return null;
  return {
    document: sanitizeReportUrl(r["document-uri"]),
    blocked: sanitizeReportUrl(r["blocked-uri"]),
    directive,
    disposition: text(r["disposition"], 20) || "report",
    source: sanitizeReportUrl(r["source-file"]),
  };
}

function fromReportingApi(b: Record<string, unknown>): CspViolation | null {
  const directive = text(b.effectiveDirective);
  if (!directive) return null;
  return {
    document: sanitizeReportUrl(b.documentURL),
    blocked: sanitizeReportUrl(b.blockedURL),
    directive,
    disposition: text(b.disposition, 20) || "report",
    source: sanitizeReportUrl(b.sourceFile),
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Every violation in one request body (either format), at most 20; anything else → []. */
export function parseCspReports(raw: string): CspViolation[] {
  if (!raw || raw.length > CSP_REPORT_MAX_BYTES) return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return [];
  }
  const out: CspViolation[] = [];
  if (isObject(json) && isObject(json["csp-report"])) {
    const v = fromLegacy(json["csp-report"]);
    if (v) out.push(v);
  } else if (Array.isArray(json)) {
    for (const item of json.slice(0, 20)) {
      if (isObject(item) && item.type === "csp-violation" && isObject(item.body)) {
        const v = fromReportingApi(item.body);
        if (v) out.push(v);
      }
    }
  }
  return out;
}

/** The key one violation is logged under once per window. */
export function violationKey(v: CspViolation): string {
  return `${v.directive}|${v.blocked}|${v.document}`;
}

/**
 * Per-process memory of what was logged: the same violation is written once
 * per `windowMs` (a busy page would otherwise write one line per visit), and
 * the memory holds at most `max` keys.
 */
export class ViolationDeduper {
  private seen = new Map<string, number>();
  private readonly windowMs: number;
  private readonly max: number;
  constructor(windowMs = 10 * 60 * 1000, max = 500) {
    this.windowMs = windowMs;
    this.max = max;
  }

  shouldLog(key: string, now = Date.now()): boolean {
    const last = this.seen.get(key);
    if (last !== undefined && now - last < this.windowMs) return false;
    if (this.seen.size >= this.max) {
      for (const [k, t] of this.seen) if (now - t >= this.windowMs) this.seen.delete(k);
      if (this.seen.size >= this.max) return false;
    }
    this.seen.set(key, now);
    return true;
  }
}

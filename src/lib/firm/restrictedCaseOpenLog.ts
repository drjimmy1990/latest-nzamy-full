/**
 * restrictedCaseOpenLog.ts — N16 (batch l12, migration 20261202_80; owner RAW
 * [43], his assistant's default): «يبقى الشريك المدير يرى القضية المقيّدة،
 * ويُسجَّل في سجل تدقيق كل مرة يفتحها فيها مع التاريخ ليراه صاحب القضية».
 *
 *   - Every open of a RESTRICTED firm case by someone who sees it only by
 *     office (the firm owner, an active managing partner, a platform admin) is
 *     recorded by public.log_restricted_case_open — called by GET
 *     /api/v1/service-requests/[id], the read behind the case file. Once per
 *     viewer per 10 minutes; the case's filer, lead and team are not logged.
 *   - The case's filer or lead reads the log (public.restricted_case_open_log_read,
 *     GET /api/v1/cases/[id]/open-log); anyone else gets 42501.
 *   - Fail-open by choice: a log write that fails is written to the server log
 *     and the case still opens — the partner's access is the owner's decision,
 *     the log is its record.
 *
 * Pure: no imports, so `node --test` loads it.
 */

export type OpenLogRpcOutcome = "ok" | "unavailable" | "forbidden" | "failed";

export function openLogRpcOutcome(error: { code?: string | null } | null | undefined): OpenLogRpcOutcome {
  if (!error) return "ok";
  const code = error.code ?? "";
  if (code === "42883" || code === "PGRST202" || code === "42P01" || code === "PGRST205") return "unavailable";
  if (code === "42501") return "forbidden";
  return "failed";
}

/** Whether the case-file read should record an open: a restricted firm case. */
export function shouldLogRestrictedOpen(row: { firm_id?: unknown; is_restricted?: unknown } | null | undefined): boolean {
  return !!row && typeof row.firm_id === "string" && row.firm_id !== "" && row.is_restricted === true;
}

export const OPEN_LOG_KIND_AR: Readonly<Record<string, string>> = Object.freeze({
  firm_owner: "صاحب المكتب",
  managing_partner: "الشريك المدير",
  platform_admin: "فريق المنصة",
});

export interface OpenLogEntry {
  openedAt: string;
  who: string;
  kind: string;
}

/** RPC rows → what the case owner sees. A platform admin is shown as «فريق المنصة», never by name. */
export function toOpenLogEntries(rows: unknown): OpenLogEntry[] {
  if (!Array.isArray(rows)) return [];
  const out: OpenLogEntry[] = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    if (typeof row.opened_at !== "string" || typeof row.viewer_kind !== "string") continue;
    const label = OPEN_LOG_KIND_AR[row.viewer_kind];
    if (!label) continue;
    const name = row.viewer_kind !== "platform_admin" && typeof row.viewer_name === "string" ? row.viewer_name.trim() : "";
    out.push({ openedAt: row.opened_at, kind: row.viewer_kind, who: name ? `${name} (${label})` : label });
  }
  return out;
}

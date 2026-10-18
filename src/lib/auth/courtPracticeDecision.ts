/**
 * The pure half of assertCourtPractice (Art. 18 of نظام المحاماة: a legal
 * consultant does not plead or manage hearings, so the court APIs refuse
 * him). No `@/` imports, so `node --test` loads it through a relative `.ts`
 * import.
 *
 * Fail open, always: anything that is not a clean read of exactly
 * 'consultant' is an advocate — today's behaviour. That covers a database
 * where 20261019_20 has not run yet (42703 / PGRST204), a lawyer with no
 * lawyer_profiles row (a firm account has none), and any other read error. A
 * missing column must never lock real lawyers out of their hearings.
 */
import { toPracticeKind, type PracticeKind } from "./practiceKind.ts";

/** PostgREST / Postgres codes for "this column is not there yet". */
export const MISSING_COLUMN_CODES: ReadonlySet<string> = new Set(["42703", "PGRST204"]);

export interface PracticeKindRead {
  practiceKind: PracticeKind;
  /** The column is missing (deploy-order: the migration has not run). */
  missingColumn: boolean;
  /** The read errored (missing column included); the answer is the fallback. */
  readFailed: boolean;
}

/**
 * Turns `{ data, error }` from
 * `.from("lawyer_profiles").select("practice_kind").eq("user_id", id).maybeSingle()`
 * into a practice kind. An error wins over any data that came with it.
 */
export function practiceKindFromRead(result: unknown): PracticeKindRead {
  const r = (result && typeof result === "object" ? result : {}) as {
    data?: unknown;
    error?: { code?: unknown } | null;
  };
  if (r.error) {
    const code = typeof r.error.code === "string" ? r.error.code : "";
    return { practiceKind: "advocate", missingColumn: MISSING_COLUMN_CODES.has(code), readFailed: true };
  }
  const row = r.data && typeof r.data === "object" ? (r.data as { practice_kind?: unknown }) : null;
  return { practiceKind: toPracticeKind(row?.practice_kind), missingColumn: false, readFailed: false };
}

/** A consultant is refused unless he is a platform admin; everyone else is allowed. */
export function courtPracticeDecision(input: { practiceKind: unknown; isAdmin?: boolean }): "allow" | "refuse" {
  if (toPracticeKind(input.practiceKind) !== "consultant") return "allow";
  return input.isAdmin === true ? "allow" : "refuse";
}

/**
 * P1-32 — the named boards of a case map (public.canvas_boards, 20261126_70).
 * Pure checks shared by the two routes; no imports (node --test loads it).
 *
 * The case's DEFAULT board stays public.case_graphs (GET/PUT
 * /api/v1/lawyer/case-graph/[caseId]); these are the extra, named ones.
 */

export const BOARD_NAME_MAX = 80;
export const BOARDS_PER_CASE = 20;

export const BOARD_SELECT = "id, case_request_id, name, updated_at, created_at, owner_user_id";
export const BOARD_FULL_SELECT = "id, name, nodes, edges, viewport, updated_at";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isBoardId(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** A board name: trimmed, 1–80 characters, inner whitespace collapsed. */
export function checkBoardName(v: unknown): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof v !== "string") return { ok: false, error: "اكتب اسم اللوحة" };
  const name = v.replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, error: "اكتب اسم اللوحة" };
  if (name.length > BOARD_NAME_MAX) return { ok: false, error: `اسم اللوحة حتى ${BOARD_NAME_MAX} حرفاً` };
  return { ok: true, name };
}

export interface BoardRow {
  id: string;
  case_request_id: string;
  name: string;
  updated_at: string;
  created_at: string;
  owner_user_id: string;
}

export function toBoardDto(row: BoardRow, viewerId: string) {
  return { id: row.id, name: row.name, updatedAt: row.updated_at, createdAt: row.created_at, isOwn: row.owner_user_id === viewerId };
}

/** The database's answers turned into the route's: a duplicate name, the cap, or a refusal. */
export function boardWriteError(err: { code?: string; message?: string } | null | undefined): { status: number; error: string; code: string } {
  if (err?.code === "23505") return { status: 409, error: "توجد لوحة بهذا الاسم في هذه القضية", code: "board_name_taken" };
  if (err?.code === "P0001" && (err.message ?? "").includes("at most 20 boards")) {
    return { status: 409, error: `بلغت القضية ${BOARDS_PER_CASE} لوحة — احذف لوحة لإضافة أخرى`, code: "board_limit" };
  }
  if (err?.code === "42501") return { status: 403, error: "لا تملك صلاحية تعديل لوحات هذه القضية", code: "forbidden" };
  return { status: 500, error: "", code: "db_error" };
}

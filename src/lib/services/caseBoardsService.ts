/**
 * caseBoardsService.ts — T18-P1-32 (batch l11): the named boards of a case
 * map, on the existing table and routes (public.canvas_boards, 20261126_70;
 * /api/v1/lawyer/case-graph/[caseId]/boards[/boardId]). The case's default
 * board stays case_graphs and is not listed here.
 *
 * Each call answers { ok, … } or { ok: false, error } with the server's own
 * Arabic message (duplicate name, the 20-board cap, «يحذف اللوحة منشئها
 * فقط»), never a throw, so the switcher can show it in place.
 */

export interface CaseBoard {
  id: string;
  name: string;
  updatedAt: string;
  createdAt: string;
  /** Created by this viewer: only he may delete it (RLS). */
  isOwn: boolean;
}

export type BoardResult<T> = { ok: true; value: T } | { ok: false; error: string };

const FAILED = "تعذّر الاتصال بالخادم — حاول مرة أخرى";

function boardsUrl(caseId: string, boardId?: string): string {
  const base = `/api/v1/lawyer/case-graph/${encodeURIComponent(caseId)}/boards`;
  return boardId ? `${base}/${encodeURIComponent(boardId)}` : base;
}

/** A board row from the API, or null when the shape is wrong. */
export function asCaseBoard(raw: unknown): CaseBoard | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.name !== "string") return null;
  return {
    id: r.id,
    name: r.name,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : "",
    createdAt: typeof r.createdAt === "string" ? r.createdAt : "",
    isOwn: r.isOwn === true,
  };
}

async function call<T>(url: string, init: RequestInit, read: (body: Record<string, unknown>) => T | null, fetchImpl: typeof fetch): Promise<BoardResult<T>> {
  try {
    const res = await fetchImpl(url, { ...init, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json; charset=utf-8" } });
    const body = ((await res.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: typeof body.error === "string" && body.error ? body.error : FAILED };
    const value = read(body);
    return value === null ? { ok: false, error: FAILED } : { ok: true, value };
  } catch {
    return { ok: false, error: FAILED };
  }
}

export function listCaseBoards(caseId: string, fetchImpl: typeof fetch = fetch): Promise<BoardResult<CaseBoard[]>> {
  return call(boardsUrl(caseId), { method: "GET" }, (b) =>
    Array.isArray(b.data) ? b.data.map(asCaseBoard).filter((x): x is CaseBoard => x !== null) : null, fetchImpl);
}

export function createCaseBoard(caseId: string, name: string, fetchImpl: typeof fetch = fetch): Promise<BoardResult<CaseBoard>> {
  return call(boardsUrl(caseId), { method: "POST", body: JSON.stringify({ name }) }, (b) => asCaseBoard(b.data), fetchImpl);
}

export function renameCaseBoard(caseId: string, boardId: string, name: string, fetchImpl: typeof fetch = fetch): Promise<BoardResult<{ id: string; name: string }>> {
  return call(boardsUrl(caseId, boardId), { method: "PATCH", body: JSON.stringify({ name }) }, (b) => {
    const d = (b.data ?? {}) as Record<string, unknown>;
    return typeof d.id === "string" && typeof d.name === "string" ? { id: d.id, name: d.name } : null;
  }, fetchImpl);
}

export function deleteCaseBoard(caseId: string, boardId: string, fetchImpl: typeof fetch = fetch): Promise<BoardResult<true>> {
  return call(boardsUrl(caseId, boardId), { method: "DELETE" }, (b) => (b.success === true ? true : null), fetchImpl);
}

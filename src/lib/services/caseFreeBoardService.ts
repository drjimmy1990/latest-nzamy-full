/**
 * caseFreeBoardService.ts — the client of /api/v1/lawyer/case-board/[caseId]
 * (the free board «لوحة» of a case, owner ١٨٩ (ب), batch l13).
 *
 * Same contract as the case map's caseGraphService: the board's version is the
 * row's `updated_at`, kept as the exact string the server sent; a save carries
 * it and the server writes only if the board is still at that version. Errors
 * are thrown as GraphSaveError so the shared autosave controller
 * (caseGraphAutosave.ts) retries a blip and stops on a conflict or a refusal.
 */

import { isDemoMode } from "../runtimeMode.ts";
import { GraphSaveError, canonicalJson, kindForStatus } from "./caseGraphAutosave.ts";
import { checkFreeBoard, type FreeBoardPayload } from "./caseFreeBoard.ts";

export interface FreeBoardData extends FreeBoardPayload {
  updatedAt: string;
}

export class FreeBoardReadError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "FreeBoardReadError";
    this.status = status;
  }
}

export function freeBoardUrl(caseId: string): string {
  return `/api/v1/lawyer/case-board/${encodeURIComponent(caseId)}`;
}

/** case id → the version this page last read or wrote (`null` = read, no board yet). */
const versions = new Map<string, string | null>();

type FetchLike = typeof fetch;

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

function asBoard(v: unknown): FreeBoardData | null {
  const d = v as { cards?: unknown; links?: unknown; updatedAt?: unknown } | null;
  if (!d || typeof d !== "object" || typeof d.updatedAt !== "string") return null;
  return {
    cards: Array.isArray(d.cards) ? (d.cards as FreeBoardData["cards"]) : [],
    links: Array.isArray(d.links) ? (d.links as FreeBoardData["links"]) : [],
    updatedAt: d.updatedAt,
  };
}

/**
 * The saved board, or `null` when the case has none yet. Throws
 * FreeBoardReadError on any failure — the caller must not start editing (and
 * so must never autosave an empty board over a real one) after a failed read.
 */
export async function getFreeBoard(caseId: string, fetchImpl: FetchLike = fetch): Promise<FreeBoardData | null> {
  let res: Response;
  try {
    res = await fetchImpl(freeBoardUrl(caseId), { credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new FreeBoardReadError("تعذّر الاتصال بالخادم.", 0);
  }
  const json = await readJson(res);
  if (!res.ok) {
    throw new FreeBoardReadError(typeof json?.error === "string" ? json.error : "تعذّرت قراءة اللوحة.", res.status);
  }
  const board = json?.data == null ? null : asBoard(json.data);
  if (json?.data != null && !board) throw new FreeBoardReadError("وصلت اللوحة بصيغة غير متوقعة.", 500);
  versions.set(caseId, board ? board.updatedAt : null);
  return board;
}

/**
 * Full replace of the saved board, if it is still the version this page last
 * saw. Throws GraphSaveError (retryable / conflict / fatal).
 */
export async function saveFreeBoard(caseId: string, board: FreeBoardPayload, fetchImpl: FetchLike = fetch): Promise<void> {
  // owner decision ١١٥: demo mode never writes.
  if (isDemoMode) {
    throw new GraphSaveError("وضع العرض التجريبي محلي بالكامل: لا يُرسَل أي حفظ أو تعديل إلى الخادم.", "fatal");
  }
  if (!versions.has(caseId)) {
    // never read → never write (the board would overwrite what it never saw)
    throw new GraphSaveError("لم تُقرأ اللوحة المحفوظة بعد.", "fatal");
  }
  // The server's own check, first: a board it would refuse is never sent, and
  // the reason is shown at once (a refusal never turns into endless retries).
  const checked = checkFreeBoard(board);
  if (!checked.ok) throw new GraphSaveError(checked.error, "fatal");
  const url = freeBoardUrl(caseId);
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ cards: board.cards, links: board.links, baseUpdatedAt: versions.get(caseId) ?? null }),
    });
  } catch {
    throw new GraphSaveError("تعذّر الاتصال بالخادم.", "retryable");
  }
  const json = await readJson(res);
  if (res.ok) {
    if (typeof json?.updatedAt === "string") versions.set(caseId, json.updatedAt);
    return;
  }
  if (res.status === 409) {
    // A save whose answer was lost did land; its retry finds its own version.
    // If the server holds exactly this board, take the version — no conflict.
    const current = await getFreeBoard(caseId, fetchImpl).catch(() => null);
    if (current && canonicalJson({ cards: current.cards, links: current.links }) === canonicalJson({ cards: board.cards, links: board.links })) {
      return;
    }
  }
  const fallback = res.status === 413
    ? "امتلأت اللوحة: اختصر نصوص بعض البطاقات أو احذف بعضها ثم تُحفظ."
    : "تعذّر حفظ اللوحة.";
  throw new GraphSaveError(typeof json?.error === "string" ? json.error : fallback, kindForStatus(res.status));
}

/** Test seam: forget what this page read. */
export function _resetFreeBoardVersions(): void {
  versions.clear();
}

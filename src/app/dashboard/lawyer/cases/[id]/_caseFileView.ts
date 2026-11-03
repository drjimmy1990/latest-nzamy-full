/**
 * _caseFileView.ts — the decisions behind the lawyer's case file
 * (/dashboard/lawyer/cases/[id]), pure so `node --test` runs them.
 *
 *   tabFromParam / nextTabIndex   LIVE-F10 + UX11: the tab lives in `?tab=`
 *                                 and the strip is a real ARIA tablist
 *                                 (arrows, Home, End — RTL-aware);
 *   CASE_TAB_GROUPS               UX11: the ten tabs in three labelled groups;
 *   currentStageOf / nextUpcomingHearing
 *                                 UX11: the pinned summary's «المرحلة الحالية»
 *                                 and «الموعد القادم», from real rows;
 *   createLatestWins              CODE-F11: per-row latest-wins for the
 *                                 optimistic task / checklist toggles.
 */

import { hearingDisplayState } from "../../../../../lib/services/hearingVocabulary.ts";

// ── Tabs ─────────────────────────────────────────────────────────────────────

export type CaseTabGroup = "follow" | "litigation" | "file";

export const CASE_TAB_GROUPS: readonly { id: CaseTabGroup; label: string }[] = [
  { id: "follow", label: "المتابعة" },
  { id: "litigation", label: "التقاضي" },
  { id: "file", label: "الملف" },
];

/** `?tab=` validated against the known ids; anything else is the fallback. */
export function tabFromParam(param: string | null | undefined, ids: readonly string[], fallback = "overview"): string {
  return param && ids.includes(param) ? param : fallback;
}

/**
 * The tab a key press moves to, or null when the key is not a tab key.
 * In RTL the strip runs right-to-left, so ArrowLeft is «next» and ArrowRight
 * «previous» (WAI-ARIA tabs pattern, mirrored). Wraps at both ends.
 */
export function nextTabIndex(key: string, current: number, count: number, dir: "rtl" | "ltr" = "rtl"): number | null {
  if (count <= 0) return null;
  const forward = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
  const back = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
  if (key === forward) return (current + 1) % count;
  if (key === back) return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

// ── Pinned summary ───────────────────────────────────────────────────────────

interface StageLike { degree: string; closedOn: string | null; position: number; courtName?: string }

/**
 * «المرحلة الحالية»: the open degree with the highest position; when every
 * degree is closed, the last one (labelled closed by the caller); none → null.
 */
export function currentStageOf<S extends StageLike>(stages: readonly S[]): { stage: S; open: boolean } | null {
  if (stages.length === 0) return null;
  const byPos = [...stages].sort((a, b) => a.position - b.position);
  const open = byPos.filter(s => !s.closedOn);
  if (open.length > 0) return { stage: open[open.length - 1], open: true };
  return { stage: byPos[byPos.length - 1], open: false };
}

interface HearingLike { status: string; date: string; time?: string | null }

/**
 * «الموعد القادم»: the soonest hearing that is still scheduled and not before
 * `today`. A cancelled, held or adjourned row never qualifies, and with no
 * `today` yet (first render) nothing does — «no next hearing» is a claim.
 */
export function nextUpcomingHearing<H extends HearingLike>(rows: readonly H[], today: string): H | null {
  if (!today) return null;
  let best: H | null = null;
  for (const h of rows) {
    if (hearingDisplayState(h.status, h.date, today) !== "upcoming") continue;
    if (!best || h.date < best.date || (h.date === best.date && (h.time ?? "99") < (best.time ?? "99"))) best = h;
  }
  return best;
}

// ── CODE-F11: latest-wins per row ────────────────────────────────────────────

/**
 * Optimistic toggles fire one request per click. Two quick clicks on one row
 * used to race: if the FIRST request failed after the SECOND succeeded, its
 * revert wrote the first click's «before» value over the second's result.
 *
 * `begin(key, current)` numbers the click and remembers the last value the
 * server is known to hold. `settle(...)` says whether to revert, and to what:
 * only the LATEST click on a row may revert it, and it reverts to the newest
 * value a request actually confirmed — never to a stale closure.
 */
export function createLatestWins<V>() {
  const seq = new Map<string, number>();
  const confirmed = new Map<string, { token: number; value: V }>();
  return {
    begin(key: string, current: V): number {
      const token = (seq.get(key) ?? 0) + 1;
      seq.set(key, token);
      if (!confirmed.has(key)) confirmed.set(key, { token: 0, value: current });
      return token;
    },
    settle(key: string, token: number, ok: boolean, value: V): { revert: false } | { revert: true; to: V } {
      const latest = seq.get(key) === token;
      const known = confirmed.get(key);
      if (ok) {
        if (known && token > known.token) confirmed.set(key, { token, value });
        if (latest) confirmed.delete(key);
        return { revert: false };
      }
      if (!latest) return { revert: false };
      confirmed.delete(key);
      return known ? { revert: true, to: known.value } : { revert: false };
    },
  };
}

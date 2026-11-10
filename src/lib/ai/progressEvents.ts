/**
 * progressEvents.ts — what a run's waiting screen is told, and writing it
 * (20261103_31). R7: a label is a file name, a search phrase, a law article's
 * title or a stage name, never a text, a token or a link. A builder reads only
 * the one field its label needs, and the source builder's parameter has no `text`.
 *
 * Writing never disturbs a run: recordProgress never throws, and before
 * 20261103_31 runs it logs once and does nothing. It logs an error's code alone,
 * because Postgres can put the failing row in the rest of the error.
 *
 * Pure: relative imports only (type-only for Supabase), so `node --test` runs it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PackageSource } from "./retrieval.ts";
import { arabicPoints } from "./toolPointsDisplay.ts";

export type ProgressKind = "file" | "query" | "law" | "principle" | "verify" | "step" | "note";

export interface ProgressEvent {
  kind: ProgressKind;
  label: string;
}

const LABEL_MAX = 200;
const INSERT_MAX = 40;

/** The stage names n8n reports, and the one the app itself reports. */
export const STEP_LABEL_AR = {
  reading: "يقرأ المستندات",
  drafting: "يكتب الناتج",
  reviewing: "يراجع الناتج",
  sent: "أُرسل الطلب إلى المحرّك",
} as const;

export function cleanLabel(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const clean = s.replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  // By character, as the database check counts: a cut never halves one.
  const chars = Array.from(clean);
  return chars.length > LABEL_MAX ? `${chars.slice(0, LABEL_MAX - 1).join("")}…` : clean;
}

function events(kind: ProgressKind, labels: unknown[]): ProgressEvent[] {
  const out: ProgressEvent[] = [];
  for (const raw of labels) {
    const label = cleanLabel(raw);
    if (label) out.push({ kind, label });
  }
  return out;
}

export function fileEvents(files: { name: string }[]): ProgressEvent[] {
  return events("file", files.map((f) => f.name));
}

export function queryEvents(queries: string[]): ProgressEvent[] {
  return events("query", queries);
}

/** The caller maps a source to this first, so its text never reaches a builder. */
export function toSourceRefs(sources: PackageSource[]): Pick<PackageSource, "kind" | "title">[] {
  return sources.map(({ kind, title }) => ({ kind, title }));
}

export function sourceEvents(sources: Pick<PackageSource, "kind" | "title">[]): ProgressEvent[] {
  return sources.flatMap((s) =>
    events(s.kind === "principle" ? "principle" : s.kind === "feqh" ? "note" : "law", [s.title]),
  );
}

export function verifyEvent(output: Record<string, unknown>): ProgressEvent | null {
  const check = output.citation_check;
  if (!Array.isArray(check) || check.length === 0) return null;
  return { kind: "verify", label: `تحقق من ${arabicPoints(check.length)} إحالة نظامية في المكتبة` };
}

let missingTableLogged = false;

export async function recordProgress(
  admin: SupabaseClient,
  runId: string,
  userId: string,
  list: ProgressEvent[],
): Promise<void> {
  if (list.length === 0) return;
  try {
    const rows = list.slice(0, INSERT_MAX).map((e) => ({ run_id: runId, user_id: userId, kind: e.kind, label: e.label }));
    const { error } = await admin.from("progress_events").insert(rows);
    if (!error) return;
    if (error.code === "42P01" || error.code === "PGRST205") {
      if (!missingTableLogged) {
        missingTableLogged = true;
        console.error("[ai] progress_events is missing (20261103_31 not applied); progress is not recorded");
      }
      return;
    }
    console.error("[ai] recording progress failed for", runId, error.code);
  } catch (err) {
    console.error("[ai] recording progress threw for", runId, (err as { name?: string } | null)?.name ?? "error");
  }
}

/**
 * The `progress` a route gives the pipeline. A write starts at once, not when the
 * reply ends, so a fast tool's progress shows while its answer is still awaited,
 * and one follows another, so the ids keep the order they were reported in.
 * `keepAlive` holds the process for a write the reply outlives (`after`).
 */
export function progressSink(
  admin: SupabaseClient,
  keepAlive: (work: Promise<void>) => void,
): (runId: string, userId: string, list: ProgressEvent[]) => void {
  let tail: Promise<void> = Promise.resolve();
  return (runId, userId, list) => {
    if (list.length === 0) return;
    tail = tail.then(() => recordProgress(admin, runId, userId, list));
    try {
      keepAlive(tail);
    } catch (err) {
      console.error("[ai] keeping a progress write alive failed for", runId, (err as { name?: string } | null)?.name ?? "error");
    }
  };
}

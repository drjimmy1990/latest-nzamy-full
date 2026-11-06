/**
 * aiThinkingStage.logic.ts — what <AiThinkingStage/> shows. Only what the run
 * reported (progress_events, R7: titles and stage names, never texts) and a real
 * clock: no invented steps, no timings, no percentages.
 *
 * Pure: relative imports only, so `node --test` runs it.
 */
import { STEP_LABEL_AR } from "../../lib/ai/progressEvents.ts";

export const STAGE_START_LABEL_AR = "بدأ التشغيل";
export const STAGE_NO_EVENTS_AR = "لم تصل تفاصيل بعد، والطلب قيد التشغيل.";
export const STAGE_STALE_AR = "تعذّر تحديث التفاصيل الآن، ونعيد المحاولة.";

interface Reported {
  kind: string;
  label: string;
}

export interface ProgressGroups {
  files: string[];
  queries: string[];
  sources: string[];
  verify: string[];
  notes: string[];
}

const GROUP_OF: Readonly<Record<string, keyof ProgressGroups>> = {
  file: "files",
  query: "queries",
  law: "sources",
  principle: "sources",
  verify: "verify",
  note: "notes",
  step: "notes",
};

export function groupProgress(events: Reported[]): ProgressGroups {
  const groups: ProgressGroups = { files: [], queries: [], sources: [], verify: [], notes: [] };
  for (const e of events) {
    if (!Object.prototype.hasOwnProperty.call(GROUP_OF, e.kind)) continue;
    const list = groups[GROUP_OF[e.kind]];
    if (!list.includes(e.label)) list.push(e.label);
  }
  return groups;
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const arabic = (n: number) => String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]);

/** Real time since the press, as m:ss in Arabic digits. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${arabic(Math.floor(total / 60))}:${arabic(total % 60).padStart(2, "٠")}`;
}

export function currentStepLabel(step: string | null, events: Reported[]): string {
  if (step !== null && Object.prototype.hasOwnProperty.call(STEP_LABEL_AR, step)) {
    return STEP_LABEL_AR[step as keyof typeof STEP_LABEL_AR];
  }
  for (let i = events.length - 1; i >= 0; i--) if (events[i].kind === "step") return events[i].label;
  return STAGE_START_LABEL_AR;
}

export function stageHeader(toolLabel: string | undefined): string {
  return toolLabel ? `يعمل الآن على: ${toolLabel}` : "يعمل الآن";
}

/**
 * Where a run this page stopped watching can be followed. The run page is real for
 * every account. Only the lawyer's activity log lists AI runs (S2 D1: the firm's
 * log reads another route, and /dashboard/lawyer is the lawyer's alone).
 */
export function stillRunningLinks(runId: string, userType: string | null): { href: string; label: string }[] {
  const links = [{ href: `/ai/runs/${runId}`, label: "افتح صفحة الطلب" }];
  if (userType === "lawyer") links.push({ href: "/dashboard/lawyer/activity", label: "سجل النشاط" });
  return links;
}

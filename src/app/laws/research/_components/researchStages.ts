/**
 * researchStages — the researcher's live «التفكير والتأصيل الحي» card (owner
 * file 11 item 6, V3 phase A2) as a pure function of what the server really
 * reported for the run (progress_events: its search phrases, the texts it
 * retrieved, «sent» when it handed them to the writer, its citation check).
 *
 * The prototype ticks four stages on 540 ms timers. Here a stage completes
 * ONLY on a real event — no timer, no guess:
 *   1 تفكيك الوقائع        ← the run's search phrases (kind "query")
 *   2 فحص النصوص السارية   ← the texts it retrieved (kind "law" / "principle" / "note")
 *   3 التحقق من السريان    ← the texts, with their library status, handed to the writer (step "sent")
 *   4 مطابقة المبادئ       ← the answer itself
 * With no event at all, the card says it is waiting and ticks nothing; the
 * folded «خطوات البحث» lists only what was recorded (and the source count).
 *
 * Pure (no imports), so `node --test` runs it.
 */

export interface StageEvent {
  id?: number;
  kind: string;
  label: string;
}

export interface ResearchStage {
  key: "facts" | "texts" | "validity" | "principles";
  running: string;
  done: string;
}

export const RESEARCH_STAGES: readonly ResearchStage[] = [
  { key: "facts", running: "جارٍ تفكيك وقائع السؤال وتحديد المسألة النظامية…", done: "فُكّكت وقائع السؤال وحُدّدت المسألة النظامية" },
  { key: "texts", running: "نفحص الآن النصوص السارية في المكتبة…", done: "فُحصت النصوص السارية في المكتبة" },
  { key: "validity", running: "نتحقق من سريان النصوص المسترجعة…", done: "تُحقّق من سريان النصوص المسترجعة" },
  { key: "principles", running: "نطابق المسألة مع المبادئ القضائية ونصوغ التأصيل…", done: "طوبقت المسألة بالمبادئ وصيغ التأصيل" },
] as const;

/** The server's step label for «handed to the writer» (progressEvents.STEP_LABEL_AR.sent). */
export const SENT_STEP_LABEL = "أُرسل الطلب إلى المحرّك";

const SOURCE_KINDS = new Set(["law", "principle", "note"]);

export interface StageView {
  /** How many of the four stages are complete (0–4). */
  done: number;
  /** The stage in progress (index), or null when all four are done. */
  current: number | null;
  /** «1 / 4»: the stage being worked on, counted from one. */
  counter: string;
  /** The headline: the current stage's running text, or the waiting line when nothing was reported. */
  headline: string;
  /** The completed stages' past-tense lines, in order. */
  completed: string[];
  /** True while the server has reported nothing yet. */
  waiting: boolean;
}

export const STAGE_WAITING_AR = "جارٍ بدء البحث في المكتبة…";

/** The stages reached by these events (and the answer, when it has arrived). */
export function stageView(events: readonly StageEvent[], answered: boolean): StageView {
  const has = (pred: (e: StageEvent) => boolean) => events.some(pred);
  const reached = [
    has((e) => e.kind === "query"),
    has((e) => SOURCE_KINDS.has(e.kind)),
    has((e) => e.kind === "step" && e.label === SENT_STEP_LABEL) || has((e) => e.kind === "verify"),
    answered,
  ];
  // A later stage implies the earlier ones only when the server reported it:
  // count the leading run of completed stages, never skip ahead.
  let done = 0;
  while (done < reached.length && reached[done]) done++;
  const current = done < RESEARCH_STAGES.length ? done : null;
  const waiting = events.length === 0 && !answered;
  return {
    done,
    current,
    counter: `${Math.min(done + 1, RESEARCH_STAGES.length)} / ${RESEARCH_STAGES.length}`,
    headline: waiting ? STAGE_WAITING_AR : current === null ? RESEARCH_STAGES[RESEARCH_STAGES.length - 1].done : RESEARCH_STAGES[current].running,
    completed: RESEARCH_STAGES.slice(0, done).map((s) => s.done),
    waiting,
  };
}

export interface FoldedSteps {
  queries: string[];
  texts: string[];
  principles: string[];
  checks: string[];
}

function unique(labels: string[]): string[] {
  return Array.from(new Set(labels.map((l) => l.trim()).filter(Boolean)));
}

/** What «خطوات البحث والتأصيل» lists after the answer: only what the run recorded. */
export function foldedSteps(events: readonly StageEvent[]): FoldedSteps {
  return {
    queries: unique(events.filter((e) => e.kind === "query").map((e) => e.label)),
    texts: unique(events.filter((e) => e.kind === "law" || e.kind === "note").map((e) => e.label)),
    principles: unique(events.filter((e) => e.kind === "principle").map((e) => e.label)),
    checks: unique(events.filter((e) => e.kind === "verify").map((e) => e.label)),
  };
}

export function foldedIsEmpty(f: FoldedSteps): boolean {
  return f.queries.length + f.texts.length + f.principles.length + f.checks.length === 0;
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
export function arabicDigits(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)]);
}

/** «مرجع واحد» / «مرجعان» / «٣ مراجع» / «١٢ مرجعاً» — the badge beside «خطوات البحث». */
export function sourcesCountAr(n: number): string {
  if (!Number.isInteger(n) || n <= 0) return "بلا مراجع";
  if (n === 1) return "مرجع واحد";
  if (n === 2) return "مرجعان";
  if (n <= 10) return `${arabicDigits(n)} مراجع`;
  return `${arabicDigits(n)} مرجعاً`;
}

/** Events merged by id (a poll may return one twice), in arrival order. */
export function mergeEvents(prev: readonly StageEvent[], next: readonly StageEvent[]): StageEvent[] {
  const seen = new Set(prev.map((e) => e.id).filter((id): id is number => typeof id === "number"));
  const out = [...prev];
  for (const e of next) {
    if (!e || typeof e.kind !== "string" || typeof e.label !== "string") continue;
    if (typeof e.id === "number") {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
    }
    out.push({ id: e.id, kind: e.kind, label: e.label });
  }
  return out;
}

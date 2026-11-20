/**
 * assistantCase.ts — T17a (batch l11): the «قضية محددة» tab of the advanced
 * assistant loads a REAL case of the caller's as the conversation's context.
 *
 * The page sends only `case_id` (tools.ts assistantInput). The run route reads
 * the case server-side with the CALLER's RLS client, and only a case the caller
 * owns: assigned to him, or opened by him (`assigned_to` / `requester_user_id`
 * = his id, on top of RLS). Anything else — another lawyer's case, a firm
 * colleague's, a made-up id — reads as "not found" and the run is refused
 * before any charge (runCore). What goes to the model is a short, capped
 * summary (title, type, status, stage, facts, document NAMES): never a file's
 * content, never a client's contact data. It travels in the package's `case`
 * slot only; ai_runs.input keeps the id, not the facts.
 *
 * Pure except `loadAssistantCase`, which takes the client as an argument, so
 * `node --test` runs assistantCase.test.ts with a fake.
 */
import { degreeFromDb } from "../services/caseStageVocabulary.ts";
import { requestTypeLabelAr } from "../services/requestTypeLabels.ts";

/**
 * service_requests.id is TEXT: a UUID from the route, or a minted reference
 * such as «REQ-MTJFH6ZF-B5OQ» (orderReference.ts). Letters, digits, «-» and
 * «_» only, so the id is always a plain value in the query, never syntax.
 */
export const CASE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CASE_FACTS_MAX = 3000;
export const CASE_TITLE_MAX = 200;
export const CASE_DOCS_MAX = 20;
export const CASE_LIST_MAX = 50;

/** What the model reads about the case (the package's `case` slot). */
export interface AssistantCaseContext {
  title: string;
  type: string | null;
  status: string | null;
  stage: string | null;
  facts: string;
  documents: string[];
}

/** service_requests.status (its CHECK constraint, plus the later «pending» / «in_progress»). */
const STATUS_AR: Readonly<Record<string, string>> = {
  draft: "مسودة",
  pending_payment: "بانتظار الدفع",
  pending_assignment: "بانتظار الإسناد",
  pending: "قيد الانتظار",
  assigned: "مسندة",
  in_progress: "قيد العمل",
  in_review: "قيد المراجعة",
  completed: "منتهية",
  cancelled: "ملغاة",
};

/** case_stages.outcome (the lawyer case file's OUTCOME_CONFIG words). */
const OUTCOME_AR: Readonly<Record<string, string>> = {
  pending: "قيد النظر",
  won: "كسب القضية",
  lost: "خسارة",
  partial: "حكم جزئي",
  settled: "تسوية",
  withdrawn: "تنازل",
};

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const cap = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s);

/** The summary the model gets, from the rows the route read. */
export function buildAssistantCase(
  row: Record<string, unknown>,
  stages: ReadonlyArray<Record<string, unknown>>,
  attachments: ReadonlyArray<Record<string, unknown>>,
): AssistantCaseContext {
  const latest = [...stages].sort((a, b) => Number(b.position ?? 0) - Number(a.position ?? 0))[0];
  const outcome = latest ? OUTCOME_AR[str(latest.outcome)] : undefined;
  const stage = latest && str(latest.degree) ? `الدرجة: ${degreeFromDb(str(latest.degree))}${outcome ? ` — ${outcome}` : ""}` : null;
  const documents = attachments
    .map((a) => str(a.file_name) || str(a.name))
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, CASE_DOCS_MAX)
    .map((n) => cap(n, 120));
  return {
    title: cap(str(row.title).trim() || "قضية بلا عنوان", CASE_TITLE_MAX),
    type: requestTypeLabelAr(str(row.type)),
    status: STATUS_AR[str(row.status)] ?? null,
    stage,
    facts: cap(str(row.description).trim(), CASE_FACTS_MAX),
    documents,
  };
}

/** The `.or(...)` that keeps a read to the caller's own cases (on top of RLS). */
export function ownCaseFilter(userId: string): string {
  if (!USER_ID.test(userId)) throw new Error("bad user id");
  return `assigned_to.eq.${userId},requester_user_id.eq.${userId}`;
}

type Res = { data: unknown; error: { message?: string; code?: string } | null };
/** The slice of a Supabase client this file uses (the route passes its RLS client). */
export interface CaseReader {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        or(filter: string): { maybeSingle(): PromiseLike<Res> };
        is(column: string, value: null): { order(column: string, opts: { ascending: boolean }): { limit(n: number): PromiseLike<Res> } };
        order(column: string, opts: { ascending: boolean }): PromiseLike<Res>;
      };
    };
  };
}

/**
 * The caller's own case as model context; null when it is not his (or not
 * there). Throws on a read failure, which the run reports as «unavailable»,
 * uncharged — never as "no such case".
 */
export async function loadAssistantCase(client: CaseReader, userId: string, caseId: string): Promise<AssistantCaseContext | null> {
  if (!CASE_ID.test(caseId)) return null;
  const kase = await client.from("service_requests").select("id, title, type, status, description").eq("id", caseId).or(ownCaseFilter(userId)).maybeSingle();
  if (kase.error) throw new Error(`case read failed: ${kase.error.code ?? ""}`);
  if (!kase.data) return null;
  // Stages and document names are extras: a failed read leaves them out.
  const [stages, docs] = await Promise.all([
    client.from("case_stages").select("degree, outcome, position").eq("case_request_id", caseId).order("position", { ascending: true }),
    client.from("attachments").select("file_name").eq("request_id", caseId).is("deleted_at", null).order("created_at", { ascending: false }).limit(CASE_DOCS_MAX),
  ]);
  return buildAssistantCase(
    kase.data as Record<string, unknown>,
    Array.isArray(stages.data) && !stages.error ? (stages.data as Record<string, unknown>[]) : [],
    Array.isArray(docs.data) && !docs.error ? (docs.data as Record<string, unknown>[]) : [],
  );
}

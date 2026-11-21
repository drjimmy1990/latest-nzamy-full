/**
 * The Nezamy Lawyer API v1 contract (/api/v1/ext/*), as zod schemas.
 * This file IS the contract: the MCP server, the Word add-in and the
 * platform-side route handlers (platform-patch/) are all written against it.
 *
 * Rules baked in:
 *  - every response carries `request_id`;
 *  - library text is never returned beyond what the caller's entitlement and
 *    read quota allow: `text` is null when `locked` is true;
 *  - every status is the library's own, never inferred by a model.
 */
import { z } from "zod";

export const LegalStatus = z.enum(["in_force", "amended", "repealed", "unknown"]);
export type LegalStatus = z.infer<typeof LegalStatus>;

export const NodeKind = z.enum(["law", "article", "principle", "decree", "fiqh"]);
export type NodeKind = z.infer<typeof NodeKind>;

export const Scope = z.enum(["library:read", "ai:run", "graph:read", "account:read", "dossier:read", "research:write"]);
export type Scope = z.infer<typeof Scope>;

const base = { request_id: z.string() };

/* ---------- library ---------- */

export const SearchHit = z.object({
  id: z.string(),
  kind: NodeKind,
  law_slug: z.string().nullable().optional(),
  law_title: z.string(),
  article_number: z.number().int().nullable().optional(),
  title: z.string(),
  /** At most 400 characters. Never the full text. */
  snippet: z.string().max(400),
  status: LegalStatus,
  url: z.string(),
  /** true = the caller's plan or quota does not allow the full text of this item. */
  locked: z.boolean(),
});
export type SearchHit = z.infer<typeof SearchHit>;

export const SearchLibraryRequest = z.object({
  q: z.string().min(2).max(400),
  type: NodeKind.optional(),
  law: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(20).default(8),
});
export type SearchLibraryRequest = z.input<typeof SearchLibraryRequest>;

export const SearchLibraryResponse = z.object({
  ...base,
  hits: z.array(SearchHit),
  routing: z.object({ source: z.enum(["graph", "keyword"]) }).optional(),
  usage_notice: z.string(),
});
export type SearchLibraryResponse = z.infer<typeof SearchLibraryResponse>;

export const ArticleResponse = z.object({
  ...base,
  id: z.string(),
  law_slug: z.string(),
  law_title: z.string(),
  article_number: z.number().int().nullable(),
  heading: z.string().nullable().optional(),
  /** null when `locked` (plan or quota). */
  text: z.string().nullable(),
  locked: z.boolean(),
  lock_reason: z.enum(["plan", "daily_quota", "hourly_quota", "library_lock", "device_limit"]).nullable().optional(),
  text_truncated: z.boolean(),
  status: LegalStatus,
  amended_by: z.array(z.object({ id: z.string(), title: z.string() })).default([]),
  usage_notice: z.string(),
  quota: z.object({ remaining_today: z.number().int().nullable() }).optional(),
  /** true = `text` is only a short excerpt (<=240 chars): the item was not cited, or the daily read cap is spent. */
  excerpt_only: z.boolean().optional(),
});
export type ArticleResponse = z.infer<typeof ArticleResponse>;

export const EdgeType = z.enum([
  "CITES", "EXCEPTS", "AMENDS", "INTERPRETS", "PENALIZES", "IMPLEMENTS", "REPLACES", "RELATED",
]);

export const NeighborsRequest = z.object({
  edge: EdgeType.optional(),
  depth: z.number().int().min(1).max(2).default(1),
  limit: z.number().int().min(1).max(30).default(12),
});
export type NeighborsRequest = z.input<typeof NeighborsRequest>;

export const NeighborsResponse = z.object({
  ...base,
  root_id: z.string(),
  edges: z.array(
    z.object({
      type: EdgeType,
      direction: z.enum(["out", "in"]),
      node: z.object({
        id: z.string(),
        kind: NodeKind,
        title: z.string(),
        law_title: z.string().nullable().optional(),
        article_number: z.number().int().nullable().optional(),
        status: LegalStatus,
        snippet: z.string().max(400),
        locked: z.boolean(),
      }),
    }),
  ),
  usage_notice: z.string(),
});
export type NeighborsResponse = z.infer<typeof NeighborsResponse>;

/* ---------- citations ---------- */

export const CitedRef = z.object({
  law: z.string().min(2).max(200),
  article: z.number().int().min(1).max(5000),
  as_written: z.string().max(300).optional(),
});
export type CitedRef = z.infer<typeof CitedRef>;

export const CheckCitationsRequest = z.object({ citations: z.array(CitedRef).min(1).max(30) });
export type CheckCitationsRequest = z.input<typeof CheckCitationsRequest>;

export const CitationStatus = z.enum(["ok", "amended", "repealed", "not_found", "unchecked"]);
export const CitationResult = z.object({
  cited: z.string(),
  law: z.string(),
  article: z.number().int(),
  status: CitationStatus,
  missing: z.enum(["law", "article"]).optional(),
  law_title: z.string().optional(),
  library_id: z.string().optional(),
  url: z.string().optional(),
});
export type CitationResult = z.infer<typeof CitationResult>;

export const CheckCitationsResponse = z.object({ ...base, results: z.array(CitationResult) });
export type CheckCitationsResponse = z.infer<typeof CheckCitationsResponse>;

/* ---------- account ---------- */

export const StandingResponse = z.object({
  ...base,
  plan: z.string().nullable(),
  points: z.object({ balance: z.number().int(), expiring_within_7_days: z.number().int().optional() }),
  library: z.object({
    entitled: z.boolean(),
    read_quota: z.object({
      daily_limit: z.number().int().nullable(),
      used_today: z.number().int(),
      locked: z.boolean(),
    }),
  }),
  token: z.object({ scopes: z.array(Scope), expires_at: z.string().nullable() }),
  /** true for platform admins/staff. New v2 tools are staff-only at first. */
  is_staff: z.boolean().optional(),
});
export type StandingResponse = z.infer<typeof StandingResponse>;

/* ---------- AI runs (thin wrappers over /api/v1/ai/runs) ---------- */

/** Tools open to external clients in v1. Anything with files waits for v1.1. */
export const ExtTool = z.enum(["legal-drafter", "contract-drafter", "brief-check", "sayegh-v2"]);
export type ExtTool = z.infer<typeof ExtTool>;

export const StartRunRequest = z.object({
  tool: ExtTool,
  input: z.record(z.unknown()),
  /** 8–128 chars. Same key = same run, never a second charge. */
  idempotency_key: z.string().min(8).max(128),
  /** legal-drafter: the draft turn must carry the analysis run's conversation. */
  conversation_id: z.string().optional(),
});
export type StartRunRequest = z.input<typeof StartRunRequest>;

export const QuoteRunResponse = z.object({
  ...base,
  tool: z.string(),
  price_points: z.number().int(),
  balance: z.number().int(),
  can_afford: z.boolean(),
  /** Runs left today for this tool (daily limit), null when unlimited. */
  daily_remaining: z.number().int().nullable(),
  /** e.g. "the draft that follows an analysis is free". Arabic, shown to the lawyer. */
  note: z.string().optional(),
});
export type QuoteRunResponse = z.infer<typeof QuoteRunResponse>;

export const RunStatus = z.enum(["running", "succeeded", "failed"]);
export type RunStatus = z.infer<typeof RunStatus>;

export const StartRunResponse = z.object({
  ...base,
  run_id: z.string(),
  conversation_id: z.string().nullable().optional(),
  status: RunStatus,
  charged_points: z.number().int(),
});
export type StartRunResponse = z.infer<typeof StartRunResponse>;

export const RunCitation = z.object({
  sid: z.string().optional(),
  title: z.string(),
  status: LegalStatus.optional(),
  library_id: z.string().optional(),
  url: z.string().optional(),
});

export const RunResponse = z.object({
  ...base,
  run_id: z.string(),
  tool: z.string(),
  status: RunStatus,
  conversation_id: z.string().nullable().optional(),
  progress: z.array(z.object({ step: z.string(), at: z.string() })).optional(),
  output: z.record(z.unknown()).nullable().optional(),
  citations: z.array(RunCitation).optional(),
  error_code: z.string().nullable().optional(),
  error_message: z.string().nullable().optional(),
  charged_points: z.number().int(),
  refunded: z.boolean(),
});
export type RunResponse = z.infer<typeof RunResponse>;

/* ---------- case dossier + research pool (Sayegh v2) ---------- */

export const SayeghStage = z.enum(["pipeline", "intake", "draft", "extraction", "adversary", "refine", "najiz"]);
export type SayeghStage = z.infer<typeof SayeghStage>;

export const DossierItem = z.object({
  item_id: z.string(),
  stage: z.string(),
  kind: z.string(),
  version: z.number().int(),
  hash: z.string().optional(),
  /** null when only the manifest was asked for or the item is too large; read it with a narrower filter. */
  content: z.string().nullable(),
  truncated: z.boolean().default(false),
});
export const DossierResponse = z.object({
  ...base,
  dossier_id: z.string(),
  title: z.string().nullable().optional(),
  manifest: z.array(z.object({ item_id: z.string(), stage: z.string(), kind: z.string(), version: z.number().int(), hash: z.string().optional() })),
  items: z.array(DossierItem),
});
export type DossierResponse = z.infer<typeof DossierResponse>;
export const DossierRequest = z.object({
  stage: z.string().max(40).optional(),
  kind: z.string().max(40).optional(),
  max_chars: z.number().int().min(500).max(40000).default(12000),
});
export type DossierRequest = z.input<typeof DossierRequest>;

export const AddResearchItemRequest = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(8000),
  source: z.string().max(300).default(""),
  item_type: z.enum(["note", "quote", "article", "link"]).default("note"),
  run_id: z.string().max(100).optional(),
});
export type AddResearchItemRequest = z.input<typeof AddResearchItemRequest>;
export const AddResearchItemResponse = z.object({ ...base, item_id: z.string() });
export type AddResearchItemResponse = z.infer<typeof AddResearchItemResponse>;

/* ---------- errors ---------- */

export const ApiErrorBody = z.object({
  request_id: z.string().optional(),
  error: z.string(),
  code: z.string().optional(),
  retry_after_seconds: z.number().optional(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

/** Library text always leaves with this notice (the MCP server forwards it verbatim). */
export const USAGE_NOTICE_AR =
  "النص من مكتبة نظامي للاستعانة الشخصية في عمل المحامي، ولا يجوز نشره أو إعادة توزيعه. تحقق من حالة المادة قبل الاستشهاد بها.";

/* ---------- Sayegh v2 output (n8n workflow nzamy-ai/legal-drafter-v2) ---------- */
/*
 * Source: docs/n8n-legal-drafter-v2.md (n8n session, 2026-11-21, staging design only). The shape is
 * L14's `title/sections/requests/cited` PLUS `lawyer_notes` and `najiz`. Everything here is lenient
 * (passthrough, nullable, optional) because the n8n side is not live yet: we read what is there and
 * never fail a run because a field is missing or has an unexpected shape.
 * ASSUMPTIONS (not in the n8n doc, marked so): item fields of `extraction.items`, `adversary.findings`,
 * `refine.changes`, and the shape of `cited`.
 */
export const NAJIZ_CHAR_LIMIT = 9000;

export const ExtractionNotes = z.object({
  items: z.array(z.unknown()).default([]),
  gaps: z.array(z.unknown()).default([]),
  conflicts: z.array(z.unknown()).default([]),
  dropped: z.array(z.unknown()).default([]),
}).passthrough();

export const AdversaryNotes = z.object({
  verdict: z.unknown().optional(),
  findings: z.array(z.unknown()).default([]),
}).passthrough();

export const RefineNotes = z.object({
  changes: z.array(z.unknown()).default([]),
  requests_changed: z.boolean().optional(),
}).passthrough();

export const LawyerNotes = z.object({
  extraction: ExtractionNotes.nullable().optional(),
  adversary: AdversaryNotes.nullable().optional(),
  refine: RefineNotes.nullable().optional(),
  skipped: z.array(z.unknown()).default([]),
  engine: z.object({
    stages: z.unknown().optional(),
    prompts: z.record(z.string()).optional(),
    models: z.unknown().optional(),
  }).passthrough().optional(),
}).passthrough();
export type LawyerNotes = z.infer<typeof LawyerNotes>;

export const NajizCopy = z.object({
  text: z.string(),
  chars: z.number().int().optional(),
  over_limit: z.boolean().optional(),
  markers_kept: z.union([z.boolean(), z.number(), z.array(z.string())]).optional(),
}).passthrough();
export type NajizCopy = z.infer<typeof NajizCopy>;

/** The v2-only part of a run's `output`. Absent/invalid parts come back as undefined, never as a throw. */
export function parseSayeghExtras(output: unknown): { lawyer_notes?: LawyerNotes; najiz?: NajizCopy } {
  const o = (output && typeof output === "object" ? output : {}) as Record<string, unknown>;
  const notes = LawyerNotes.safeParse(o.lawyer_notes);
  const najiz = NajizCopy.safeParse(o.najiz);
  return {
    ...(notes.success && o.lawyer_notes && typeof o.lawyer_notes === "object" ? { lawyer_notes: notes.data } : {}),
    ...(najiz.success ? { najiz: najiz.data } : {}),
  };
}

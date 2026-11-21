import { ApiError, WordClient } from "./client.js";
import { idempotencyKey, sha256Hex } from "./hash.js";
import { MIN_REVIEWABLE_CHARS, canSpend, documentEstimate } from "./pricing.js";
                                                                                                                         

                            
                     
                                                                                               
                  
                   
 

const MAX_PARAGRAPH_CHARS = 12_000;

/** Build the exact request for a feature. `nonce` makes a deliberate re-run a new run; a retry of the same click reuses the key. */
export async function buildRequest(
  feature                                             ,
  p                                                                                                         ,
)                                                                                                                 {
  const text = p.text.trim();
  if (text.length < MIN_REVIEWABLE_CHARS) throw new Error("النص قصير جدًا.");
  if (text.length > MAX_PARAGRAPH_CHARS) throw new Error("النص أطول من الحد المسموح للإجراء الواحد.");
  const tool           = feature === "review" ? "word-paragraph-review" : feature === "rewrite" ? "selection-rewrite" : feature === "citation" ? "citation-suggest" : "legal-drafter";
  const input                          = { text, source: "word" };
  if (feature === "rewrite" && p.instruction) input.instruction = p.instruction.slice(0, 500);
  if (feature === "stage") {
    if (!p.stage) throw new Error("حدّد المرحلة.");
    input.stage = p.stage;
  }
  const idempotency_key = await idempotencyKey([tool, String(input.stage ?? ""), String(input.instruction ?? ""), text, p.nonce ?? ""]);
  return { tool, input, idempotency_key, ...(p.conversation_id ? { conversation_id: p.conversation_id } : {}) };
}

                                                                                   

const KIND                             = { review: "paragraph_review", rewrite: "rewrite", citation: "citation_suggest", stage: "stage_run" };

/**
 * Quote -> (caller confirms price) -> run -> log on the case file.
 * `confirm` receives the SERVER quote; returning false aborts before any charge.
 */
export async function runFeature(
  ctx           ,
  feature                                             ,
  p                                                                                                                                  ,
  confirm                                                                                             ,
)                               {
  const req = await buildRequest(feature, p);
  const q = await ctx.client.quote({ tool: req.tool, input: req.input }                    );
  if (!q.can_afford || !canSpend(q.balance, q.price_points)) {
    throw new ApiError(402, "insufficient_points", "رصيد النقاط غير كافٍ لهذه العملية.", q.request_id);
  }
  if (!(await confirm(q))) return null;
  const run = await ctx.client.runAndWait(req);
  const out = await logOnCase(ctx, {
    action: KIND[feature] , stage: p.stage, run_id: run.run_id, paragraph_index: p.paragraphIndex,
    before_hash: await sha256Hex(p.text), charged_points: run.charged_points,
    after_hash: typeof run.output?.text === "string" ? await sha256Hex(run.output.text          ) : undefined,
  });
  return { run, ...out };
}

/** Whole-document review: one run per reviewable paragraph, total shown first. */
export function planDocumentReview(paragraphs                ) {
  const reviewable = paragraphs.filter((p) => p.text.trim().length >= MIN_REVIEWABLE_CHARS);
  return { reviewable, ...documentEstimate(reviewable) };
}

export async function logOnCase(ctx           , a                                                   )                                                  {
  if (!ctx.caseId) return { logged: false };
  try {
    const rec                 = { ...stripUndefined(a), case_id: ctx.caseId, at: (ctx.now?.() ?? new Date()).toISOString(), source: "word" };
    await ctx.client.logActivity(rec);
    return { logged: true };
  } catch (e) {
    // The lawyer's work must not be lost because the log call failed; surface it instead.
    return { logged: false, logError: e instanceof Error ? e.message : "log_failed" };
  }
}

function stripUndefined                  (o   )    {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))     ;
}

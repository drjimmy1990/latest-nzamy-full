/**
 * Local ESTIMATE only, for the "whole document" preview before asking the server.
 * ASSUMPTION: the owner asked for "paragraph review priced by length"; the tiers
 * and numbers below are placeholders. The server quote (/ai/runs/quote) is always
 * the authority and is what the lawyer confirms.
 */
                                                          
export const DEFAULT_PARAGRAPH_TIERS         = [
  { maxChars: 600, points: 1 },
  { maxChars: 1500, points: 2 },
  { maxChars: 4000, points: 4 },
  { maxChars: Infinity, points: 8 },
];

export function paragraphPrice(chars        , tiers         = DEFAULT_PARAGRAPH_TIERS)         {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  for (const t of tiers) if (chars <= t.maxChars) return t.points;
  return tiers[tiers.length - 1] .points;
}

export const MIN_REVIEWABLE_CHARS = 20;

export function documentEstimate(paragraphs                    , tiers         = DEFAULT_PARAGRAPH_TIERS) {
  const reviewable = paragraphs.filter((p) => p.text.trim().length >= MIN_REVIEWABLE_CHARS);
  const total = reviewable.reduce((s, p) => s + paragraphPrice(p.text.trim().length, tiers), 0);
  return { paragraphs: reviewable.length, estimate_points: total };
}

export function canSpend(balance        , price        )          { return price <= balance; }

/** Plain-language summary of a whole-document estimate, so the pane never shows raw JSON. Estimate only; the server quote decides. */
export function estimateSummary(totalParagraphs        , plan                                                 , balance         ) {
  const skipped = totalParagraphs - plan.paragraphs;
  const lines = [
    `الفقرات القابلة للمراجعة: ${plan.paragraphs} من ${totalParagraphs}` + (skipped > 0 ? ` (تُتجاهل ${skipped} فقرة أقصر من ${MIN_REVIEWABLE_CHARS} حرفًا)` : ""),
    `التكلفة التقريبية: ${plan.estimate_points} نقطة`,
  ];
  let enough                     ;
  if (typeof balance === "number") {
    enough = canSpend(balance, plan.estimate_points);
    lines.push(enough ? `رصيدك ${balance} نقطة، يكفي.` : `رصيدك ${balance} نقطة، لا يكفي (ينقص ${plan.estimate_points - balance}).`);
  }
  lines.push("هذا تقدير محلي بأرقام مؤقتة؛ السعر المعتمد هو الذي يعرضه الخادم قبل كل تشغيل.");
  return { text: lines.join("\n"), enough };
}

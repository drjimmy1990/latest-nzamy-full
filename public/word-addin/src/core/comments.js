import { normalise } from "./hash.js";
import { sha256Hex } from "./hash.js";
                                                              

export async function toParagraphRefs(texts          )                          {
  return Promise.all(texts.map(async (text, index) => ({ index, text, hash: await sha256Hex(text) })));
}

/**
 * Where does a client comment land in the CURRENT document?
 * Exact hash match only (paragraph untouched). Anything else is an "orphan": listed in the
 * pane for the lawyer, never silently attached to a paragraph that may be the wrong one.
 */
export function anchorComments(comments                 , current                ) {
  const byHash = new Map(current.map((p) => [p.hash, p]));
  const anchored                                                                        = [];
  const orphans                  = [];
  for (const c of comments) {
    if (c.resolved) continue;
    const exact = byHash.get(c.paragraph_hash);
    if (exact) { anchored.push({ comment: c, paragraph_index: exact.index, exact: true }); continue; }
    orphans.push(c);
  }
  return { anchored, orphans };
}

/** Jaccard over word sets, 0..1. Exported for the paragraph-moved heuristic and tests. */
export function similarity(a        , b        )         {
  const A = new Set(normalise(a).split(" ")), B = new Set(normalise(b).split(" "));
  if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / (A.size + B.size - n);
}

/**
 * Paragraphs whose text changed since `base` (the version last sent to the platform),
 * matched by index. Used for "and the reverse": push the lawyer's edits back as a new version note.
 */
export function changedParagraphs(base                , current                ) {
  const out                                                       = [];
  const n = Math.max(base.length, current.length);
  for (let i = 0; i < n; i++) {
    if (base[i]?.hash !== current[i]?.hash) out.push({ index: i, before: base[i]?.hash, after: current[i]?.hash });
  }
  return out;
}

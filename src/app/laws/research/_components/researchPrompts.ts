/**
 * researchPrompts — the questions the selection toolbar writes into the question
 * box (V3 «اسأل عن الجزئية» / «دفع مضاد»). Phrased as research questions, never
 * as a request to draft (the assistant refuses drafting before any charge).
 * Pure, so `node --test` runs it.
 */
const MAX_QUOTE = 300;

export function selectionPrompts(selected: string): { ask: string; counter: string } | null {
  const quote = String(selected ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUOTE);
  if (quote.length < 3) return null;
  return {
    ask: `فصّل التأصيل النظامي لهذه الجزئية: «${quote}»`,
    counter: `ما الدفوع المضادة الممكنة على هذه الجزئية، وما سندها النظامي؟ «${quote}»`,
  };
}

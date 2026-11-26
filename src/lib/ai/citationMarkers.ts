/**
 * citationMarkers.ts — the one stripper of the AI's source markers ([S1], [S12]).
 * Pure so node --test can load it; CitedAnswer re-exports it for the pages. Any
 * text that leaves the screen (copy, Word, print) goes through this.
 */
export const stripCitationMarkers = (text: string) => text.replace(/\s?\[S\d{1,3}\]/g, "");

/**
 * Batch l16 (422 «ungrounded»): the model's variants of a source marker
 * rewritten as the one form the app reads, [S1] — several ids in one pair of
 * brackets ([S1, S2], [S1، S2], [S1 و S2]), Arabic-Indic digits ([S١]), a
 * lower-case s, a leading zero, full-width brackets (【S1】). The same rule
 * runs in the n8n parse step (n8n/ai/workflows.mjs MARKERS_FN; the test pins
 * the two equal). It only rewrites markers: a citation still counts only when
 * its id is one of the sources the app sent (runCore mapCitations).
 */
export function normalizeCitationMarkers(text: string): string {
  return String(text)
    .replace(/[［【]([^［【］】\[\]\n]{1,40})[］】]/g, (m, inner: string) => (/^\s*[Ss]\s*[0-9٠-٩]/.test(inner) ? `[${inner}]` : m))
    .replace(/\[\s*[Ss]\s*[0-9٠-٩]{1,3}(?:\s*(?:[,،;؛]|و)\s*[Ss]?\s*[0-9٠-٩]{1,3})*\s*\]/g, (m) =>
      m
        .slice(1, -1)
        .split(/[,،;؛]|و/)
        .map((x) => `[S${String(Number(x.replace(/[^0-9٠-٩]/g, "").replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))))}]`)
        .join(""),
    );
}

/** The [S…] ids a text cites (after normalizeCitationMarkers), in order, each once. */
export function citedSourceIds(text: string): string[] {
  return [...new Set([...normalizeCitationMarkers(text).matchAll(/\[(S\d{1,3})\]/g)].map((m) => m[1]))];
}

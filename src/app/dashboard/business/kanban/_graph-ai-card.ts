/**
 * _graph-ai-card.ts — «اقترح سنداً نظامياً» on a case board (plan §5 L6, owner
 * ٢٩١: 10 points; manual cards stay free).
 *
 * The selected cards go to POST /api/v1/ai/runs (tool `canvas-card`). The server
 * searches the library from their text, the model picks up to three of the
 * articles it was given, and the server keeps only picks that name a text it
 * sent (runCore.mapCitations). Each law card is built here from the server's
 * citation — its library title and link — never from text the model wrote, so
 * every AI law card resolves to a real library article.
 */
import type { GraphNode } from "./_graph-model";

// Same values as NODE_W / NODE_H in ./_graph-model (not imported: that module
// loads the icon library, which `node --test` cannot run), as in _graph-import.ts.
const NODE_W = 220;
const NODE_H = 120;

export interface CardSuggestion {
  sid: string;
  title: string;
  url: string;
  why: string;
}

export interface CanvasCardAnswer {
  ok: boolean;
  suggestions: CardSuggestion[];
  /** The server's message on a refusal. */
  error?: string;
  chargedPoints?: number;
}

const FALLBACK = "تعذّر الاتصال بالخادم — حاول مرة أخرى";

function newKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** The server's picks joined to its citations; a pick without a citation is dropped. */
export function joinSuggestions(output: unknown, citations: unknown): CardSuggestion[] {
  const picks = (output as { cards?: unknown } | null)?.cards;
  if (!Array.isArray(picks) || !Array.isArray(citations)) return [];
  const bySid = new Map<string, { title: string; url: string }>();
  for (const c of citations) {
    const r = c as { sid?: unknown; title?: unknown; url?: unknown };
    if (typeof r.sid === "string" && typeof r.title === "string" && typeof r.url === "string") bySid.set(r.sid, { title: r.title, url: r.url });
  }
  const out: CardSuggestion[] = [];
  for (const p of picks) {
    const r = p as { sid?: unknown; why?: unknown };
    const cite = typeof r.sid === "string" ? bySid.get(r.sid) : undefined;
    if (!cite || typeof r.why !== "string" || out.some((s) => s.sid === r.sid)) continue;
    out.push({ sid: r.sid as string, title: cite.title, url: cite.url, why: r.why });
  }
  return out;
}

export async function askCanvasCard(
  cards: Array<Pick<GraphNode, "type" | "title" | "desc">>,
  fetchImpl: typeof fetch = fetch,
): Promise<CanvasCardAnswer> {
  let res: Response;
  try {
    res = await fetchImpl("/api/v1/ai/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: "canvas-card",
        input: { cards: cards.map((c) => ({ type: c.type, title: c.title, desc: c.desc })) },
        idempotencyKey: newKey(),
      }),
    });
  } catch {
    return { ok: false, suggestions: [], error: FALLBACK };
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const suggestions = res.ok ? joinSuggestions(json.output, json.citations) : [];
  if (res.ok && suggestions.length > 0) {
    return { ok: true, suggestions, chargedPoints: typeof json.chargedPoints === "number" ? json.chargedPoints : 0 };
  }
  return { ok: false, suggestions: [], error: typeof json.error === "string" && json.error ? json.error : FALLBACK };
}

/** The line a law card carries to its library text. */
export const sourceNote = (s: Pick<CardSuggestion, "title" | "url">, origin: string) => `المصدر: ${s.title}\n${origin}${s.url}`;

/**
 * The suggestions as law cards in a column to the right of the selected cards,
 * skipping an article the board already carries (its link is in a card's notes).
 */
export function suggestionsToNodes(
  suggestions: CardSuggestion[],
  existing: GraphNode[],
  selectedIds: ReadonlySet<string>,
  newId: () => string,
  origin: string,
): GraphNode[] {
  const onBoard = (url: string) => existing.some((n) => typeof n.notes === "string" && n.notes.includes(`${origin}${url}`));
  const fresh = suggestions.filter((s) => !onBoard(s.url));
  const selected = existing.filter((n) => selectedIds.has(n.id));
  const anchor = selected.length > 0 ? selected : existing;
  const right = anchor.length > 0 ? Math.max(...anchor.map((n) => n.pos.x + (n.w ?? NODE_W))) + 80 : 40;
  const top = anchor.length > 0 ? Math.min(...anchor.map((n) => n.pos.y)) : 40;
  return fresh.map((s, i) => ({
    id: newId(),
    type: "law",
    title: s.title,
    desc: s.why,
    pos: { x: right, y: top + i * (NODE_H + 40) },
    author: { name: "نظامي AI", role: "اقتراح نظامي", color: "bg-[#C8A762]" },
    meta: "اقتراح نظامي AI — راجعه قبل الاعتماد",
    notes: sourceNote(s, origin),
  }));
}

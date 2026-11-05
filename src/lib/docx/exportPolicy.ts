/**
 * exportPolicy.ts — q345: who sees the export bar on which letterhead, and what
 * may reach the paper. Pure; the bar only draws the answer. The server still
 * decides each read: this list only says what to offer.
 */
import { stripCitationMarkers } from "../ai/citationMarkers.ts";
import type { DocBlock } from "./ooxml.ts";

/**
 * A lawyer: his own, plus the firm's when he is a firm member with `firmPrint`
 * (the existing permissions.print: owner, managing partner, office admin; R32).
 * A firm account: the firm's. Everyone else: nothing, so clients keep today's
 * buttons and never see the bar.
 */
export function letterheadScopesFor(
  user: { userType: string | null; affiliation?: { entityType?: string } | null },
  firmPrint: boolean,
): ("lawyer" | "firm")[] {
  if (user.userType === "lawyer") return user.affiliation?.entityType === "firm" && firmPrint ? ["lawyer", "firm"] : ["lawyer"];
  if (user.userType === "firm") return ["firm"];
  return [];
}

/**
 * The last wall before the paper: both exports pass through here, whatever a
 * tool's helper did, so no raw [S1] is ever printed or written. A block left
 * empty by that is dropped.
 */
export function exportableBlocks(blocks: DocBlock[]): DocBlock[] {
  const clean = (text: string) => stripCitationMarkers(text).trim();
  const out: DocBlock[] = [];
  for (const block of blocks) {
    if (block.kind === "list") {
      const items = block.items.map(clean).filter(Boolean);
      if (items.length) out.push({ ...block, items });
    } else if (block.kind === "signature") {
      const lines = block.lines.map(clean).filter(Boolean);
      if (lines.length) out.push({ ...block, lines });
    } else {
      const text = clean(block.text);
      if (text) out.push({ ...block, text });
    }
  }
  return out;
}

/**
 * A text from the AI as paragraphs: no source markers, one paragraph per line
 * (Word stretches a justified line that ends in a line break), none empty.
 */
export function documentParagraphs(text: string): DocBlock[] {
  return stripCitationMarkers(text)
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ kind: "para", text: line }));
}

/** Resolves when `check` is true or the time is up: printing must never hang on a slow image. */
export function waitUntil(check: () => boolean, opts: { timeoutMs: number; intervalMs: number }): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + opts.timeoutMs;
    const tick = () => {
      if (check()) return resolve(true);
      if (Date.now() >= deadline) return resolve(false);
      setTimeout(tick, opts.intervalMs);
    };
    tick();
  });
}

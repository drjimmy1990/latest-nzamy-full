/**
 * Article callouts — which blockquotes are notes, warnings or legal texts,
 * and how each one looks. Pure (no React), so `node --test` can import it.
 *
 * Owner Q132–134: important notes in royal green / emerald, critical warnings
 * in amber / red, and the statutory text an article relies on in a
 * «السند النظامي» card with a scale icon, quoted verbatim. IMPORTANT boxes
 * were red.
 *
 * What the corpus actually uses (blog-toolkit/blog_final, 624 articles):
 *   - GitHub alerts `> [!IMPORTANT]` / `[!WARNING]` / `[!NOTE]` / `[!TIP]` —
 *     27 in all;
 *   - blocks whose first line is an emoji, usually alone on that line:
 *     ⚠️ ~245, 📢 ~192, 💡 ~116, 🚫 ~114, 📌 ~51, ⚖️ 3 («مرجعية المقال»);
 *   - verbatim statute quotes, `> *"لا يجوز …"*` — ~1,476 — plus ~41
 *     `> "…"` without the italic wrapper.
 * Every other blockquote stays a plain quote.
 */

export type CalloutKind = "important" | "note" | "tip" | "warning" | "critical" | "legal";

export interface Callout {
  kind: CalloutKind;
  /** Heading printed above the body; empty when the body carries its own. */
  label: string;
  /** Body lines, markdown untouched (verbatim for `legal`). */
  body: string[];
}

export const CALLOUT_LABELS: Record<CalloutKind, string> = {
  important: "هام",
  note: "ملاحظة",
  tip: "نصيحة",
  warning: "تنبيه",
  critical: "تحذير",
  legal: "السند النظامي",
};

/** Tailwind classes per kind — royal/emerald for notes, amber/red for warnings. */
export const CALLOUT_CLASSES: Record<CalloutKind, string> = {
  important: "border-royal/30 bg-royal/5 text-royal dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300",
  note: "border-royal/20 bg-royal/[0.03] text-royal dark:border-emerald-400/20 dark:bg-emerald-400/5 dark:text-emerald-300",
  tip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300",
  warning: "border-amber-400/50 bg-amber-400/10 text-amber-800 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300",
  critical: "border-red-400/50 bg-red-500/10 text-red-800 dark:border-red-400/40 dark:bg-red-500/10 dark:text-red-300",
  legal: "border-[#C8A762]/40 border-s-4 border-s-[#C8A762] bg-[#C8A762]/[0.07] text-gray-800 dark:text-zinc-200",
};

const GFM: Record<string, CalloutKind> = {
  IMPORTANT: "important",
  NOTE: "note",
  TIP: "tip",
  WARNING: "warning",
  CAUTION: "critical",
};

const EMOJI: Record<string, CalloutKind> = {
  "⚠": "warning",
  "🚫": "critical",
  "📢": "important",
  "📌": "note",
  "💡": "tip",
  "⚖": "legal",
};

/** Promotional blocks that quote the firm's own name are not legal texts. */
const PROMO_RE = /nezamy\.sa|نظامي للمحاماة/;

const clean = (line: string) => line.replace(/\r$/, "");

/**
 * Classify one blockquote, given its lines with the leading `>` already
 * removed. `null` means "render as a plain quote".
 */
export function classifyBlockquote(rawLines: string[]): Callout | null {
  const lines = rawLines.map(clean);
  if (lines.length === 0) return null;
  const first = lines[0].trim();

  const gfm = /^\[!(IMPORTANT|NOTE|TIP|WARNING|CAUTION)\]\s*(.*)$/.exec(first);
  if (gfm) {
    const kind = GFM[gfm[1]];
    const rest = gfm[2].trim();
    return { kind, label: CALLOUT_LABELS[kind], body: rest ? [rest, ...lines.slice(1)] : lines.slice(1) };
  }

  // An emoji (variation selector U+FE0F optional), alone or followed by text.
  const emoji = /^(⚠|🚫|📢|📌|💡|⚖)️?\s*(.*)$/u.exec(first);
  if (emoji) {
    const kind = EMOJI[emoji[1]];
    const rest = emoji[2].trim();
    const body = rest ? [rest, ...lines.slice(1)] : lines.slice(1);
    // «⚖️ **مرجعية المقال:** …» carries its own bold heading — and it is an
    // article reference, not a quoted statute — so it gets the card and the
    // scale icon but no «السند النظامي» heading of ours.
    return { kind, label: kind === "legal" ? "" : CALLOUT_LABELS[kind], body };
  }

  // A verbatim statute quote: the block opens with a quotation mark,
  // optionally after the `*` of an italic pair. ~180 quotes close that pair
  // (and the quotation) after the block — a list of «الآتية:» items follows —
  // so the closing `*` is dropped only when it is there.
  let text = lines.join("\n").trim();
  if (/^\*(?!\*)/.test(text)) {
    text = text.slice(1);
    if (/(?<!\*)\*$/.test(text)) text = text.slice(0, -1);
    text = text.trim();
  }
  if (/^["«“]/.test(text) && !PROMO_RE.test(text)) {
    return { kind: "legal", label: CALLOUT_LABELS.legal, body: text.split("\n") };
  }

  return null;
}

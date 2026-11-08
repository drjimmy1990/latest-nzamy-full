/**
 * #17 / #18 (owner package 6-Nov, library decision 09 §1): how a REPEALED
 * article reads. The owner's export writes it as
 *
 *   ### ~~المادة الأولى~~ `[ملغاة]`
 *   🚫 **أُلغيت هذه المادة بموجب:** المرسوم الملكي رقم (م/89) وتاريخ 1448/03/18ه.
 *   <details>📜 الإصدارات السابقة … النص قبل الإلغاء … </details>
 *   > ⚠️ **تنبيه:** المادة الأصلية ملغاة. وضع اللائحة المرتبطة بها لا يُستنتج آليًا …
 *   <!-- REGULATION … -->
 *
 * The parser lifts the <details> into `originalText`, so the article's `text`
 * keeps the heading, the «أُلغيت … بموجب» line and the warning. The reader
 * used to show `originalText || text` folded, which hid those lines whenever
 * the prior text existed. Now:
 *   heading — the export's struck heading line; not shown again (the card
 *             header already draws the number and title, struck);
 *   notice  — shown: the «أُلغيت … بموجب» line;
 *   prior   — folded: the text before repeal;
 *   warning — shown after the fold, right before the regulation block (the
 *             export's own order: line → fold → warning → regulation).
 *
 * Pure, no imports: `node --test` loads it (_repealed-article.test.ts).
 */

export interface RepealedArticleParts {
  heading: string;
  notice: string;
  prior: string;
  warning: string;
}

/** «أُلغيت هذه المادة» / «ألغيت هذه المادة» / «أُلغي هذا البند»: the article speaking of its own repeal. */
const SELF_REPEAL = /(?:^|[\s*>🚫⛔])[أا]ُ?لغ[يِ]ت?\s+(?:هذه|هذا)\s/u;
/**
 * «⚠️ **تنبيه:** …» / «> ⚠️ تنبيه: …»: the neutral warning the export puts
 * before the regulation. The ⚠ sign is required — a law's own «تنبيه:» line
 * stays in the prior wording.
 */
const WARNING_LINE = /^\s*(?:>\s*)*(?:⚠️|⚠)\s*\**\s*تنبيه\s*\**\s*:/u;
const HEADING_LINE = /^\s*#{1,6}\s/;
const TASHKEEL = /[ً-ٰٟـ]/g;

function norm(s: string): string {
  return s.replace(TASHKEEL, "").replace(/[\s>*"«»“”]+/g, " ").trim();
}

/** Split a repealed article's `text` / `originalText` into what is shown, folded, and the warning. */
export function splitRepealedArticle(text: string | null | undefined, originalText: string | null | undefined): RepealedArticleParts {
  const t = (text ?? "").replace(/\r\n/g, "\n");
  const o = (originalText ?? "").trim();
  const heading: string[] = [];
  const notice: string[] = [];
  const warning: string[] = [];
  const rest: string[] = [];
  let inWarning = false;
  // The heading and the «أُلغيت … بموجب» line are only looked for in the
  // leading block: once the prior wording starts, its own sub-headings and a
  // «أُلغي هذا البند …» inside it stay where they are (in the fold).
  let leading = true;
  for (const line of t.split("\n")) {
    if (line.trim() === "") {
      inWarning = false;
      if (!leading) rest.push(line);
      continue;
    }
    if (inWarning || WARNING_LINE.test(line)) {
      // The warning runs to the end of its paragraph.
      warning.push(line);
      inWarning = true;
    } else if (leading && HEADING_LINE.test(line)) {
      heading.push(line.trim());
    } else if (leading && SELF_REPEAL.test(line)) {
      notice.push(line);
    } else {
      leading = false;
      rest.push(line);
    }
  }
  const restText = rest.join("\n").trim();
  if (o) {
    // `text` minus the heading and the repeal line is extra notice text — unless it
    // only repeats the prior wording (some rows carry it in both columns).
    const extra = restText && norm(restText) !== norm(o) && !norm(o).includes(norm(restText)) ? restText : "";
    return {
      heading: heading.join("\n"),
      notice: [notice.join("\n").trim(), extra].filter(Boolean).join("\n\n"),
      prior: o,
      warning: warning.join("\n").trim(),
    };
  }
  // No separate prior text: whatever is not the heading / repeal line / warning IS it.
  return { heading: heading.join("\n"), notice: notice.join("\n").trim(), prior: restText, warning: warning.join("\n").trim() };
}

/**
 * «أُلغيت هذه المادة بموجب: …» built from the article's repeal entry when its
 * `text` carries no such line (older rows). Only from what the API sends —
 * null when the instrument is withheld (T28-22) or unknown.
 */
export function repealedByLine(
  notice: string,
  amendments: ReadonlyArray<{ type?: string | null; source?: string | null; date?: string | null }> | null | undefined,
): string | null {
  if (SELF_REPEAL.test(notice)) return null;
  const entry = (amendments ?? []).find((a) => (a.type ?? "").trim() === "إلغاء" && (a.source ?? "").trim());
  if (!entry) return null;
  const date = (entry.date ?? "").trim();
  return `أُلغيت هذه المادة بموجب: ${(entry.source ?? "").trim()}${date ? ` وتاريخ ${date}` : ""}.`;
}

export interface StrikeSegment {
  text: string;
  struck: boolean;
}

/** A heading's «~~…~~» parts, so the reader can strike them without HTML in the sanitiser. */
export function splitStrike(text: string): StrikeSegment[] {
  const out: StrikeSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(/~~(.+?)~~/g)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), struck: false });
    out.push({ text: m[1], struck: true });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), struck: false });
  return out.length ? out : [{ text, struck: false }];
}

/** «[ملغاة]» / «(ملغى)» after a heading, in or out of backticks. */
const REPEALED_MARKER = /\s*`?\s*(?:\[\s*ملغ[اى]ة?\s*\]|\(\s*ملغ[اى]ة?\s*\))\s*`?/gu;

/** The heading without its «[ملغاة]» token, and whether it had one (the reader shows a badge instead). */
export function splitRepealedMarker(heading: string): { text: string; repealed: boolean } {
  const text = heading.replace(REPEALED_MARKER, " ").replace(/[ \t]{2,}/g, " ").trim();
  return text === heading.trim() ? { text: heading, repealed: false } : { text, repealed: true };
}

/**
 * «تعديل:» / «نص … قبل التعديل» out of the current text — owner file 16 §3–§4
 * (19 Nov 2026, screenshots 03 and 04), O12 / T14b of batch l11.
 *
 * The parser (l9-parser, 20261129_70) folds every amendment note and every
 * superseded wording into `<details>` and pairs them with their anchor. Data
 * loaded before it still carries some of them OPEN in an article's live text:
 * نظام القضاء, article 1, ends with
 *
 *   ### القسم الأول: آلية العمل التنفيذية لنظام القضاء
 *   > > **🔄 تعديل:** عدلت الفقرة (5) بموجب المرسوم الملكي رقم (م/113) …
 *   > > **ونص الفقرة (5) قبل هذا التعديل (كما عدلت بالمرسوم م/6):**
 *   > > "…"
 *   > > **🔄 تعديل:** عدلت الفقرة (5) وحذفت عبارة من الفقرة (7) بموجب … (م/6) …
 *   > > **ونص الفقرة (5) الأصلي قبل التعديل:**  …  **ونص الفقرة (7) …:**  …
 *   > </details>
 *
 * This is the reader's safety net until that data is re-loaded:
 *   - `splitAmendmentText` lifts such a block off the END of the text — only a
 *     trailing run made of nothing but notes, «before» labels, their quoted (or
 *     one-paragraph) bodies, AMENDMENT anchors and a stray `</details>`. Text
 *     in the middle of an article, or a run that cannot be read whole, is left
 *     where it is: superseded wording shown as current is the old bug, current
 *     wording hidden would be a worse one;
 *   - one group per «تعديل:» note (or per anchor): the source's OWN grouping,
 *     never a guess — each «before» text belongs to the note above it;
 *   - a heading left dangling at the very end that only names one of the
 *     article's regulations («القسم الأول: آلية العمل التنفيذية…») goes too:
 *     the regulation section below already carries that name;
 *   - `mergeLiftedVersions` joins the lifted groups to the article's
 *     «الإصدارات السابقة» rows, dropping a row that repeats a lifted text or
 *     names the same decree (number AND date) with no text of its own;
 *   - `pickDiffTarget` chooses what a previous wording is compared with: the
 *     current text, one of its paragraphs, or a paragraph of the article's
 *     regulation — the one it shares most words with, or nothing when none is
 *     close (a diff against an unrelated text is all colour and no meaning).
 *
 * The labels are the parser's own lists (article-history.ts), as
 * _details-block.ts uses them. Display only: nothing here reaches the server,
 * and the reader applies it to the text the law API already sent this viewer
 * (an article's text is server-only and paywalled; nothing new is exposed).
 *
 * Pure: `node --test` runs _amendment-split.test.ts.
 */
import { BEFORE_TEXT_LABELS } from "../../../../scripts/parsers/lib/article-history.ts";
import { cleanVersionText, hijriDateKey, type AmendmentLike } from "./_previous-versions.ts";

/** One «before» text of a lifted group: its label as the source wrote it, and the wording. */
export interface LiftedPart {
  label: string;
  text: string;
}

/** One amendment lifted out of the current text. */
export interface LiftedVersion {
  /** The «تعديل: …» note, cleaned of marks ('' when the group has none). */
  note: string;
  /** The superseded wordings, in source order. */
  parts: LiftedPart[];
  /** From an AMENDMENT anchor, when the text carries one. */
  decree: string;
  date: string;
}

export interface AmendmentSplit {
  /** The current text: the input without the lifted run (unchanged when nothing was lifted). */
  current: string;
  lifted: LiftedVersion[];
}

// ── Classification ───────────────────────────────────────────────────────────

const TASHKEEL = /[ً-ٰٟـ]/g;
/** Emoji and pictographs used as line markers («🔄», «⚖️», «📝», «❌», «✨»). */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{2B00}-\u{2BFF}]/gu;

function fold(s: string): string {
  return s.replace(TASHKEEL, "").replace(/[أإآ]/g, "ا");
}

/** The line without its blockquote marks, and how many there were. */
function unquoteLine(line: string): { depth: number; body: string } {
  const m = /^\s*((?:>\s?)*)/.exec(line);
  const marks = m ? m[1] : "";
  return { depth: (marks.match(/>/g) ?? []).length, body: line.slice(m ? m[0].length : 0) };
}

/** Markup and markers off a label or note: «**🔄 تعديل:**» → «تعديل:». */
function plainLine(s: string): string {
  return s.replace(EMOJI, "").replace(/\*\*|__|`/g, "").replace(/\s+/g, " ").trim();
}

const BEFORE_LABELS = BEFORE_TEXT_LABELS.map((l) => fold(l));

/**
 * «تعديل:» (numbered «تعديل 2:» too), or one of the longer change notes. The
 * definite «الإلغاء» / «إلغاء» / «إضافة» count only behind a marker emoji or
 * in bold: a definitions list may well say «**الإلغاء** : …» with a space.
 */
function isNoteLine(raw: string): boolean {
  const hasMarker = EMOJI.test(raw);
  EMOJI.lastIndex = 0;
  const bold = /^\s*\*\*/.test(raw);
  const s = fold(plainLine(raw));
  if (/^تعديل(?:\s*[\d٠-٩]+)?\s*[:：]/.test(s)) return true;
  if (/^(?:عدلت|اضيفت|الغيت)\s+هذه\s+الماده\s+بموجب/.test(s)) return true;
  if ((hasMarker || bold) && /^(?:الالغاء|الغاء|اضافه|اضافة)\s*[:：]/.test(s)) return true;
  return false;
}

/** «ونص الفقرة (5) قبل هذا التعديل …:», «النص قبل التعديل:» — a label ending in a colon. */
function isBeforeLabelLine(raw: string): boolean {
  const s = fold(plainLine(raw));
  if (!/[:：]$/.test(s)) return false;
  if (!BEFORE_LABELS.some((l) => s.startsWith(l))) return false;
  // «نص الفقرة …» alone is not enough: the label must say which wording it is.
  return /قبل|الاصلي|السابق|المحذوف/.test(s);
}

const ANCHOR_RE = /<!--\s*AMENDMENT\s+(\{[\s\S]*?\})\s*-->/;

function readAnchor(body: string): { decree: string; date: string } | null {
  const m = ANCHOR_RE.exec(body);
  if (!m) return null;
  try {
    const o = JSON.parse(m[1]) as Record<string, unknown>;
    return {
      decree: typeof o.decree === "string" ? o.decree.trim() : "",
      date: typeof o.date === "string" ? o.date.trim() : "",
    };
  } catch {
    return { decree: "", date: "" };
  }
}

type Kind = "blank" | "close" | "anchor" | "note" | "label" | "body" | "open";

function classify(line: string): { kind: Kind; depth: number; body: string } {
  const { depth, body } = unquoteLine(line);
  const t = body.trim();
  if (t === "") return { kind: "blank", depth, body: t };
  if (/^<\/details\s*>$/i.test(t)) return { kind: "close", depth, body: t };
  if (/<details\b|<summary\b/i.test(t)) return { kind: "open", depth, body: t };
  if (ANCHOR_RE.test(t) && t.replace(ANCHOR_RE, "").trim() === "") return { kind: "anchor", depth, body: t };
  if (isNoteLine(t)) return { kind: "note", depth, body: t };
  if (isBeforeLabelLine(t)) return { kind: "label", depth, body: t };
  return { kind: "body", depth, body: t };
}

// ── The lift ─────────────────────────────────────────────────────────────────

/**
 * Whether lines[from..] is one readable history run. Quoted bodies may run on;
 * an unquoted body is one paragraph after its label (a blank line ends it, and
 * what follows must be history again) — never "everything to the end".
 */
function readRun(lines: ReadonlyArray<ReturnType<typeof classify>>, from: number): LiftedVersion[] | null {
  const first = lines[from];
  if (!first || (first.kind !== "note" && first.kind !== "label" && first.kind !== "anchor")) return null;
  const groups: LiftedVersion[] = [];
  const st: {
    group: LiftedVersion | null;
    part: { label: string; depth: number; lines: string[] } | null;
  } = { group: null, part: null };
  let sawContent = false;
  const flushPart = () => {
    if (st.group && st.part) st.group.parts.push({ label: st.part.label, text: st.part.lines.join("\n") });
    st.part = null;
  };
  const newGroup = (): LiftedVersion => {
    flushPart();
    if (st.group && (st.group.note || st.group.parts.length)) groups.push(st.group);
    st.group = { note: "", parts: [], decree: "", date: "" };
    return st.group;
  };
  for (let i = from; i < lines.length; i++) {
    const l = lines[i];
    if (l.kind === "open") return null;
    if (l.kind === "blank") {
      if (st.part && st.part.lines.length > 0) st.part.lines.push("");
      continue;
    }
    if (l.kind === "close") {
      // A stray `</details>` ends the run only at the very end.
      if (lines.slice(i + 1).some((x) => x.kind !== "blank")) return null;
      continue;
    }
    if (l.kind === "anchor") {
      const g = newGroup();
      const a = readAnchor(l.body);
      if (a) Object.assign(g, a);
      continue;
    }
    if (l.kind === "note") {
      // A note opens a new amendment, unless it is the first line of an anchor's group.
      const g = st.group && !st.group.note && st.group.parts.length === 0 && !st.part ? st.group : newGroup();
      g.note = plainLine(l.body);
      sawContent = true;
      continue;
    }
    if (l.kind === "label") {
      const g = st.group ?? newGroup();
      flushPart();
      st.group = g;
      st.part = { label: plainLine(l.body).replace(/\s*[:：]\s*$/, ""), depth: l.depth, lines: [] };
      sawContent = true;
      continue;
    }
    // A body line.
    const part = st.part;
    if (l.depth === 0) {
      // Unquoted: only the one paragraph right after an unquoted label.
      if (!part || part.depth !== 0) return null;
      if (part.lines.some((x) => x === "")) return null;
    } else if (!part) {
      // A quoted line before any label continues the note.
      if (!st.group || !st.group.note) return null;
      st.group.note = `${st.group.note} ${plainLine(l.body)}`.trim();
      continue;
    } else if (l.depth < part.depth) {
      // Shallower than its label: the history block has ended, current text follows.
      return null;
    }
    part.lines.push(l.body);
  }
  newGroup();
  return sawContent && groups.length > 0 ? groups : null;
}

function normName(s: string): string {
  return fold(s).replace(/[ةه]/g, "ه").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

/**
 * A heading line that only names one of the article's regulations: «###
 * القسم الأول: آلية العمل التنفيذية لنظام القضاء» when the article carries
 * «آلية العمل التنفيذية لنظام القضاء ونظام ديوان المظالم». At least three words
 * after its «القسم …:» prefix, all inside one regulation name.
 */
function isRegulationNameHeading(line: string, regulationNames: readonly string[]): boolean {
  const m = /^\s*#{1,6}\s+(.+)$/.exec(unquoteLine(line).body);
  if (!m) return false;
  const name = normName(plainLine(m[1]).replace(/^[^:：]{0,40}[:：]\s*/, ""));
  if (name.split(" ").length < 3) return false;
  return regulationNames.some((r) => {
    const n = normName(r);
    return n !== "" && (n === name || n.startsWith(`${name} `) || n.includes(` ${name} `) || n.endsWith(` ${name}`));
  });
}

/** The names an article's regulation section goes by (its refs and heading), for the dangling heading. */
export function regulationNamesOf(a: {
  regulations?: ReadonlyArray<{ ref?: string | null }> | null;
  executiveReg?: { ref?: string | null } | null;
  regulationHeading?: string | null;
}): string[] {
  const names = [
    ...(Array.isArray(a.regulations) ? a.regulations.map((r) => r?.ref ?? "") : []),
    ...String(a.executiveReg?.ref ?? "").split(/[،,]\s*/),
    a.regulationHeading ?? "",
  ];
  return Array.from(new Set(names.map((n) => String(n ?? "").trim()).filter(Boolean)));
}

/**
 * The current text and what is lifted out of it. `regulationNames` are the
 * article's regulation refs (for the dangling heading). Never throws; a text
 * with nothing to lift comes back unchanged.
 */
export function splitAmendmentText(text: string | null | undefined, regulationNames: readonly string[] = []): AmendmentSplit {
  const src = typeof text === "string" ? text : "";
  if (!src) return { current: src, lifted: [] };
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const raw = src.split(/\r?\n/);
  const lines = raw.map(classify);

  // Only lines outside every <details> may start the run.
  let depth = 0;
  const outside: boolean[] = [];
  for (const l of lines) {
    outside.push(depth === 0);
    if (/<details\b/i.test(l.body)) depth++;
    if (/<\/details\s*>/i.test(l.body)) depth = Math.max(0, depth - 1);
  }

  let cut = raw.length;
  let lifted: LiftedVersion[] = [];
  for (let s = 0; s < lines.length; s++) {
    if (!outside[s]) continue;
    const k = lines[s].kind;
    if (k !== "note" && k !== "label" && k !== "anchor") continue;
    const run = readRun(lines, s);
    if (run) {
      cut = s;
      lifted = run;
      break;
    }
  }

  const kept = raw.slice(0, cut);
  // Trailing blank / «>»-only lines, then a heading that only names a regulation.
  const trimEnd = () => {
    while (kept.length > 0 && unquoteLine(kept[kept.length - 1]).body.trim() === "") kept.pop();
  };
  trimEnd();
  let headingDropped = false;
  if (kept.length > 0 && isRegulationNameHeading(kept[kept.length - 1], regulationNames)) {
    kept.pop();
    trimEnd();
    headingDropped = true;
  }
  if (lifted.length === 0 && !headingDropped) return { current: src, lifted: [] };
  return { current: kept.join(eol), lifted };
}

// ── Joining the lifted groups to the «الإصدارات السابقة» rows ────────────────

/** For matching only: the version text cleaned, tashkeel off, spaces collapsed. Punctuation stays. */
export function versionKey(s: string | null | undefined): string {
  return cleanVersionText(s).replace(TASHKEEL, "").replace(/\s+/g, " ").trim();
}

/** «م/113 + 1443/11/09» from a decree's words, '' when either is missing. */
function decreeKey(words: string): string {
  const t = words.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  const num = /([أإامق])\s*\/\s*(\d{1,6})/.exec(t);
  const date = hijriDateKey(t);
  return num && date ? `${num[1].replace(/[إا]/g, "أ")}/${Number(num[2])}@${date}` : "";
}

/** Word-set F1 at or above which a stored row is the same wording as a lifted one. */
export const SAME_VERSION_F1 = 0.95;

/** F1 of the two texts' word sets (0 when either has none). */
export function wordF1(a: string, b: string): number {
  const wa = new Set(words(a));
  const wb = new Set(words(b));
  if (wa.size === 0 || wb.size === 0) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  if (common === 0) return 0;
  const p = common / wb.size;
  const r = common / wa.size;
  return (2 * p * r) / (p + r);
}

/** The lifted group as one «الإصدارات السابقة» entry. */
function asAmendment(v: LiftedVersion, showSource: boolean): AmendmentLike {
  const dateWords = [v.date, v.decree, v.note].join(" ");
  const parts = v.parts.map((p) => ({ label: p.label, text: cleanVersionText(p.text) })).filter((p) => p.text !== "");
  return {
    // The instrument and its date are a subscriber's (T28-22), as the law API sends them.
    source: showSource ? v.decree : "",
    date: showSource ? v.date : "",
    sourceLocked: !showSource,
    summary: showSource ? v.note : "",
    fullText: parts.map((p) => p.text).join("\n\n"),
    parts,
    sortDate: dateWords,
    textStatus: parts.length === 0 ? "unavailable" : "available",
  };
}

/**
 * The article's rows and the lifted groups as one list for visibleAmendments.
 * A row is left out when it repeats a lifted text, or when it has no text of
 * its own and names the same decree (number and date) as a lifted group.
 * `showSource` false (official metadata withheld from this viewer): a lifted
 * card shows the lock line instead of its note and decree, like a row does.
 */
export function mergeLiftedVersions(
  rows: ReadonlyArray<AmendmentLike> | null | undefined,
  lifted: ReadonlyArray<LiftedVersion> | null | undefined,
  showSource: boolean,
): AmendmentLike[] {
  const base = Array.isArray(rows) ? rows.filter((r) => r && typeof r === "object") : [];
  if (!Array.isArray(lifted) || lifted.length === 0) return [...base];
  const texts = new Set<string>();
  const decrees = new Set<string>();
  for (const v of lifted as ReadonlyArray<LiftedVersion>) {
    for (const p of v.parts) texts.add(versionKey(p.text));
    texts.add(versionKey(v.parts.map((p) => p.text).join("\n\n")));
    const k = decreeKey(`${v.decree} ${v.date}`) || decreeKey(v.note);
    if (k) decrees.add(k);
  }
  texts.delete("");
  const partTexts = (lifted as ReadonlyArray<LiftedVersion>).flatMap((v) => v.parts.map((p) => versionKey(p.text))).filter(Boolean);
  const kept = base.filter((r) => {
    const t = versionKey(r.fullText);
    if (t && texts.has(t)) return false;
    // The same wording stored with a small difference (a stray mark, spacing, an
    // audit note taken out): near-identical words. Two real versions of one
    // paragraph stay far below this (the two ¶5 wordings of نظام القضاء: ≈0.6).
    if (t && partTexts.some((p) => wordF1(t, p) >= SAME_VERSION_F1)) return false;
    const hasOwnText = t !== "" || versionKey(r.summary) !== "";
    if (!hasOwnText && !r.sourceLocked) {
      const k = decreeKey(`${r.source ?? ""} ${r.date ?? ""}`);
      if (k && decrees.has(k)) return false;
    }
    return true;
  });
  return [...kept, ...lifted.map((v) => asAmendment(v, showSource))];
}

// ── What a previous wording is compared with ────────────────────────────────

function words(s: string): string[] {
  return fold(s)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

/** The paragraphs of a text: blank-line blocks and numbered items, quote marks and bold off. */
export function paragraphsOf(text: string | null | undefined): string[] {
  const lines = String(text ?? "").split(/\r?\n/).map((l) => unquoteLine(l).body.replace(/\*\*|__/g, ""));
  const out: string[] = [];
  let cur: string[] = [];
  const flush = () => {
    const p = cur.join("\n").trim();
    if (p) out.push(p);
    cur = [];
  };
  for (const l of lines) {
    if (l.trim() === "") { flush(); continue; }
    if (/^\s*(?:[\d٠-٩]{1,3}|[أ-ي])\s*[.\-)]\s+/.test(l) && cur.length > 0) flush();
    cur.push(l);
  }
  flush();
  return out;
}

/** The texts a previous wording may be compared with: the whole current text, its paragraphs, the regulation's paragraphs. */
export function diffCandidates(current: string, regulationText = ""): string[] {
  const all = [current, ...paragraphsOf(current), ...paragraphsOf(regulationText)].map((s) => s.trim()).filter(Boolean);
  return Array.from(new Set(all));
}

/** Below this F1 word overlap nothing is close enough to compare with. */
export const DIFF_MIN_OVERLAP = 0.3;

/**
 * The candidate sharing the most words with `oldText` (F1 of the two word
 * sets; the shorter wins a tie), or null when none reaches DIFF_MIN_OVERLAP.
 */
export function pickDiffTarget(oldText: string, candidates: readonly string[]): string | null {
  const old = new Set(words(oldText));
  if (old.size === 0) return null;
  let best: { text: string; score: number } | null = null;
  for (const c of candidates) {
    const cw = new Set(words(c));
    if (cw.size === 0) continue;
    let common = 0;
    for (const w of old) if (cw.has(w)) common++;
    if (common === 0) continue;
    const p = common / cw.size;
    const r = common / old.size;
    const score = (2 * p * r) / (p + r);
    if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) <= 1e-9 && c.length < best.text.length)) {
      best = { text: c, score };
    }
  }
  return best && best.score >= DIFF_MIN_OVERLAP ? best.text : null;
}

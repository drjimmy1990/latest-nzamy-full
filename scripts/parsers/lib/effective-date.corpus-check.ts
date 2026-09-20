#!/usr/bin/env npx tsx
/**
 * effective-date.corpus-check.ts — ك-04: report-only drift check between a
 * law's DECLARED effective date (frontmatter) and the effective date
 * COMPUTED from its own closing "N days after publication" article.
 *
 * Rule ق-15 (schema_manifest.json:530-544) already specifies the policy this
 * implements: compute only when the text explicitly states a duration from a
 * known anchor, never guess, document the basis, and flag ambiguity for
 * human review instead of resolving it. This script is that check — it does
 * NOT write to any file, DB, or frontmatter. Output is a console summary plus
 * a JSON report for individual review.
 *
 * Scope decision (documented, not silent): computation is Gregorian-side
 * only (publication_date_gregorian + N days, plain calendar arithmetic). No
 * Hijri↔Gregorian conversion library exists in this codebase, and rule ق-15
 * requires official Umm al-Qura conversion for the Hijri side — a home-grown
 * approximation would risk exactly the silent-wrong-legal-date outcome this
 * tool exists to catch. Hijri-only files (no Gregorian publication date) are
 * reported separately as "cannot verify", never guessed at.
 *
 * Known hard cases this script is deliberately conservative about (see
 * ب-153 in 06_أعطال_حية_مؤكدة for the investigation this was built from):
 *   - The verb "يُعمل" often carries a combining damma (U+064F) invisible to
 *     a plain-text search for "يعمل" — diacritics are stripped from a match
 *     COPY of the body before pattern matching (never from the quoted
 *     evidence shown in the report).
 *   - Numbers appear as Arabic words, Western digits, AND Eastern-Indic
 *     digits, sometimes in the same sentence.
 *   - "N days" alone is a common false-positive source (appeal windows,
 *     grace periods, etc. elsewhere in the body) — a candidate requires the
 *     verb root, the day-count, AND a self-referential "من تاريخ نشر" anchor
 *     within one bounded window, not just "N days" anywhere in the file.
 *   - Merged law+regulation files can have TWO genuine closing articles
 *     (one per instrument) — multiple distinct candidates are reported for
 *     disambiguation, never collapsed to "the last one" by guesswork.
 *   - A later instrument can override an earlier law's own effective-date
 *     article (confirmed real case: PDPL's 180 days → 540 by a later royal
 *     order). This script cannot safely auto-link the two, so it separately
 *     lists candidate superseding instruments by title pattern for manual
 *     cross-check.
 *
 * Run:
 *   npx tsx scripts/parsers/lib/effective-date.corpus-check.ts "<library root>"
 */

import * as fs from "fs";
import * as path from "path";
import { parseFrontmatter } from "./frontmatter";
import { nullIfForbidden, filterMeta } from "../manifest";
import { applyExclusions } from "./exclusions";
import { stripDetails } from "./article-history";

const root =
  process.argv[2] ||
  path.resolve(process.cwd(), "last_owner/01_المكتبة_القانونية/أنظمة ولوائح");

// Long-path prefix — same rule (ق-4) and pattern as article-history.corpus-check.ts.
const L = (p: string): string => (p.startsWith("\\\\?\\") ? p : "\\\\?\\" + p);

function walk(dir: string, out: string[] = []): string[] {
  let ents: fs.Dirent[];
  try {
    ents = fs.readdirSync(L(dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith(".md")) out.push(full);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Arabic text normalization
// ─────────────────────────────────────────────────────────────────────────

// Strips Arabic combining diacritics (tashkeel) so "يُعمل" and "يعمل" match
// the same pattern. Applied ONLY to a working copy used for matching — the
// report always quotes the ORIGINAL, undiacritized-or-not text as evidence.
const DIACRITIC_RE = /[ً-ٰٟ]/g;

function stripDiacritics(s: string): { stripped: string; map: number[] } {
  let stripped = "";
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (DIACRITIC_RE.test(s[i])) continue;
    stripped += s[i];
    map.push(i);
  }
  return { stripped, map };
}

// Translates a [start, end) span found in stripped-string space back to the
// corresponding span in the ORIGINAL string, for slicing evidence quotes.
// Necessary because stripping deletes characters, so a regex offset found in
// `stripped` no longer lines up with the same position once any diacritic has
// appeared earlier in the document. Confirmed in the wild: without this, one
// report entry quoted an unrelated OCR-methodology note instead of the actual
// legal clause that matched, because the offsets had drifted.
function toOriginalSpan(map: number[], start: number, end: number, originalLength: number): [number, number] {
  const origStart = start < map.length ? map[start] : originalLength;
  const origEnd = end > 0 && end - 1 < map.length ? map[end - 1] + 1 : originalLength;
  return [origStart, origEnd];
}

function normalizeDigits(str: string): string {
  const map: Record<string, string> = {
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
    "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  };
  return str.replace(/[٠-٩]/g, (d) => map[d] || d);
}

// Closed vocabulary of day-count words actually observed in the corpus
// (ب-153 investigation) plus close, cheap-to-cover neighbors. Matched against
// diacritic-stripped text. Longer phrases first so "مائة وثمانين" doesn't
// partially match on a bare "مائة" rule first.
const WORD_NUMBERS: Array<[string, number]> = [
  ["خمسمائة وأربعين", 540], ["خمسمئة وأربعين", 540],
  ["ثلاثمائة وخمسة وستين", 365], ["ثلاثمئة وخمسة وستين", 365],
  ["مائة وثمانين", 180], ["مئة وثمانين", 180],
  ["مائة وخمسين", 150], ["مئة وخمسين", 150],
  ["مائة وعشرين", 120], ["مئة وعشرين", 120],
  ["مائة وعشرة", 110], ["مئة وعشرة", 110],
  ["تسعين", 90],
  ["ثمانين", 80],
  ["سبعين", 70],
  ["ستين", 60],
  ["خمسة وأربعين", 45],
  ["خمسين", 50],
  ["أربعين", 40],
  ["ثلاثين", 30],
  ["خمسة عشر", 15],
  ["عشرين", 20],
  ["مائة", 100], ["مئة", 100],
];

type Unit = "day" | "month" | "year";

interface Candidate {
  quantity: number;
  unit: Unit;
  days: number; // calendar-precise day-equivalent shown in reports; NOT used for computation (addDuration is)
  windowText: string; // original (non-stripped) text, for the report
  offset: number;
  // A distinct, deterministic drafting idiom found during ك-04 verification:
  // "يعمل به ابتداءً من أول الشهر التالي لانقضاء N يوماً من تاريخ نشره" — NOT
  // "publication + N days", but "the 1st of the month AFTER that date lapses".
  // Confirmed exactly against two real cases (LAW-96-6208, LAW-06-0212): the
  // naive pub+N computation was flagged as a "mismatch" against the declared
  // date, but the declared date was actually CORRECT — applying this rounding
  // rule reproduces it exactly. This is a precise rule stated in the text
  // itself (ق-15 compliant: computed from explicit text, not guessed), not an
  // ambiguous case needing human disambiguation.
  roundToNextMonthStart: boolean;
}

// ك-04 detector refinement (2026-08-24, closure criteria from فيجيتا §3):
// (أ) unit-aware (day/month/year, not day-only) — a false positive (نظام
//     الأحوال المدنية) used "سنة" (one YEAR), invisible to a day-only scan.
// (ب)+(ج) a sanity cap per unit AND an explicit exclusion of "العدد رقم (N)"
//     (gazette issue number) — a false positive (VAT law) grabbed the gazette
//     issue number 4667 as if it were a day count, because "يوم" appeared
//     nearby as part of "يوم الجمعة" (Friday, a weekday name — not a
//     duration), not as part of a real effective-date clause.
const UNIT_PATTERNS: Array<{ re: RegExp; unit: Unit; maxQuantity: number }> = [
  { re: /يوم/g, unit: "day", maxQuantity: 730 },
  { re: /شهر|أشهر/g, unit: "month", maxQuantity: 24 },
  { re: /سنة|سنوات|سنين/g, unit: "year", maxQuantity: 5 },
];

const WEEKDAY_NAMES = /^\s*(الأحد|الاثنين|الإثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت)/;

// A candidate must have, within one WINDOW-char span of diacritic-stripped
// text: a verb root (عمل/نفاذ/سريان), a quantity+unit, and a self-referential
// publication anchor ("نشر"). All three, not just "N <unit>" anywhere.
const WINDOW = 90;
// (ج) local window for the NUMBER specifically — tight, so a parenthesized
// number 60+ chars away tied to unrelated context (e.g. a gazette issue
// number) can't be mistaken for the duration's own quantity.
const NUMBER_WINDOW = 25;

function findCandidates(originalBody: string): Candidate[] {
  // (د) historical <details> blocks (superseded article text) can independently
  // contain "N days after publication" language describing an OLD, now-replaced
  // provision — strip them before searching so only LIVE text is scanned.
  const live = stripDetails(originalBody);
  const { stripped, map } = stripDiacritics(live);
  const seen: Candidate[] = [];

  for (const { re, unit, maxQuantity } of UNIT_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      // (أ, weekday exclusion) "يوم الجمعة"/"يوم السبت"/... names a day of the
      // week, not a duration — skip it outright regardless of nearby numbers.
      if (unit === "day" && WEEKDAY_NAMES.test(stripped.slice(m.index + m[0].length, m.index + m[0].length + 20))) {
        continue;
      }

      const start = Math.max(0, m.index - WINDOW);
      const end = Math.min(stripped.length, m.index + WINDOW);
      const win = stripped.slice(start, end);

      const hasVerb = /عمل|نفاذ|سريان/.test(win);
      const hasPublicationAnchor = /نشر/.test(win);
      if (!hasVerb || !hasPublicationAnchor) continue;

      // Number: tight local window around the unit word itself (ج), preferring
      // Eastern-Indic/Western digits in parens; word table as fallback over the
      // same tight window, then the fuller window only for word-form numbers
      // (word-form has no "gazette number" false-positive risk — only bare
      // digit-in-parens does).
      const nStart = Math.max(0, m.index - NUMBER_WINDOW);
      const nEnd = Math.min(stripped.length, m.index + NUMBER_WINDOW);
      const nWin = stripped.slice(nStart, nEnd);

      let quantity: number | null = null;
      const digitMatch = nWin.match(/\(\s*([٠-٩0-9]+)\s*\)/);
      if (digitMatch) {
        const precedingText = nWin.slice(0, digitMatch.index).trimEnd();
        const isGazetteIssueNumber = /(?:العدد|رقم)\s*$/.test(precedingText) && !/(?:يوم|أيام|أشهر|شهر|سنة|سنوات|سنين)\s*$/.test(precedingText);
        if (!isGazetteIssueNumber) {
          const n = parseInt(normalizeDigits(digitMatch[1]), 10);
          if (!Number.isNaN(n) && n > 0) quantity = n;
        }
      }
      if (quantity == null) {
        for (const [word, val] of WORD_NUMBERS) {
          if (win.includes(word)) { quantity = val; break; }
        }
      }
      if (quantity == null) continue;
      // (ب) sanity cap — reject implausible quantities outright rather than
      // reporting them as a "conflict" (e.g. a gazette issue number that slips
      // past the exclusion above some other way).
      if (quantity > maxQuantity) continue;

      // Dedup: collapse candidates whose match-index falls within WINDOW of an
      // already-recorded one (same clause matched via more than one unit word,
      // or the same word twice).
      const dup = seen.find((c) => Math.abs(c.offset - m!.index) < WINDOW);
      if (dup) continue;

      const [origStart, origEnd] = toOriginalSpan(map, start, end, live.length);
      seen.push({
        quantity,
        unit,
        days: unit === "day" ? quantity : unit === "month" ? quantity * 30 : quantity * 365,
        offset: m.index,
        windowText: live.slice(origStart, origEnd).replace(/\s+/g, " ").trim(),
        roundToNextMonthStart: /أول\s+الشهر\s+التالي/.test(win),
      });
    }
  }
  return seen.sort((a, b) => a.offset - b.offset);
}

// Detects an explicit "effective immediately on publication" clause (verb +
// نشر anchor, but no duration quantity) — NOT a gap, just no delay to compute.
function hasImmediateEffectClause(originalBody: string): boolean {
  const live = stripDetails(originalBody);
  const { stripped } = stripDiacritics(live);
  const re = /(عمل|نفاذ|سريان)[^.\n]{0,60}نشر|نشر[^.\n]{0,60}(عمل|نفاذ|سريان)/;
  const m = re.exec(stripped);
  if (!m) return false;
  const start = Math.max(0, m.index - WINDOW);
  const end = Math.min(stripped.length, m.index + WINDOW);
  return !/يوم|شهر|أشهر|سنة|سنوات|سنين/.test(stripped.slice(start, end));
}

// Calendar-precise duration add (NOT a day-count approximation for
// month/year — uses actual calendar arithmetic so a 1-year clause lands on
// the correct anniversary date regardless of leap years).
// Some frontmatter records a Gregorian date as "2001/06/24" instead of the
// canonical "2001-06-24" — the same calendar date, but a raw string compare
// against a computed ISO date would wrongly report it as a conflict.
function canonicalIsoDate(s: string): string {
  return s.trim().replace(/\//g, "-");
}

function addDuration(iso: string, quantity: number, unit: Unit, roundToNextMonthStart = false): string | null {
  const d = new Date(canonicalIsoDate(iso) + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  if (unit === "day") d.setUTCDate(d.getUTCDate() + quantity);
  else if (unit === "month") d.setUTCMonth(d.getUTCMonth() + quantity);
  else d.setUTCFullYear(d.getUTCFullYear() + quantity);
  if (roundToNextMonthStart) {
    // "the 1st of the month FOLLOWING the lapse of N <unit>" — advance to the
    // 1st of the next calendar month after the plain pub+N date (even when
    // pub+N already lands exactly on the 1st, the clause's own wording is
    // "التالي لانقضاء" — the month AFTER the lapse — so it always advances).
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────
// Main scan
// ─────────────────────────────────────────────────────────────────────────

interface FileResult {
  file: string;
  id: string;
  title: string;
  publication_date_gregorian: string | null;
  effective_date_gregorian: string | null;
  effective_date_hijri: string | null;
  candidates: Candidate[];
  computed_effective_date_gregorian: string | null;
  verdict:
    | "match"
    | "mismatch"
    | "fillable_gap"
    | "cannot_verify_hijri_only"
    | "multiple_candidates"
    | "immediate_effect"
    | "declared_unverified"
    | "no_candidate_no_declaration";
}

const files = applyExclusions(walk(root)).kept;

const results: FileResult[] = [];
let scanned = 0;
let skippedNonLaw = 0;

for (const f of files) {
  let raw: string;
  try {
    raw = fs.readFileSync(L(f), "utf-8");
  } catch {
    continue;
  }
  raw = raw.replace(/\r\n/g, "\n");

  const { meta: rawMeta, body } = parseFrontmatter(raw, f);
  const meta = filterMeta(rawMeta);
  const id = String(meta.id || "");
  if (!/^LAW-/.test(id)) { skippedNonLaw++; continue; }
  scanned++;

  const pubGreg = nullIfForbidden(meta.publication_date_gregorian);
  const effGreg = nullIfForbidden(meta.effective_date_gregorian);
  const effHijri = nullIfForbidden(meta.effective_date_hijri);
  const title = String(meta.title || path.basename(f));

  const candidates = findCandidates(body);

  let computed: string | null = null;
  let verdict: FileResult["verdict"];

  if (candidates.length > 1) {
    verdict = "multiple_candidates";
  } else if (candidates.length === 1) {
    if (pubGreg) {
      computed = addDuration(pubGreg, candidates[0].quantity, candidates[0].unit, candidates[0].roundToNextMonthStart);
    }
    if (computed == null) {
      verdict = "cannot_verify_hijri_only";
    } else if (effGreg) {
      verdict = computed === canonicalIsoDate(effGreg) ? "match" : "mismatch";
    } else {
      verdict = "fillable_gap";
    }
  } else {
    // 0 candidates — (هـ) split from "match": nothing was actually computed
    // and checked here, so a pre-existing declaration is "unverified", not a
    // verified "match". "match" is reserved strictly for candidates.length===1
    // with computed === declared (genuinely checked and confirmed correct).
    if (effGreg || effHijri) {
      verdict = "declared_unverified";
    } else if (hasImmediateEffectClause(body)) {
      verdict = "immediate_effect";
    } else {
      verdict = "no_candidate_no_declaration";
    }
  }

  results.push({
    file: f,
    id,
    title,
    publication_date_gregorian: pubGreg,
    effective_date_gregorian: effGreg,
    effective_date_hijri: effHijri,
    candidates,
    computed_effective_date_gregorian: computed,
    verdict,
  });
}

// Superseding-instrument candidates: corpus-wide title/filename scan, listed
// separately, never auto-linked to the law they might modify (ق-15: flag,
// don't guess).
const supersedingCandidates = results.filter((r) =>
  /تأجيل\s+نفاذ|تمديد.*نفاذ|إرجاء\s+نفاذ/.test(r.title) ||
  /تأجيل_نفاذ|تمديد.*نفاذ/.test(path.basename(r.file))
);

const byVerdict: Record<string, FileResult[]> = {};
for (const r of results) (byVerdict[r.verdict] ??= []).push(r);

const count = (v: string) => (byVerdict[v] || []).length;

console.log(`\n${"═".repeat(70)}`);
console.log("  ك-04 — Effective-date drift report (read-only, no auto-fix)");
console.log(`${"═".repeat(70)}\n`);
console.log(`  files scanned (id: LAW-*)          ${String(scanned).padStart(6)}`);
console.log(`  non-LAW files skipped               ${String(skippedNonLaw).padStart(6)}`);
console.log(`\n  ── verdicts ──`);
console.log(`  ✅ match (1 candidate, computed == declared) ${String(count("match")).padStart(6)}  ← genuinely verified`);
console.log(`  🔴 mismatch (computed != declared)   ${String(count("mismatch")).padStart(6)}  ← real conflicts, review first`);
console.log(`  fillable gap (declared null, computable) ${String(count("fillable_gap")).padStart(6)}`);
console.log(`  cannot verify (Hijri-only, no Gregorian anchor) ${String(count("cannot_verify_hijri_only")).padStart(6)}`);
console.log(`  multiple candidates (needs disambiguation) ${String(count("multiple_candidates")).padStart(6)}`);
console.log(`  immediate effect (no delay stated)  ${String(count("immediate_effect")).padStart(6)}`);
console.log(`  declared, unverified (0 candidates, has a value already) ${String(count("declared_unverified")).padStart(6)}`);
console.log(`  no candidate + no declaration        ${String(count("no_candidate_no_declaration")).padStart(6)}  ← true extraction gap`);
console.log(`\n  ⚠️  possible superseding instruments (title pattern, NOT auto-linked) ${supersedingCandidates.length}`);
for (const s of supersedingCandidates) {
  console.log(`     • ${path.basename(s.file)}`);
}

const reportPath = path.resolve(process.cwd(), "library-toolkit/output/effective-date-drift-report.json");
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(
  reportPath,
  JSON.stringify(
    {
      generated_at: "ك-04 report — see console run timestamp",
      scanned,
      skippedNonLaw,
      counts: Object.fromEntries(Object.keys(byVerdict).map((k) => [k, byVerdict[k].length])),
      supersedingCandidates: supersedingCandidates.map((s) => ({ file: s.file, id: s.id, title: s.title })),
      mismatches: (byVerdict["mismatch"] || []).map((r) => ({
        file: r.file, id: r.id, title: r.title,
        publication_date_gregorian: r.publication_date_gregorian,
        declared_effective_date_gregorian: r.effective_date_gregorian,
        computed_effective_date_gregorian: r.computed_effective_date_gregorian,
        evidence: r.candidates.map((c) => ({ quantity: c.quantity, unit: c.unit, days_equivalent: c.days, text: c.windowText })),
      })),
      fillableGaps: (byVerdict["fillable_gap"] || []).map((r) => ({
        file: r.file, id: r.id, title: r.title,
        publication_date_gregorian: r.publication_date_gregorian,
        computed_effective_date_gregorian: r.computed_effective_date_gregorian,
        evidence: r.candidates.map((c) => ({ quantity: c.quantity, unit: c.unit, days_equivalent: c.days, text: c.windowText })),
      })),
      multipleCandidates: (byVerdict["multiple_candidates"] || []).map((r) => ({
        file: r.file, id: r.id, title: r.title,
        candidates: r.candidates.map((c) => ({ quantity: c.quantity, unit: c.unit, days_equivalent: c.days, text: c.windowText })),
      })),
      cannotVerifyHijriOnly: (byVerdict["cannot_verify_hijri_only"] || []).map((r) => ({
        file: r.file, id: r.id, title: r.title,
        effective_date_hijri: r.effective_date_hijri,
        evidence: r.candidates.map((c) => ({ quantity: c.quantity, unit: c.unit, days_equivalent: c.days, text: c.windowText })),
      })),
      noCandidateNoDeclaration: (byVerdict["no_candidate_no_declaration"] || []).map((r) => ({
        file: r.file, id: r.id, title: r.title,
      })),
    },
    null,
    2,
  ),
  "utf-8",
);
console.log(`\n📄 Full report: ${reportPath}\n`);

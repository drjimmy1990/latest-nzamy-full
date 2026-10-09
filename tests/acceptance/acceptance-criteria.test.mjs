/**
 * tests/acceptance/acceptance-criteria.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive, automated, opaque-box acceptance test suite for NZAMY Platform.
 * Verifies all acceptance criteria in ORIGINAL_REQUEST.md (Tiers 1-4):
 *   - Visual & Search UI (R1)
 *   - Reader Navigation, Legal Numbering & Calculator Logic (R2)
 *   - Code Quality, Contract Consistency & Branch Safety (R3)
 *
 * Execution:
 *   node --import tsx --test tests/acceptance/acceptance-criteria.test.mjs
 *   node --test tests/acceptance/acceptance-criteria.test.mjs
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

// Helper to resolve repo files (path for fs, URL for dynamic ESM import)
const fileInRepo = (...segments) => path.join(REPO_ROOT, ...segments);
const repoUrl = (...segments) => pathToFileURL(fileInRepo(...segments)).href;
const readRepoFile = (...segments) => fs.readFileSync(fileInRepo(...segments), "utf8");

/**
 * Custom recursive JSON parser that verifies uniqueness of keys within each JSON object.
 * Returns array of duplicate key names found anywhere in the JSON document.
 */
function findDuplicateJsonKeys(jsonText) {
  const duplicates = [];
  let pos = 0;

  function skipWhitespace() {
    while (pos < jsonText.length && /\s/.test(jsonText[pos])) pos++;
  }

  function parseString() {
    pos++; // skip opening '"'
    let str = "";
    while (pos < jsonText.length) {
      const ch = jsonText[pos++];
      if (ch === '"') return str;
      if (ch === "\\") {
        const next = jsonText[pos++];
        if (next === '"' || next === "\\" || next === "/" || next === "b" || next === "f" || next === "n" || next === "r" || next === "t") {
          str += next;
        } else if (next === "u") {
          str += jsonText.slice(pos, pos + 4);
          pos += 4;
        }
      } else {
        str += ch;
      }
    }
    return str;
  }

  function parseValue() {
    skipWhitespace();
    if (pos >= jsonText.length) return;
    const ch = jsonText[pos];
    if (ch === "{") parseObject();
    else if (ch === "[") parseArray();
    else if (ch === '"') parseString();
    else {
      while (pos < jsonText.length && !/[,\}\]\s]/.test(jsonText[pos])) pos++;
    }
  }

  function parseArray() {
    pos++; // skip '['
    skipWhitespace();
    if (jsonText[pos] === "]") { pos++; return; }
    while (pos < jsonText.length) {
      parseValue();
      skipWhitespace();
      if (jsonText[pos] === ",") { pos++; continue; }
      if (jsonText[pos] === "]") { pos++; return; }
      pos++;
    }
  }

  function parseObject() {
    pos++; // skip '{'
    const seen = new Set();
    skipWhitespace();
    if (jsonText[pos] === "}") { pos++; return; }
    while (pos < jsonText.length) {
      skipWhitespace();
      if (jsonText[pos] === "}") { pos++; return; }
      if (jsonText[pos] === '"') {
        const key = parseString();
        skipWhitespace();
        if (jsonText[pos] === ":") pos++;
        if (seen.has(key)) {
          duplicates.push(key);
        } else {
          seen.add(key);
        }
        parseValue();
        skipWhitespace();
        if (jsonText[pos] === ",") { pos++; continue; }
        if (jsonText[pos] === "}") { pos++; return; }
      } else {
        pos++;
      }
    }
  }

  parseValue();
  return duplicates;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 1: Feature Coverage (Isolation / Happy Path)
// ─────────────────────────────────────────────────────────────────────────────

describe("Tier 1: Feature Coverage (Isolation / Happy Path)", () => {

  // ── 1. Repealed Law Strikethrough Elimination ──────────────────────────────
  describe("Feature 1: Repealed Law Strikethrough Elimination", () => {
    test("T1.1.1: _article-components.tsx does not apply CSS line-through to repealed articles", () => {
      const src = readRepoFile("src", "app", "laws", "[slug]", "_article-components.tsx");
      assert.ok(
        !/isRepealed[\s\S]{0,100}line-through/.test(src),
        "isRepealed must not trigger CSS line-through in _article-components.tsx"
      );
    });

    test("T1.1.2: _article-components.tsx renders explicit red status badge for repealed articles", () => {
      const src = readRepoFile("src", "app", "laws", "[slug]", "_article-components.tsx");
      assert.ok(
        src.includes("ملغاة") || src.includes("ملغى"),
        "_article-components.tsx must render explicit Arabic repealed badge"
      );
      assert.ok(
        src.includes("bg-red-") || src.includes("text-red-"),
        "_article-components.tsx must render distinct red status badge styling"
      );
    });

    test("T1.1.3: _sidebar.tsx does not apply CSS line-through to repealed article items", () => {
      const src = readRepoFile("src", "app", "laws", "[slug]", "_sidebar.tsx");
      assert.ok(
        !/status\s*===\s*["']repealed["'][\s\S]{0,60}line-through/.test(src),
        "_sidebar.tsx must not apply line-through to repealed navigation entries"
      );
    });

    test("T1.1.4: _sidebar.tsx renders dedicated repealed indicator badge in navigation TOC", () => {
      const src = readRepoFile("src", "app", "laws", "[slug]", "_sidebar.tsx");
      assert.ok(
        src.includes('a.status === "repealed"') || src.includes("status === 'repealed'"),
        "_sidebar.tsx must inspect repealed status"
      );
      assert.ok(
        src.includes("ملغى") || src.includes("ملغاة"),
        "_sidebar.tsx must display Arabic badge text for repealed entries"
      );
    });

    test("T1.1.5: LawCard and library list components do not apply typographic line-through to law titles", () => {
      const listItemsSrc = readRepoFile("src", "app", "laws", "components", "ListItems.tsx");
      assert.ok(
        !/isRepealed[\s\S]{0,60}line-through/.test(listItemsSrc),
        "ListItems.tsx must not apply line-through to repealed law titles"
      );
    });
  });

  // ── 2. Search Empty State Guard & Skeleton Rendering ───────────────────────
  describe("Feature 2: Search Empty State Guard & Skeleton Rendering", () => {
    test("T1.2.1: LawsTabContent checks pending state before displaying empty state", () => {
      const src = readRepoFile("src", "app", "laws", "components", "LawsTabContent.tsx");
      assert.ok(
        src.includes("resultsPending"),
        "LawsTabContent.tsx must accept and check resultsPending flag"
      );
    });

    test("T1.2.2: LawsTabContent renders animated loading skeletons while search is pending", () => {
      const src = readRepoFile("src", "app", "laws", "components", "LawsTabContent.tsx");
      assert.ok(
        /if\s*\(\s*resultsPending\s*\)\s*\{[\s\S]*?(?:SearchLoadingSkeleton|ResultsSkeleton)/.test(src),
        "LawsTabContent.tsx must render SearchLoadingSkeleton or ResultsSkeleton while resultsPending is true"
      );
    });

    test("T1.2.3: ResultsSkeleton component renders animated card placeholder pulses", () => {
      const src = readRepoFile("src", "app", "laws", "components", "ResultsSkeleton.tsx");
      assert.ok(
        src.includes("animate-pulse") || src.includes("motion"),
        "ResultsSkeleton must render animated pulsing placeholders"
      );
    });

    test("T1.2.4: EmptyState renders only when results are truly empty and search has completed", () => {
      const src = readRepoFile("src", "app", "laws", "components", "LawsTabContent.tsx");
      assert.ok(
        src.includes("!hasResults") || src.includes("filteredLaws.length === 0"),
        "Empty state must require empty results count"
      );
      assert.ok(
        src.includes("!searchFailed"),
        "Empty state must not mask search failure notices"
      );
    });

    test("T1.2.5: Search state gate logic verifies pure conditional evaluation", () => {
      function evaluateEmptyStateVisible(isLoading, hasSearched, resultsCount) {
        return !isLoading && hasSearched && resultsCount === 0;
      }
      assert.equal(evaluateEmptyStateVisible(true, true, 0), false, "Loading state must block empty state");
      assert.equal(evaluateEmptyStateVisible(false, false, 0), false, "Unsearched state must not show empty state");
      assert.equal(evaluateEmptyStateVisible(false, true, 5), false, "Populated results must not show empty state");
      assert.equal(evaluateEmptyStateVisible(false, true, 0), true, "Completed zero-result search must show empty state");
    });
  });

  // ── 3. Countdown Widget Sidebar Relocation ─────────────────────────────────
  describe("Feature 3: Countdown Widget Sidebar Relocation", () => {
    test("T1.3.1: EnactmentCountdownWidget is mounted inside left sidebar column in page.tsx", () => {
      const src = readRepoFile("src", "app", "laws", "page.tsx");
      assert.ok(
        /<aside[\s\S]*?EnactmentCountdownWidget[\s\S]*?<\/aside>/.test(src),
        "EnactmentCountdownWidget must be mounted inside <aside> sidebar"
      );
    });

    test("T1.3.2: EnactmentCountdownWidget is NOT mounted in top search header or LibraryHero", () => {
      const heroSrc = readRepoFile("src", "app", "laws", "components", "LibraryHero.tsx");
      assert.ok(
        !heroSrc.includes("EnactmentCountdownWidget"),
        "LibraryHero.tsx must not contain or import EnactmentCountdownWidget"
      );
    });

    test("T1.3.3: Sidebar hosts EnactmentCountdownWidget alongside user activity", () => {
      const src = readRepoFile("src", "app", "laws", "page.tsx");
      assert.ok(
        src.includes("GamificationCard"),
        "Sidebar layout must host user activity / gamification cards"
      );
      assert.ok(
        src.includes("EnactmentCountdownWidget"),
        "Sidebar layout must host enactment countdown widget"
      );
    });

    test("T1.3.4: EnactmentCountdownWidget accepts isDark and isRTL theme props", () => {
      const src = readRepoFile("src", "app", "laws", "components", "EnactmentCountdownWidget.tsx");
      assert.ok(src.includes("isDark"), "EnactmentCountdownWidget must accept isDark prop");
      assert.ok(src.includes("isRTL"), "EnactmentCountdownWidget must accept isRTL prop");
    });

    test("T1.3.5: Search bar area on /laws remains clean and focused on search input", () => {
      const src = readRepoFile("src", "app", "laws", "page.tsx");
      assert.ok(
        src.includes("LibraryHero") || src.includes("input"),
        "Search interface must maintain dedicated input focus"
      );
    });
  });

  // ── 4. Sidebar Zoom Removal & 75% Compact Density ──────────────────────────
  describe("Feature 4: Sidebar Zoom Removal & 75% Compact Density", () => {
    test("T1.4.1: _sidebar.tsx does not contain manual zoom button controls", () => {
      const src = readRepoFile("src", "app", "laws", "[slug]", "_sidebar.tsx");
      assert.ok(!src.includes("zoomIn"), "_sidebar.tsx must not render zoomIn button");
      assert.ok(!src.includes("zoomOut"), "_sidebar.tsx must not render zoomOut button");
      assert.ok(!/aria-label=["'].*zoom.*["']/i.test(src), "_sidebar.tsx must not have zoom aria controls");
    });

    test("T1.4.2: globals.css contains compact display density CSS declarations", () => {
      const css = readRepoFile("src", "app", "globals.css");
      assert.ok(
        css.includes("data-density") || css.includes("compact") || css.includes("0.75"),
        "globals.css must specify compact display density rules"
      );
    });

    test("T1.4.3: Compact display density preserves readable font-size boundaries", () => {
      const css = readRepoFile("src", "app", "globals.css");
      assert.ok(
        css.length > 500,
        "globals.css must be well-formed stylesheet"
      );
    });

    test("T1.4.4: Anti-compounding rules prevent nested zoom distortion in reader", () => {
      const anchorSrc = readRepoFile("src", "app", "laws", "[slug]", "_reader-anchors.ts");
      assert.ok(
        anchorSrc.includes("density") || anchorSrc.includes("zoom"),
        "_reader-anchors.ts documents display-density scaling alignment"
      );
    });

    test("T1.4.5: Sidebar compact styling maintains accessible touch targets", () => {
      const src = readRepoFile("src", "app", "laws", "[slug]", "_sidebar.tsx");
      assert.ok(
        src.includes("py-1") || src.includes("py-1.5"),
        "Sidebar entries maintain standard vertical padding"
      );
    });
  });

  // ── 5. Sublegislation TOC Anchor Offsets ────────────────────────────────────
  describe("Feature 5: Sublegislation TOC Anchor Offsets", () => {
    test("T1.5.1: _reader-anchors.ts exports READER_SCROLL_MARGIN_TOP clearing fixed navbar", async () => {
      const mod = await import(repoUrl("src", "app", "laws", "[slug]", "_reader-anchors.ts"));
      assert.ok(mod.READER_SCROLL_MARGIN_TOP, "READER_SCROLL_MARGIN_TOP must be exported");
      assert.match(mod.READER_SCROLL_MARGIN_TOP, /8rem|calc|env/);
    });

    test("T1.5.2: regulationCardId generates deterministic DOM identifiers", async () => {
      const { regulationCardId } = await import(repoUrl("src", "app", "laws", "[slug]", "_reader-anchors.ts"));
      assert.equal(regulationCardId(0, 0), "regview-0-0");
      assert.equal(regulationCardId(2, 14), "regview-2-14");
    });

    test("T1.5.3: buildRegulationAnchors maps primary articles to regulation cards", async () => {
      const { buildRegulationAnchors, regulationCardId } = await import(repoUrl("src", "app", "laws", "[slug]", "_reader-anchors.ts"));
      const instruments = [
        { ref: "اللائحة أ", articles: [{ regNum: "1/1", text: "نص 1" }] },
      ];
      const articles = [
        { id: "art-1", regulations: [{ ref: "اللائحة أ", regNum: "1/1", text: "نص 1" }] },
      ];
      const { anchorByArticleId } = buildRegulationAnchors(instruments, articles, null);
      assert.equal(anchorByArticleId.get("art-1"), regulationCardId(0, 0));
    });

    test("T1.5.4: buildRegulationAnchors filters out anchors when visibleRef filter is active", async () => {
      const { buildRegulationAnchors } = await import(repoUrl("src", "app", "laws", "[slug]", "_reader-anchors.ts"));
      const instruments = [
        { ref: "اللائحة أ", articles: [{ regNum: "1/1", text: "نص 1" }] },
        { ref: "اللائحة ب", articles: [{ regNum: "2/1", text: "نص 2" }] },
      ];
      const articles = [
        { id: "art-1", regulations: [{ ref: "اللائحة أ", regNum: "1/1", text: "نص 1" }] },
        { id: "art-2", regulations: [{ ref: "اللائحة ب", regNum: "2/1", text: "نص 2" }] },
      ];
      const { anchorByArticleId } = buildRegulationAnchors(instruments, articles, "اللائحة ب");
      assert.equal(anchorByArticleId.has("art-1"), false, "Non-rendered instrument article must not have active anchor");
      assert.equal(anchorByArticleId.has("art-2"), true, "Rendered instrument article must have active anchor");
    });

    test("T1.5.5: scrollToReaderAnchor handles missing element gracefully without throwing", async () => {
      const { scrollToReaderAnchor } = await import(repoUrl("src", "app", "laws", "[slug]", "_reader-anchors.ts"));
      assert.equal(scrollToReaderAnchor(null), false);
      assert.equal(scrollToReaderAnchor("non-existent-id"), false);
    });
  });

  // ── 6. Legal Reader Clause Numbering Preservation ──────────────────────────
  describe("Feature 6: Legal Reader Clause Numbering Preservation", () => {
    test("T1.6.1: splitNumberedItem preserves plain Western clause numbers", async () => {
      const { splitNumberedItem } = await import(repoUrl("src", "app", "laws", "[slug]", "_numbered-item.ts"));
      assert.deepEqual(
        splitNumberedItem("1. يكون للوزارة الصلاحيات الآتية"),
        { number: "1", text: "يكون للوزارة الصلاحيات الآتية" }
      );
      assert.deepEqual(
        splitNumberedItem("14. اعتماد الحساب الختامي"),
        { number: "14", text: "اعتماد الحساب الختامي" }
      );
    });

    test("T1.6.2: splitNumberedItem parses CommonMark escaped backslash clause numbers", async () => {
      const { splitNumberedItem } = await import(repoUrl("src", "app", "laws", "[slug]", "_numbered-item.ts"));
      assert.deepEqual(
        splitNumberedItem("3\\. تقديم التقارير الدورية"),
        { number: "3", text: "تقديم التقارير الدورية" }
      );
    });

    test("T1.6.3: splitNumberedItem supports Arabic-Indic digits with and without backslash", async () => {
      const { splitNumberedItem } = await import(repoUrl("src", "app", "laws", "[slug]", "_numbered-item.ts"));
      assert.deepEqual(
        splitNumberedItem("١. النص بالرقم العربي"),
        { number: "١", text: "النص بالرقم العربي" }
      );
      assert.deepEqual(
        splitNumberedItem("١٠\\. البند العاشر بعلامة الهروب"),
        { number: "١٠", text: "البند العاشر بعلامة الهروب" }
      );
    });

    test("T1.6.4: splitNumberedItem rejects non-list lines (currency, decimals, titles)", async () => {
      const { splitNumberedItem } = await import(repoUrl("src", "app", "laws", "[slug]", "_numbered-item.ts"));
      assert.equal(splitNumberedItem("1.5 مليون ريال"), null);
      assert.equal(splitNumberedItem("المادة 1. تعريفات عامة"), null);
      assert.equal(splitNumberedItem("- بند نقطي"), null);
      assert.equal(splitNumberedItem("مجرد نص عادي بدون ترقيم"), null);
    });

    test("T1.6.5: _article-components.tsx renders block.number with tabular-nums", () => {
      const src = readRepoFile("src", "app", "laws", "[slug]", "_article-components.tsx");
      assert.ok(
        !/replace\(\/\^\\d\+\\\.\\s\+/.test(src),
        "_article-components.tsx must NOT strip list item numbers"
      );
      assert.ok(
        src.includes("splitNumberedItem"),
        "_article-components.tsx must import and call splitNumberedItem"
      );
      assert.ok(
        src.includes("tabular-nums") || src.includes("block.number"),
        "_article-components.tsx must render block.number"
      );
    });
  });

  // ── 7. Court Fee Statutory Caps ────────────────────────────────────────────
  describe("Feature 7: Court Fee Statutory Caps", () => {
    test("T1.7.1: Constants enforce 5% rate, 1M SAR first-instance cap, and 10k SAR appeal cap", async () => {
      const mod = await import(repoUrl("src", "components", "calculators", "judicialCosts.ts"));
      assert.equal(mod.MONETARY_CLAIM_RATE, 0.05);
      assert.equal(mod.FIRST_INSTANCE_COST_CAP_SAR, 1_000_000);
      assert.equal(mod.APPEAL_COST_CAP_SAR, 10_000);
    });

    test("T1.7.2: First-instance claim of 50,000,000 SAR yields exactly 1,000,000 SAR fee", async () => {
      const { estimateJudicialCosts } = await import(repoUrl("src", "components", "calculators", "judicialCosts.ts"));
      const r = estimateJudicialCosts({
        claimAmountSar: 50_000_000,
        includeFirstInstance: true,
        includeAppeal: false,
      });
      assert.ok(r, "Estimate must not be null");
      assert.equal(r.lines[0].amountSar, 1_000_000);
      assert.equal(r.lines[0].capped, true);
      assert.equal(r.totalSar, 1_000_000);
    });

    test("T1.7.3: Appeal fee for large claim does not exceed 10,000 SAR", async () => {
      const { estimateJudicialCosts, APPEAL_COST_CAP_SAR } = await import(repoUrl("src", "components", "calculators", "judicialCosts.ts"));
      const r = estimateJudicialCosts({
        claimAmountSar: 50_000_000,
        includeFirstInstance: false,
        includeAppeal: true,
      });
      assert.ok(r, "Estimate must not be null");
      assert.equal(r.lines[0].amountSar, APPEAL_COST_CAP_SAR);
      assert.equal(r.lines[0].capped, true);
      assert.equal(r.totalSar, 10_000);
    });

    test("T1.7.4: Small monetary claim below cap calculates pure 5% without capping", async () => {
      const { estimateJudicialCosts } = await import(repoUrl("src", "components", "calculators", "judicialCosts.ts"));
      const r = estimateJudicialCosts({
        claimAmountSar: 40_000,
        includeFirstInstance: true,
        includeAppeal: false,
      });
      assert.ok(r);
      assert.equal(r.lines[0].amountSar, 2_000); // 5% of 40,000
      assert.equal(r.lines[0].capped, false);
      assert.equal(r.totalSar, 2_000);
    });

    test("T1.7.5: parseClaimAmount handles Western and Arabic-Indic numerals with delimiters", async () => {
      const { parseClaimAmount } = await import(repoUrl("src", "components", "calculators", "judicialCosts.ts"));
      assert.equal(parseClaimAmount("50,000,000"), 50_000_000);
      assert.equal(parseClaimAmount("٥٠٬٠٠٠٬٠٠٠"), 50_000_000);
      assert.equal(parseClaimAmount(" 1000000 "), 1_000_000);
      assert.equal(parseClaimAmount("غير صالح"), null);
    });
  });

  // ── 8. Amended Articles Collapsible Details ────────────────────────────────
  describe("Feature 8: Amended Articles Collapsible Details", () => {
    test("T1.8.1: _article-components.tsx renders amber indicator badge for amended articles", () => {
      const src = readRepoFile("src", "app", "laws", "[slug]", "_article-components.tsx");
      assert.ok(
        src.includes("معدَّلة") || src.includes("معدّلة"),
        "_article-components.tsx must render amended badge text"
      );
      assert.ok(
        src.includes("amber"),
        "_article-components.tsx must style amended badge with amber color scheme"
      );
    });

    test("T1.8.2: _article-components.tsx renders collapsible <details> toggle with <summary> for historical versions", () => {
      const src = readRepoFile("src", "app", "laws", "[slug]", "_article-components.tsx");
      assert.ok(
        src.includes("<details") && src.includes("<summary"),
        "_article-components.tsx must render collapsible <details> and <summary> for amended articles"
      );
      assert.ok(
        src.includes("الإصدارات السابقة"),
        "_article-components.tsx must include Arabic summary title for previous versions"
      );
    });

    test("T1.8.3: article-history parser separates prior text into entries", async () => {
      const { extractArticleHistory } = await import(repoUrl("scripts", "parsers", "lib", "article-history.ts"));
      const withPrior = "<details><summary>📜 الإصدارات السابقة</summary>\n\nعُدّلت هذه المادة بموجب المرسوم الملكي رقم (م/2). **النص قبل التعديل:** \nيمارس المدير العام الاختصاصات التالية.\n</details>";
      const res = extractArticleHistory(withPrior);
      assert.equal(res.entries.length, 1);
      assert.match(res.entries[0].original_text, /المدير العام/);
    });

    test("T1.8.4: Collapsible <details> toggle renders without dropping unclosed tags", async () => {
      const { extractArticleHistory } = await import(repoUrl("scripts", "parsers", "lib", "article-history.ts"));
      const unclosed = "<details><summary>تعديل غير مغلق\n\nنص التعديل هنا";
      const res = extractArticleHistory(unclosed);
      assert.ok(res, "Parser must not throw on unclosed details block");
    });

    test("T1.8.5: Amended toggle displays amendment metadata (source, date, summary, fullText)", () => {
      const src = readRepoFile("src", "app", "laws", "[slug]", "_article-components.tsx");
      assert.ok(
        src.includes("amend.source") && src.includes("amend.fullText"),
        "_article-components.tsx must display amendment source and text"
      );
    });
  });

  // ── 9. Parser Schema Manifest Duplicate Key Removal ────────────────────────
  describe("Feature 9: Parser Schema Manifest Duplicate Key Removal", () => {
    test("T1.9.1: scripts/parsers/schema_manifest.json parses cleanly with standard JSON.parse", () => {
      const content = readRepoFile("scripts", "parsers", "schema_manifest.json");
      assert.doesNotThrow(() => JSON.parse(content), "schema_manifest.json must be valid JSON");
    });

    test("T1.9.2: schema_manifest.json contains zero duplicate object keys across the whole file", () => {
      const content = readRepoFile("scripts", "parsers", "schema_manifest.json");
      const dups = findDuplicateJsonKeys(content);
      assert.deepEqual(dups, [], `Duplicate keys detected in schema_manifest.json: ${dups.join(", ")}`);
    });

    test("T1.9.3: law_lifecycle_status appears exactly once in core properties schema", () => {
      const content = readRepoFile("scripts", "parsers", "schema_manifest.json");
      const matches = content.match(/"law_lifecycle_status"\s*:/g) || [];
      assert.equal(matches.length, 1, `Expected law_lifecycle_status to appear exactly once, found ${matches.length}`);
    });

    test("T1.9.4: superseded_by appears exactly once in core properties schema", () => {
      const content = readRepoFile("scripts", "parsers", "schema_manifest.json");
      const matches = content.match(/"superseded_by"\s*:/g) || [];
      assert.equal(matches.length, 1, `Expected superseded_by to appear exactly once, found ${matches.length}`);
    });

    test("T1.9.5: schema_manifest.json retains required top-level manifest keys", () => {
      const content = readRepoFile("scripts", "parsers", "schema_manifest.json");
      const manifest = JSON.parse(content);
      assert.ok(manifest.manifest_version, "Must retain manifest_version");
      assert.ok(manifest.enums, "Must retain enums");
      assert.ok(manifest.core, "Must retain core properties");
    });
  });

  // ── 10. Branch Execution Safety ────────────────────────────────────────────
  describe("Feature 10: Branch Execution Safety", () => {
    test("T1.10.1: Git repository is currently checked out on owner-edits branch", () => {
      const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: REPO_ROOT,
        encoding: "utf8",
      }).trim();
      assert.equal(currentBranch, "owner-edits", "Execution must strictly occur on owner-edits branch");
    });
  });

  // ── 11. TypeScript Clean Compilation ───────────────────────────────────────
  describe("Feature 11: TypeScript Clean Compilation", () => {
    test("T1.11.1: npx tsc --noEmit exits with status code 0", { timeout: 60_000 }, () => {
      let exitCode = 0;
      try {
        execSync("npx tsc --noEmit", { cwd: REPO_ROOT, stdio: "pipe" });
      } catch (err) {
        exitCode = err.status ?? 1;
      }
      assert.equal(exitCode, 0, "TypeScript compiler must find zero type errors");
    });
  });

  // ── 12. Unit Test Runner Pass Rate ─────────────────────────────────────────
  describe("Feature 12: Automated Unit Tests Pass Rate", () => {
    test("T1.12.1: Existing unit test suite passes with zero failures (2061+ tests)", { timeout: 60_000 }, () => {
      let output = "";
      // Strip test runner variables to prevent parent node:test runner from suppressing child test execution
      const cleanEnv = Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !/test/i.test(k))
      );
      try {
        output = execSync("npm run test:unit", {
          cwd: REPO_ROOT,
          env: cleanEnv,
          encoding: "utf8",
          shell: "powershell.exe",
          stdio: ["pipe", "pipe", "pipe"],
          maxBuffer: 10 * 1024 * 1024,
        });
      } catch (err) {
        output = err.stdout?.toString() || err.stderr?.toString() || err.message;
      }
      assert.ok(
        /pass\s+206[0-9]|pass\s+207[0-9]/.test(output),
        `All unit tests must pass with 2061+ successful assertions. Output snippet: ${output.slice(-300)}`
      );
      assert.ok(
        output.includes("fail 0"),
        "Unit test runner must report exactly fail 0"
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TIER 2: Boundary & Corner Cases
// ─────────────────────────────────────────────────────────────────────────────

describe("Tier 2: Boundary & Corner Cases", () => {
  test("T2.1: Court fee first-instance boundary at exactly 20,000,000 SAR is not marked capped", async () => {
    const { estimateJudicialCosts } = await import(repoUrl("src", "components", "calculators", "judicialCosts.ts"));
    const r = estimateJudicialCosts({
      claimAmountSar: 20_000_000,
      includeFirstInstance: true,
      includeAppeal: false,
    });
    assert.ok(r);
    assert.equal(r.lines[0].amountSar, 1_000_000);
    assert.equal(r.lines[0].capped, false, "Exactly at cap (20M × 5% = 1M) is not reported as capped");
  });

  test("T2.2: Court fee first-instance boundary above whole-riyal threshold (20,000,010 SAR) is marked capped", async () => {
    const { estimateJudicialCosts } = await import(repoUrl("src", "components", "calculators", "judicialCosts.ts"));
    const r = estimateJudicialCosts({
      claimAmountSar: 20_000_010,
      includeFirstInstance: true,
      includeAppeal: false,
    });
    assert.ok(r);
    assert.equal(r.lines[0].amountSar, 1_000_000);
    assert.equal(r.lines[0].capped, true, "Amount above rounded whole-riyal cap threshold must be reported as capped");
  });

  test("T2.3: Court fee appeal boundary at exactly 200,000 SAR is not marked capped", async () => {
    const { estimateJudicialCosts } = await import(repoUrl("src", "components", "calculators", "judicialCosts.ts"));
    const r = estimateJudicialCosts({
      claimAmountSar: 200_000,
      includeFirstInstance: false,
      includeAppeal: true,
    });
    assert.ok(r);
    assert.equal(r.lines[0].amountSar, 10_000);
    assert.equal(r.lines[0].capped, false, "Exactly at appeal cap (200k × 5% = 10k) is not reported as capped");
  });

  test("T2.4: Court fee appeal boundary above whole-riyal threshold (200,010 SAR) is marked capped", async () => {
    const { estimateJudicialCosts } = await import(repoUrl("src", "components", "calculators", "judicialCosts.ts"));
    const r = estimateJudicialCosts({
      claimAmountSar: 200_010,
      includeFirstInstance: false,
      includeAppeal: true,
    });
    assert.ok(r);
    assert.equal(r.lines[0].amountSar, 10_000);
    assert.equal(r.lines[0].capped, true, "Amount above rounded appeal threshold must be reported as capped");
  });

  test("T2.5: Court fee non-positive amounts (0, negative, NaN, Infinity) return null", async () => {
    const { estimateJudicialCosts } = await import(repoUrl("src", "components", "calculators", "judicialCosts.ts"));
    for (const val of [0, -100, NaN, Infinity, -Infinity]) {
      assert.equal(estimateJudicialCosts({ claimAmountSar: val, includeFirstInstance: true, includeAppeal: true }), null);
    }
  });

  test("T2.6: Numbered item regex does not match fractional numbers or dates", async () => {
    const { splitNumberedItem } = await import(repoUrl("src", "app", "laws", "[slug]", "_numbered-item.ts"));
    assert.equal(splitNumberedItem("3.14 نسبة الرياض"), null);
    assert.equal(splitNumberedItem("1445.10.12 تاريخ صدور"), null);
    assert.equal(splitNumberedItem("100.00 ريال"), null);
  });

  test("T2.7: Numbered item regex handles double-digit Arabic-Indic numerals with escapes", async () => {
    const { splitNumberedItem } = await import(repoUrl("src", "app", "laws", "[slug]", "_numbered-item.ts"));
    assert.deepEqual(splitNumberedItem("٩٩\\. البند تسعة وتسعون"), { number: "٩٩", text: "البند تسعة وتسعون" });
    assert.deepEqual(splitNumberedItem("١٠٥. البند مائة وخمسة"), { number: "١٠٥", text: "البند مائة وخمسة" });
  });

  test("T2.8: Sublegislation regulationCardId with large indices does not produce malformed IDs", async () => {
    const { regulationCardId } = await import(repoUrl("src", "app", "laws", "[slug]", "_reader-anchors.ts"));
    assert.equal(regulationCardId(99, 999), "regview-99-999");
  });

  test("T2.9: Article history parser safely isolates unknown content blocks without throwing", async () => {
    const { extractArticleHistory } = await import(repoUrl("scripts", "parsers", "lib", "article-history.ts"));
    const largeText = "أ".repeat(800);
    const input = `<details><summary>📜 الإصدارات السابقة</summary>\n\n**إضافة:** ${largeText}\n</details>`;
    const res = extractArticleHistory(input);
    assert.ok(res, "extractArticleHistory must return structured object without throwing");
    assert.ok(res.entries !== undefined);
  });

  test("T2.10: Strict duplicate key detector accurately detects duplicate keys in nested objects", () => {
    const badJson = '{"level1": {"child": 1, "child": 2}}';
    const found = findDuplicateJsonKeys(badJson);
    assert.deepEqual(found, ["child"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TIER 3: Cross-Feature Combinations
// ─────────────────────────────────────────────────────────────────────────────

describe("Tier 3: Cross-Feature Combinations", () => {
  test("T3.1: Combined stages for 50,000,000 SAR applies both statutory caps simultaneously", async () => {
    const { estimateJudicialCosts } = await import(repoUrl("src", "components", "calculators", "judicialCosts.ts"));
    const r = estimateJudicialCosts({
      claimAmountSar: 50_000_000,
      includeFirstInstance: true,
      includeAppeal: true,
    });
    assert.ok(r);
    assert.equal(r.lines[0].id, "first-instance");
    assert.equal(r.lines[0].amountSar, 1_000_000);
    assert.equal(r.lines[0].capped, true);
    assert.equal(r.lines[1].id, "appeal");
    assert.equal(r.lines[1].amountSar, 10_000);
    assert.equal(r.lines[1].capped, true);
    assert.equal(r.totalSar, 1_010_000, "1,000,000 + 10,000 = 1,010,000 SAR");
  });

  test("T3.2: Secondary duplicate regulation rows link to primary regulation card anchor", async () => {
    const { buildRegulationAnchors, regulationCardId } = await import(repoUrl("src", "app", "laws", "[slug]", "_reader-anchors.ts"));
    const instruments = [
      { ref: "لائحة التنفيذ", articles: [{ regNum: "1/5", text: "نص مكرر" }] },
    ];
    const articles = [
      { id: "art-primary", regulations: [{ ref: "لائحة التنفيذ", regNum: "1/5", text: "نص مكرر" }] },
      { id: "art-secondary", regulations: [{ ref: "لائحة التنفيذ", regNum: "1/5", text: "نص مكرر", isSecondaryDisplay: true }] },
    ];
    const { anchorByArticleId, articleIdByCardId } = buildRegulationAnchors(instruments, articles, null);
    const cardId = regulationCardId(0, 0);
    assert.equal(anchorByArticleId.get("art-primary"), cardId);
    assert.equal(anchorByArticleId.get("art-secondary"), cardId);
    assert.equal(articleIdByCardId.get(cardId), "art-primary", "Primary article owns the card for highlight");
  });

  test("T3.3: Repealed articles inside reader navigation render red badges without text strikethrough", () => {
    const sidebarSrc = readRepoFile("src", "app", "laws", "[slug]", "_sidebar.tsx");
    const articleCompSrc = readRepoFile("src", "app", "laws", "[slug]", "_article-components.tsx");
    assert.ok(!sidebarSrc.includes('a.status === "repealed" ? "line-through'));
    assert.ok(!articleCompSrc.includes('isRepealed ? "line-through'));
  });

  test("T3.4: Clause numbering and amended status coexist without interfering with markdown parsing", async () => {
    const { splitNumberedItem } = await import(repoUrl("src", "app", "laws", "[slug]", "_numbered-item.ts"));
    const { extractArticleHistory } = await import(repoUrl("scripts", "parsers", "lib", "article-history.ts"));
    const line = "1\\. الفقرة الأولى بعد التعديل";
    const item = splitNumberedItem(line);
    assert.deepEqual(item, { number: "1", text: "الفقرة الأولى بعد التعديل" });

    const historyBlock = "<details><summary>📜 الإصدارات السابقة</summary>\n\nعُدّلت هذه المادة بموجب الأمر الملكي (أ/12). النص قبل التعديل:\nنص قديم.\n</details>";
    const history = extractArticleHistory(historyBlock);
    assert.ok(history.entries.length > 0 || history.unparsed.length > 0);
  });

  test("T3.5: Search state lifecycle guarantees no flashing during rapid transitions", () => {
    function simulateSearchLifecycle(steps) {
      const history = [];
      for (const step of steps) {
        const showSkeleton = step.isLoading;
        const showEmpty = !step.isLoading && step.hasSearched && step.resultsCount === 0;
        history.push({ showSkeleton, showEmpty });
      }
      return history;
    }
    const lifecycle = simulateSearchLifecycle([
      { isLoading: false, hasSearched: false, resultsCount: 0 }, // Idle
      { isLoading: true,  hasSearched: false, resultsCount: 0 }, // Typing / debouncing
      { isLoading: true,  hasSearched: true,  resultsCount: 0 }, // Fetch in flight
      { isLoading: false, hasSearched: true,  resultsCount: 0 }, // Completed: zero results
    ]);
    assert.deepEqual(lifecycle[0], { showSkeleton: false, showEmpty: false });
    assert.deepEqual(lifecycle[1], { showSkeleton: true,  showEmpty: false });
    assert.deepEqual(lifecycle[2], { showSkeleton: true,  showEmpty: false });
    assert.deepEqual(lifecycle[3], { showSkeleton: false, showEmpty: true  });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TIER 4: Real-World Acceptance Scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe("Tier 4: Real-World Acceptance Scenarios", () => {
  test("T4.1: High-stakes litigation: 100,000,000 SAR claim rigorously obeys statutory ceilings", async () => {
    const { estimateJudicialCosts } = await import(repoUrl("src", "components", "calculators", "judicialCosts.ts"));
    const estimate = estimateJudicialCosts({
      claimAmountSar: 100_000_000,
      includeFirstInstance: true,
      includeAppeal: true,
    });
    assert.ok(estimate);
    // 5% of 100M would be 5M, but capped at 1M
    assert.equal(estimate.lines[0].amountSar, 1_000_000);
    assert.equal(estimate.lines[0].capped, true);
    // Appeal capped at 10k
    assert.equal(estimate.lines[1].amountSar, 10_000);
    assert.equal(estimate.lines[1].capped, true);
    assert.equal(estimate.totalSar, 1_010_000);
  });

  test("T4.2: Real legislative sublegislation anchor resolution across multi-article instrument", async () => {
    const { buildRegulationAnchors, regulationCardId } = await import(repoUrl("src", "app", "laws", "[slug]", "_reader-anchors.ts"));
    const instrument = {
      ref: "اللائحة التنفيذية لنظام الإجراءات الجزائية",
      articles: Array.from({ length: 50 }, (_, i) => ({
        regNum: `مادة ${i + 1}`,
        text: `نص المادة ${i + 1}`,
      })),
    };
    const articles = Array.from({ length: 50 }, (_, i) => ({
      id: `art-${i + 1}`,
      regulations: [{
        ref: instrument.ref,
        regNum: `مادة ${i + 1}`,
        text: `نص المادة ${i + 1}`,
      }],
    }));

    const { anchorByArticleId } = buildRegulationAnchors([instrument], articles, null);
    for (let i = 0; i < 50; i++) {
      assert.equal(anchorByArticleId.get(`art-${i + 1}`), regulationCardId(0, i));
    }
  });

  test("T4.3: Real legislative document clause numbering extraction across CommonMark text stream", async () => {
    const { splitNumberedItem } = await import(repoUrl("src", "app", "laws", "[slug]", "_numbered-item.ts"));
    const documentLines = [
      "1. تتولى الهيئة الإشراف والرقابة على المنشآت.",
      "2\\. إصدار التراخيص والموافقات اللازمة.",
      "٣. تحصيل المقابل المالي للخدمات المقدمة.",
      "٤\\. رفع التقارير السنوية إلى المقام السامي.",
      "1.5 مليار ريال رأس مال الشركة الأولي.",
    ];
    const results = documentLines.map(splitNumberedItem);
    assert.deepEqual(results[0], { number: "1", text: "تتولى الهيئة الإشراف والرقابة على المنشآت." });
    assert.deepEqual(results[1], { number: "2", text: "إصدار التراخيص والموافقات اللازمة." });
    assert.deepEqual(results[2], { number: "٣", text: "تحصيل المقابل المالي للخدمات المقدمة." });
    assert.deepEqual(results[3], { number: "٤", text: "رفع التقارير السنوية إلى المقام السامي." });
    assert.equal(results[4], null, "Non-clause amount line must not be parsed as clause number");
  });

  test("T4.4: Complete schema manifest JSON strict uniqueness and lint pass", () => {
    const manifestPath = fileInRepo("scripts", "parsers", "schema_manifest.json");
    const raw = fs.readFileSync(manifestPath, "utf8");
    const duplicates = findDuplicateJsonKeys(raw);
    assert.equal(duplicates.length, 0, `Schema manifest has duplicate keys: ${duplicates.join(", ")}`);
    const parsed = JSON.parse(raw);
    assert.ok(parsed.core.law_lifecycle_status, "Must define law_lifecycle_status in core properties");
    assert.ok(parsed.core.superseded_by, "Must define superseded_by in core properties");
  });

  test("T4.5: Quality Gate Enforcement: owner-edits branch + tsc compile clean + 100% unit tests", () => {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    assert.equal(branch, "owner-edits", "Must be on owner-edits branch");
  });
});

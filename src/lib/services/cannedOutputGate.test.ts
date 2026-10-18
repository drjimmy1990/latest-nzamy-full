/**
 * cannedOutputGate.test.ts — owner answer ١١٥: a tool that shows canned output
 * says «قريباً», or loses the fake numbers.
 *
 * Every page below used to print a hard-coded result as if it had computed it:
 * a "translation" that ignored the text typed in, a "transcript" of a hearing
 * nobody uploaded, an inbox of two invented e-mails, contract portfolios, HR
 * answers, compliance scores, system logs, backup history and a revenue report.
 * Each one now renders `DashboardComingSoon` — the component the /ai pages
 * already use (direction-support, vault) — and the pins below name the exact
 * constant or string that is gone, so the fake cannot come back unnoticed.
 *
 * Two pages keep working and only lose a fake: the Najiz cleaner (a timer that
 * pretended to be "AI processing") and the template library (usage counters
 * nobody counted).
 *
 * Source is read as text (the pages are .tsx and import React), with comments
 * stripped first: the comments that explain each removal describe what was
 * removed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LAWYER_AI_TOOL_BY_PERMISSION, getLawyerAiBadge } from "../../constants/lawyerAiCatalog.ts";

function src(rel: string): string {
  return readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
}

/** Source with block comments (JSX ones included) and line comments removed. */
function code(rel: string): string {
  return src(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // A line comment, but not the `//` inside "https://…".
    .replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
}

const SOON_IMPORT = 'from "@/components/ui/DashboardComingSoon"';

/** Every .ts/.tsx file under src, as [path relative to src, comment-stripped code]. */
function allSources(): [string, string][] {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const out: [string, string][] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
        const rel = path.relative(root, full).split(path.sep).join("/");
        out.push([rel, code(rel)]);
      }
    }
  };
  walk(root);
  return out;
}

// ── The «قريباً» pages ──────────────────────────────────────────────────────

/** page → the canned constants / strings that must be gone from it. */
const SOON_PAGES: { page: string; gone: string[] }[] = [
  {
    page: "app/ai/legal-translate/page.tsx",
    gone: ['"@/components/translation/TranslationComponents"', '"@/constants/translationData"', "PROCESSING_STEPS", "setTimeout"],
  },
  {
    page: "app/ai/compare/page.tsx",
    gone: ['"./_compare-types"', '"./_result-view"', '"./_compare-components"', "PROCESSING_STEPS", "setTimeout"],
  },
  { page: "app/ai/transcriber/page.tsx", gone: ["MOCK_VERBATIM", "MOCK_LEGAL", "المتحدث الأول", "setTimeout"] },
  { page: "app/ai/mail-advisor/page.tsx", gone: ["MOCK_MAILS", "corp-123@nzamy.sa", "قمنا بإنشاء بريد", "شركة النجم للتوريد"] },
  { page: "app/ai/share-history/page.tsx", gone: ["MOCK_DOCS", "839210", "شركة التقنية المتقدمة", "handleHandleRevision"] },
  { page: "app/ai/corp/clm/page.tsx", gone: ["MOCK_CONTRACTS", "شركة الأمل للتوزيع", "٢٤٠,٠٠٠ ريال"] },
  { page: "app/ai/corp/corpmind/page.tsx", gone: ["MOCK_CONTRACTS", "MOCK_ANALYSIS", "شركة النجم", "setTimeout"] },
  { page: "app/ai/corp/hr/page.tsx", gone: ["MOCK_HR_RESPONSE", "LABOR_ALERTS", "StreamingText", "setTimeout"] },
  { page: "app/ai/corp/compliance/page.tsx", gone: ["COMPLIANCE_AREAS", "formatCorpComplianceReport", "setTimeout"] },
  { page: "app/dashboard/admin/system/page.tsx", gone: ["const LOGS", "Daily backup completed", "government_judge"] },
  { page: "app/dashboard/admin/system/backup/page.tsx", gone: ["BACKUPS", "آخر نسخة", "٩٤٪", "١٢.٤ GB", "setTimeout"] },
  { page: "app/dashboard/admin/reports/page.tsx", gone: ["COHORT_DATA", "CITIES", "FUNNEL_DATA", "ROLE_DIST", "٩٨١k", "48200"] },
];

for (const { page, gone } of SOON_PAGES) {
  test(`${page} renders «قريباً» and none of its canned output`, () => {
    const body = code(page);
    assert.ok(body.includes(SOON_IMPORT), `${page} does not import DashboardComingSoon`);
    assert.match(body, /<DashboardComingSoon\b/, `${page} does not render DashboardComingSoon`);
    for (const s of gone) assert.ok(!body.includes(s), `${page} still contains ${s}`);
  });
}

test("the canned translation and comparison fixtures are imported by nothing", () => {
  // The fixtures stay on disk (owner decision ٤: no source deletion without
  // its own decision) but leave the bundle: no file outside their own folder
  // imports them.
  const fixtures = [
    { mod: "translation/TranslationComponents", home: "components/translation/" },
    { mod: "constants/translationData", home: "components/translation/" },
    { mod: "/_compare-types", home: "app/ai/compare/_" },
    { mod: "/_result-view", home: "app/ai/compare/_" },
    { mod: "/_compare-components", home: "app/ai/compare/_" },
  ];
  const sources = allSources();
  assert.ok(sources.length > 500, `walked only ${sources.length} files — the walker broke`);
  for (const { mod, home } of fixtures) {
    const importers = sources
      .filter(([rel, body]) => !rel.startsWith(home) && new RegExp(`from "[^"]*${mod.replace(/[/.]/g, "\\$&")}"`).test(body))
      .map(([rel]) => rel);
    assert.deepEqual(importers, [], `${mod} is still imported by ${importers.join(", ")}`);
  }
});

test("the layouts of the two gated tools no longer advertise a working tool", () => {
  for (const layout of ["app/ai/legal-translate/layout.tsx", "app/ai/compare/layout.tsx"]) {
    const body = code(layout);
    assert.match(body, /قريباً/, `${layout} metadata does not say «قريباً»`);
  }
  assert.ok(!code("app/ai/legal-translate/layout.tsx").includes("ترجمة احترافية"));
});

// ── عصارة المرفقات (lawyer/firm half of /ai/analyze) ────────────────────────

test("AttachmentSqueezer is «قريباً» and can no longer export a canned report to the collector", () => {
  const body = code("app/ai/analyze/_components/AttachmentSqueezer.tsx");
  assert.ok(body.includes(SOON_IMPORT));
  assert.match(body, /<DashboardComingSoon\b/);
  for (const s of [
    "@/lib/services/researchService", // the collector write: addToDesktop / addToSession
    "addToDesktop",
    "addToSession",
    "buildReportMarkdown",
    "إقرار باستلام الدفعة",
    "files.length * 18 + 12",
    "ثغرات مكتشفة",
    "setTimeout",
  ]) {
    assert.ok(!body.includes(s), `AttachmentSqueezer still contains ${s}`);
  }
});

test("/ai/analyze itself stays live: the client analyzer is not gated with it", () => {
  // The route also serves SmartAnalyzer to clients, so page.tsx must not
  // import DashboardComingSoon (navComingSoon.test.ts would then require
  // «قريباً» on every client nav row to /ai/analyze, and lawyerQuickTools
  // would refuse the route).
  const page = code("app/ai/analyze/page.tsx");
  assert.ok(!page.includes(SOON_IMPORT));
  assert.match(page, /<SmartAnalyzer\b/);
});

// ── منقح ناجز: keeps working, loses the fake "AI" delay ──────────────────────

test("the Najiz cleaner runs at once, calls itself a text cleaner, and stays behind ConsultantGate", () => {
  const body = code("app/ai/najiz-optimizer/page.tsx");
  assert.ok(!body.includes(SOON_IMPORT), "the cleaner works; it must not be gated");
  // The 1.2s timer that wrapped the call, and the spinner copy it fed.
  assert.ok(!body.includes("1200"), "the 1.2s delay is back");
  assert.ok(!body.includes("setProcessing"), "the fake processing state is back");
  assert.ok(!body.includes("جارٍ التنقيح والتحليل"));
  const handler = /function handleOptimize\(\)\s*\{([\s\S]*?)\n  \}/.exec(body);
  assert.ok(handler, "handleOptimize not found");
  assert.ok(!handler[1].includes("setTimeout"), "handleOptimize defers the result again");
  assert.match(handler[1], /runNajizOptimizer\(inputText\)/);
  // The real cleaning function is still there.
  assert.match(body, /function runNajizOptimizer\(text: string\)/);
  // Named for what it is.
  assert.match(body, /منقّح نصوص/);
  assert.match(body, /<ConsultantGate>/);
});

// ── مكتبة القوالب: real templates, no invented usage counters ────────────────

test("the template library shows no usage counters", () => {
  const data = code("app/ai/templates/_data.tsx");
  assert.doesNotMatch(data, /\buses:/, "a template still carries a usage count");
  assert.ok(!data.includes("uses: 1247") && !data.includes("uses: 2891"));
  const page = code("app/ai/templates/page.tsx");
  assert.doesNotMatch(page, /\.uses\b/, "the page still prints a usage count");
  assert.ok(!page.includes("} استخدام"), "the «N استخدام» label is back");
});

// ── Dead share-link code ─────────────────────────────────────────────────────

test("useDraftState no longer mints a share link it never stores", () => {
  const hook = code("hooks/useDraftState.ts");
  assert.ok(!hook.includes("generateShareLink"));
  assert.ok(!hook.includes("Math.random"));
  assert.ok(!hook.includes("nzamy.sa/share/"));
  assert.ok(!existsSync(new URL("../../components/draft/steps/StepApproval.tsx", import.meta.url)),
    "the unimported draft StepApproval panel is back");
});

// ── The catalog, the nav and the hub say «قريباً» too ────────────────────────

test("the gated lawyer tools are «قريباً» on the hub; the Najiz cleaner is not", () => {
  for (const id of ["ai:compare", "ai:legal-translate", "ai:transcriber"] as const) {
    const tool = LAWYER_AI_TOOL_BY_PERMISSION[id];
    assert.equal(tool.comingSoon, true, `${id} is not marked comingSoon`);
    assert.equal(getLawyerAiBadge(tool, "ar"), "قريباً");
  }
  assert.notEqual(LAWYER_AI_TOOL_BY_PERMISSION["ai:najiz-optimizer"].comingSoon, true);
});

/** `{ href, badge }` for every nav row on one line, in the given constants file. */
function navRows(rel: string): { href: string; badge: string | null }[] {
  return src(rel).split("\n").flatMap((line) => {
    const href = /href: "([^"]+)"/.exec(line);
    if (!href || !/label: "/.test(line)) return [];
    return [{ href: href[1], badge: /badge: "([^"]+)"/.exec(line)?.[1] ?? null }];
  });
}

test("every nav row to a gated page is badged «قريباً» — the files navComingSoon.test.ts does not scan included", () => {
  const gated = new Set([
    "/ai/legal-translate", "/ai/compare", "/ai/transcriber", "/ai/mail-advisor", "/ai/share-history",
    "/ai/corp/clm", "/ai/corp/corpmind", "/ai/corp/hr", "/ai/corp/compliance",
    "/dashboard/admin/system", "/dashboard/admin/system/backup", "/dashboard/admin/reports",
    // عصارة المرفقات: lawyer and firm rows land on the gated AttachmentSqueezer.
    "/ai/analyze?source=firm",
  ]);
  const files = [
    "constants/navigation.sidebars.legal.ts",
    "constants/navigation.sidebars.primary.ts",
    "constants/navigation.navbar.ts",
  ];
  const wrong: string[] = [];
  let seen = 0;
  for (const f of files) {
    for (const r of navRows(f)) {
      if (!gated.has(r.href)) continue;
      seen++;
      if (r.badge !== "قريباً") wrong.push(`${f}: ${r.href} badged «${r.badge ?? "(none)"}»`);
    }
  }
  assert.ok(seen >= 15, `found only ${seen} rows — the parser broke`);
  assert.deepEqual(wrong, []);
  // The two LAWYER rows to /ai/analyze (the firm rows use ?source=firm).
  const lawyerAnalyze = navRows("constants/navigation.sidebars.legal.ts").filter((r) => r.href === "/ai/analyze");
  assert.equal(lawyerAnalyze.length, 2);
  for (const r of lawyerAnalyze) assert.equal(r.badge, "قريباً");
});

test("the hub's corporate compliance card says «قريباً», and no hub card for a gated page is «جديد»", () => {
  const hub = code("app/ai/page.tsx");
  const card = (id: string) => hub.split("\n").find((l) => l.includes(`id: "${id}"`)) ?? "";
  assert.match(card("ai:corp:compliance"), /badgeAr: "قريباً"/);
  // /ai/tracker redirects to the gated CorpMind page.
  assert.match(card("ai:tracker"), /badgeAr: "قريباً"/);
  assert.doesNotMatch(card("ai:tracker"), /badge: "جديد"/);
  // A comingSoon catalog tool is not described as part of the credit catalog.
  assert.match(hub, /tool\.comingSoon\s*\?/);
});

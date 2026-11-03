import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
// A namespace import, so a missing export fails its own test, not the file.
import * as catalog from "../../constants/lawyerAiCatalog.ts";
import * as badges from "../../constants/lawyerAiBadges.ts";
import { bookSar } from "../pricing/priceBook.ts";
import {
  AI_TOOLS,
  ASSISTANT_CONVERSATION_PRICE,
  ASSISTANT_MESSAGES_PER_CONVERSATION,
  BRIEF_CHECK_PRICE,
  CASE_BRIEF_PRICES,
  CONTRACT_DRAFT_PRICE,
  CONTRACTS_PRO_PRICE,
  LEGAL_OPINION_PRICE,
  WAVE4_PRICE,
} from "../ai/tools.ts";
import { DRAFT_KINDS } from "../ai/draftKinds.ts";
import * as display from "../ai/toolPointsDisplay.ts";

const lawyers = readFileSync(new URL("../../constants/pricing/pricing.lawyers.ts", import.meta.url), "utf8");
const pricingCards = readFileSync(new URL("../../components/pricing/PricingCards.tsx", import.meta.url), "utf8");
const library = readFileSync(new URL("../../constants/pricing/pricing.library.ts", import.meta.url), "utf8");
const individuals = readFileSync(new URL("../../constants/pricing/pricing.individuals.ts", import.meta.url), "utf8");
const providerRegistration = readFileSync(
  new URL("../../app/register/provider/data.ts", import.meta.url),
  "utf8",
);

// Owner answers ١٧٤ / ١٧٨ / ١٧٩ (2026-10-16): one subscription and its top-ups.
// The library is no longer bundled into the packs (whether lawyers get it is
// owner question ٢٠٨), and the free-memo offers are gone. Owner ٣٠٢ (30 Oct
// 2026, conflict ١١): the professionals' top-ups start at 500 — the revised
// doc's five packs; 100 and 250 are the individuals' only.
test("the lawyer tab is the subscription (no points) plus the five professional top-ups", () => {
  // The prices are the price book's (P1: the card reads them by id).
  // Yearly only: the 399 monthly price is retired (owner, 26 Oct 2026).
  assert.equal(bookSar("lawyer-pro", "yearly"), 3990);
  assert.throws(() => bookSar("lawyer-pro", "monthly"));
  assert.match(lawyers, /id: "lawyer-pro"/);
  // Owner ٢٩١ (26 Oct 2026): the subscription comes with no points.
  assert.doesNotMatch(lawyers, /LAWYER_PRO_MONTHLY_POINTS|١٬٥٠٠ نقطة كل شهر|1,500 points every month/);
  const topups: Array<[string, number, string]> = [
    ["topup-500", 500, "٥٠٠ نقطة"],
    ["topup-1000", 1000, "١٬٢٥٠ نقطة"],
    ["topup-2500", 2500, "٣٬٥٠٠ نقطة"],
    ["topup-5000", 5000, "٨٬٥٠٠ نقطة"],
    ["topup-10000", 10000, "٢٥٬٠٠٠ نقطة"],
  ];
  for (const [id, price, points] of topups) {
    assert.equal(bookSar(id, "once"), price, id);
    assert.match(lawyers, new RegExp(`id: "${id}"[\\s\\S]*?desc: "${points}( · [^"]*)?"`), id);
  }
  assert.doesNotMatch(lawyers, /id: "topup-(100|250)"/, "٣٠٢: the 100 / 250 packs are not on the lawyers' tab");
  for (const [id, points] of [["topup-100", "١٠٠ نقطة"], ["topup-250", "٢٥٠ نقطة"]]) {
    assert.match(individuals, new RegExp(`id: "${id}"[\\s\\S]*?desc: "${points} · صالحة ٣ أشهر"`), id);
  }
  assert.doesNotMatch(lawyers, /lawyer-(basic|advanced|elite|royal)|مشمولة مجاناً|مذكرة مجانية|مذكرة ثانية|أول ٥٠٠/);
  assert.doesNotMatch(lawyers, /محفظة|رصيد نقدي/);
});

// ── Wave 1 task 4 (2026-11-02): every points figure shown = what the server charges ─
// The /pricing price list, the hub badges, the plan cards and the tool pages
// read the AI registry (src/lib/ai/toolPointsDisplay.ts, tools.ts,
// draftKinds.ts). These tests work the charge out themselves from the
// registry's own `price` functions and pin today's numbers, so a repriced
// tool or a hand-typed label fails here. The old 15 / 10 / «١٥–٢٠» / «٥–٨» /
// «١–٢» labels (owner ٢١٦) were a fraction of the real charge.

/** Every charge one run of a registry tool can make, from its own `price`. */
function serverCharges(id: string): number[] {
  const tool = AI_TOOLS[id];
  assert.ok(tool, `${id} is not in the AI registry`);
  if (id === "legal-drafter") return Object.keys(DRAFT_KINDS).map((kind) => tool.price({ kind }, { pages: null, turn: 0 }));
  if (id === "case-brief") return [1, 5, 6, 30].map((pages) => tool.price({}, { pages, turn: 0 }));
  return [tool.price({}, { pages: 1, turn: 0 })];
}

function serverRange(ids: readonly string[]): [number, number] {
  const all = ids.flatMap(serverCharges);
  return [Math.min(...all), Math.max(...all)];
}

/** The cost column's text, worked out here, not by the helper under test. */
function expectedLabel(ids: readonly string[], lang: "ar" | "en"): string {
  const locale = lang === "ar" ? "ar-SA" : "en-US";
  const [min, max] = serverRange(ids);
  return min === max ? min.toLocaleString(locale) : `${min.toLocaleString(locale)}–${max.toLocaleString(locale)}`;
}

const nounAr = (n: number): string => (n >= 3 && n <= 10 ? "نقاط" : "نقطة");

/** Today's server prices, [lowest, highest] per run. A repricing (Wave 2) edits this on purpose. */
const TODAY: Record<string, [number, number]> = {
  "legal-drafter": [500, 1500],
  "contracts-pro": [1000, 1000],
  "contract-drafter": [500, 500],
  wargaming: [250, 250],
  "analyze-strength": [250, 250],
  "legal-opinion-consult": [400, 400],
  "legal-opinion-letter": [400, 400],
  assistant: [100, 100],
  "quick-answer": [20, 20],
  "najiz-optimizer": [5, 5],
  communicate: [5, 5],
  "library-assistant": [5, 5],
  "canvas-card": [10, 10],
  "case-brief": [30, 150],
  "brief-check": [200, 200],
};

test("task 4: the registry charges today's prices, and the display helper reads exactly that", () => {
  // Every tool a screen may price is pinned here, and every registry tool but
  // the two echo tests is one a screen may price: a new tool cannot skip the pin.
  assert.deepEqual(Object.keys(TODAY).sort(), [...display.PRICED_AI_TOOL_IDS].sort(), "TODAY and PRICED_AI_TOOL_IDS differ");
  assert.deepEqual(
    Object.keys(AI_TOOLS).filter((id) => !id.startsWith("echo-")).sort(),
    [...display.PRICED_AI_TOOL_IDS].sort(),
    "a registry tool is missing from PRICED_AI_TOOL_IDS (or the list names a tool the registry lacks)",
  );
  for (const [id, range] of Object.entries(TODAY)) {
    assert.deepEqual(serverRange([id]), range, `${id}: the server charge moved — update every label's expectation here`);
    assert.deepEqual([...display.aiToolPointRange(id as display.PricedAiToolId)], range, `${id}: the display range is not the charge`);
    for (const lang of ["ar", "en"] as const) {
      assert.equal(display.aiToolPointsLabel(id as display.PricedAiToolId, lang), expectedLabel([id], lang), `${id} (${lang})`);
    }
  }
  // The assistant: one price buys a conversation, and the unit says how long.
  assert.equal(AI_TOOLS.assistant.price({}, { pages: null, turn: 1 }), 0);
  assert.equal(display.aiToolPriceUnit("assistant", "ar"), `لكل محادثة من ${ASSISTANT_MESSAGES_PER_CONVERSATION.toLocaleString("ar-SA")} رسائل`);
  assert.equal(display.aiToolPriceText("legal-drafter", "ar"), `من ${(500).toLocaleString("ar-SA")} إلى ${(1500).toLocaleString("ar-SA")} نقطة`);
  assert.equal(display.aiToolPriceText("legal-drafter", "en"), "500 to 1,500 points");
  assert.equal(display.aiToolPriceText("najiz-optimizer", "ar"), "٥ نقاط");
});

interface PriceRow { name: string; price: string; aiTool: string[]; tools: string[]; note?: string }

/** The rows of `lawyerServicesTable` (the price list under the lawyer cards). */
function serviceRows(): PriceRow[] {
  const start = lawyers.indexOf("export const lawyerServicesTable");
  const end = lawyers.indexOf("export const comparisonLawyers");
  assert.ok(start >= 0 && end > start, "lawyerServicesTable is in pricing.lawyers.ts");
  const table = lawyers.slice(start, end);
  const rows = [
    ...table.matchAll(
      /\{ name: "([^"]+)", price: (\{ aiTool: (?:"[^"]+"|\[[^\]]*\]) \}|"free"|"soon")(?:, tools: \[([^\]]*)\])?(?:, note: "([^"]*)")? \}/g,
    ),
  ].map((m) => ({
    name: m[1],
    price: m[2],
    aiTool: [...(m[2].startsWith("{") ? m[2] : "").matchAll(/"([^"]+)"/g)].map((t) => t[1]),
    tools: [...(m[3] ?? "").matchAll(/"([^"]+)"/g)].map((t) => t[1]),
    note: m[4],
  }));
  // Every row is in one of the three shapes: none escapes the parser with a number.
  assert.equal(rows.length, (table.match(/\{ name: "/g) ?? []).length, "a price-list row is not { aiTool } / free / soon");
  assert.doesNotMatch(table, /\bpoints(Label)?:/, "a price-list row writes its own number");
  return rows;
}

test("task 4: the /pricing price list prints the registry's charge, «قريباً» with no number, or free", () => {
  const rows = new Map(serviceRows().map((r) => [r.name, r]));
  // The owner's catalogue keeps every row (owner ٢١٦); only the numbers moved.
  const expected: Array<[string, string[] | "soon" | "free"]> = [
    ["الصائغ القانوني: المذكرات ومذكرات الدفاع واللوائح الاعتراضية", ["legal-drafter"]],
    ["صياغة العقود وتدقيقها ومصفوفة المخاطر", ["contracts-pro"]],
    ["الصياغة من نموذج", "soon"],
    ["فحص المذكرة الشكلي والموضوعي", ["brief-check"]],
    ["مولّد أسئلة الاستجواب", "soon"],
    ["منقح ناجز", ["najiz-optimizer"]],
    ["المحاكي القضائي", ["wargaming"]],
    ["تقرير العناية الواجبة", "soon"],
    ["الرأي الفصل", ["legal-opinion-consult", "legal-opinion-letter"]],
    ["المساعد القانوني", ["assistant"]],
    ["البحث الدلالي وشرح المواد في المكتبة", ["library-assistant"]],
    ["المرشد القضائي", "free"],
    ["الحاسبة القانونية", "free"],
    ["المجمّع البحثي", "free"],
    ["المجتمع القانوني", "free"],
  ];
  assert.equal(rows.size, expected.length, "the price list lost or gained a row");
  for (const [name, want] of expected) {
    const row = rows.get(name);
    assert.ok(row, `no row «${name}» in lawyerServicesTable`);
    if (typeof want === "string") {
      assert.equal(row.price, `"${want}"`, name);
      continue;
    }
    assert.deepEqual(row.aiTool, want, name);
    const ref = (want.length === 1 ? want[0] : want) as display.PricedAiToolRef;
    // What the cell prints (PricingCards: aiToolPointsLabel(aiTool, "ar")) = the charge.
    assert.equal(display.aiToolPointsLabel(ref, "ar"), expectedLabel(want, "ar"), name);
  }
  // The archive is not a free row: it is a note.
  assert.ok(![...rows.keys()].some((n) => n.includes("الأرشيف")), "the archive must not be a free row");
  assert.match(lawyers, /"الأرشيف السحابي: ضمن سعة الباقة"/);
  assert.match(pricingCards, /LAWYER_ARCHIVE_NOTE/);
  // The table renders the registry's label and «قريباً», never a row's own number.
  assert.match(pricingCards, /aiToolPointsLabel\(aiTool, "ar"\)/);
  assert.match(pricingCards, /aiToolPriceUnit\(aiTool, "ar"\)/);
  assert.match(pricingCards, /item\.price === "soon"[\s\S]{0,200}قريباً/);
  assert.doesNotMatch(pricingCards, /item\.points|item\.pointsLabel/);
});

test("٢١٦: the comparator and the translator are not priced (both still return canned output)", () => {
  for (const row of serviceRows()) {
    assert.doesNotMatch(row.name, /المقارن الذكي|المترجم القانوني/, `«${row.name}» prices a canned tool`);
    assert.ok(!row.tools.includes("ai:compare") && !row.tools.includes("ai:legal-translate"), row.name);
  }
  const byPermission = new Map(catalog.LAWYER_AI_TOOLS.map((t) => [t.permission, t]));
  for (const id of ["ai:compare", "ai:legal-translate"] as const) {
    const tool = byPermission.get(id);
    assert.ok(tool, id);
    const badge = badges.getLawyerAiBadge(tool, "ar");
    assert.ok(badge === null || badge === "قريباً", `${id} still shows a price on the hub: «${badge}»`);
  }
});

/** Catalog id → the registry tool(s) its hub card sells, written here independently of the catalog. */
const HUB_TOOLS: Record<string, string[]> = {
  "ai:quick-answer": ["quick-answer"],
  "ai:case-brief": ["case-brief"],
  "ai:draft": ["legal-drafter"],
  "ai:brief-check": ["brief-check"],
  "ai:contracts": ["contracts-pro"],
  "ai:contract-drafter": ["contract-drafter"],
  "ai:wargaming": ["wargaming"],
  "ai:analyze-strength": ["analyze-strength"],
  "ai:legal-opinion": ["legal-opinion-consult", "legal-opinion-letter"],
  "ai:najiz-optimizer": ["najiz-optimizer"],
  "ai:communicate": ["communicate"],
  "ai:assistant": ["assistant"],
};

test("task 4: every hub badge is the registry's charge, «قريباً», free for a tool that charges nothing, or absent", () => {
  const exported = (badges as { TOOL_POINT_LABELS?: Record<string, string> }).TOOL_POINT_LABELS;
  assert.ok(exported, "lawyerAiBadges.ts exports TOOL_POINT_LABELS");
  const labels: Record<string, string> = exported;
  assert.deepEqual(Object.keys(labels).sort(), Object.keys(HUB_TOOLS).sort(), "the hub prices a different set of tools");

  for (const tool of catalog.LAWYER_AI_TOOLS) {
    const ar: string | null = badges.getLawyerAiBadge(tool, "ar");
    const en: string | null = badges.getLawyerAiBadge(tool, "en");
    const ids = HUB_TOOLS[tool.permission];
    if (tool.comingSoon) {
      assert.equal(ar, "قريباً", tool.permission);
      continue;
    }
    if (!ids) {
      // No registry tool: no number. «مجاني» / «بيتا مجاني» only where nothing is charged.
      assert.ok(ar === null || ar === "مجاني" || ar === "بيتا مجاني", `${tool.permission}: «${ar}» prices a tool the server has no price for`);
      continue;
    }
    // A tool the server charges is never called free on the hub.
    assert.equal(tool.betaStatus, "priced", `${tool.permission} is charged ${expectedLabel(ids, "en")} points but the hub calls it free`);
    const label = expectedLabel(ids, "ar");
    assert.equal(labels[tool.permission], label, tool.permission);
    assert.equal(ar, `${label} ${nounAr(serverRange(ids)[1])}`, tool.permission);
    assert.equal(en, `${expectedLabel(ids, "en")} pts`, tool.permission);
  }

  // The price list and the hub agree wherever a row names a catalog id.
  const fromTable = new Map<string, PriceRow>();
  for (const row of serviceRows()) for (const id of row.tools) {
    assert.ok(!fromTable.has(id), `${id} is priced by two rows`);
    fromTable.set(id, row);
    assert.deepEqual(row.aiTool, HUB_TOOLS[id], `${id}: the row and the hub sell different registry tools`);
  }
  assert.ok(fromTable.size >= 5, "the catalog tools the table prices carry their ids");
  // The old catalog figures (500 / 300 / 100 … points) are gone as a source.
  assert.ok(!catalog.LAWYER_AI_TOOLS.some((t) => "pointCost" in t), "LawyerAiTool.pointCost is a second price source");
});

test("task 4: the plan cards' tool bullets read the registry (lawyer card, consultant card)", () => {
  const providers = readFileSync(new URL("../../constants/pricing/pricing.providers.ts", import.meta.url), "utf8");
  const cards: Array<[string, string[]]> = [
    [lawyers, [
      '`صياغة المذكرات واللوائح: ${aiToolPriceText("legal-drafter", "ar")}`',
      '`صياغة العقود وتدقيقها: ${aiToolPriceText("contracts-pro", "ar")}`',
      '`Briefs and pleadings: ${aiToolPriceText("legal-drafter", "en")}`',
      '`Contract drafting and review: ${aiToolPriceText("contracts-pro", "en")}`',
    ]],
    [providers, [
      '`صياغة العقود وتدقيقها: ${aiToolPriceText("contracts-pro", "ar")}`',
      '`المساعد القانوني: ${aiToolPriceText("assistant", "ar")}`',
      '`Contract drafting and review: ${aiToolPriceText("contracts-pro", "en")}`',
      '`Legal assistant: ${aiToolPriceText("assistant", "en")}`',
    ]],
  ];
  for (const [text, bullets] of cards) {
    for (const b of bullets) assert.ok(text.includes(b), `missing ${b}`);
    // No tool bullet types its own number any more.
    assert.doesNotMatch(text, /(المذكرات واللوائح|العقود وتدقيقها|المساعد القانوني): [٠-٩]/);
    assert.doesNotMatch(text, /(pleadings|review|Legal assistant): \d/);
  }
  // What those bullets print, against the server.
  assert.equal(display.aiToolPriceText("contracts-pro", "ar"), `${expectedLabel(["contracts-pro"], "ar")} نقطة`);
  assert.equal(
    display.aiToolPriceText("assistant", "en"),
    `${expectedLabel(["assistant"], "en")} points per conversation of ${ASSISTANT_MESSAGES_PER_CONVERSATION} messages`,
  );
});

/** Source without comments, as the screens print it. */
function shown(rel: string): string {
  return readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
}

test("task 4: the tool pages print the constant the registry charges", () => {
  // [page, the expression that prints the price, its value, the registry tools that charge it]
  const pages: Array<[string, string, number, string[]]> = [
    ["app/ai/analyze-strength/page.tsx", 'WAVE4_PRICE.toLocaleString("ar-SA")', WAVE4_PRICE, ["analyze-strength"]],
    ["app/ai/wargaming/page.tsx", 'WAVE4_PRICE.toLocaleString("ar-SA")', WAVE4_PRICE, ["wargaming"]],
    ["app/ai/assistant/page.tsx", 'ASSISTANT_CONVERSATION_PRICE.toLocaleString("ar-SA")', ASSISTANT_CONVERSATION_PRICE, ["assistant"]],
    ["app/ai/brief-check/page.tsx", 'BRIEF_CHECK_PRICE.toLocaleString("ar-SA")', BRIEF_CHECK_PRICE, ["brief-check"]],
    ["app/ai/case-brief/page.tsx", 'CASE_BRIEF_PRICES.small.toLocaleString("ar-SA")', CASE_BRIEF_PRICES.small, ["case-brief"]],
    ["app/ai/case-brief/page.tsx", 'CASE_BRIEF_PRICES.large.toLocaleString("ar-SA")', CASE_BRIEF_PRICES.large, ["case-brief"]],
    ["app/ai/legal-opinion/page.tsx", "price={LEGAL_OPINION_PRICE}", LEGAL_OPINION_PRICE, ["legal-opinion-consult"]],
    ["app/ai/legal-opinion/_components/LetterWorkflow.tsx", "price={LEGAL_OPINION_PRICE}", LEGAL_OPINION_PRICE, ["legal-opinion-letter"]],
    ["app/ai/contracts/page.tsx", "price={CONTRACTS_PRO_PRICE}", CONTRACTS_PRO_PRICE, ["contracts-pro"]],
  ];
  for (const [rel, expr, value, ids] of pages) {
    assert.ok(shown(rel).includes(expr), `${rel} no longer prints ${expr}`);
    for (const id of ids) assert.ok(serverCharges(id).includes(value), `${rel}: ${expr} = ${value}, but ${id} charges ${serverCharges(id).join("/")}`);
  }
  // The drafter's step prints the chosen kind's price, which is what the analysis run charges.
  const step = shown("components/draft/steps/StepAiDraft.tsx");
  assert.match(step, /const spec = DRAFT_KINDS\[kind\]/);
  assert.match(step, /spec\.price\.toLocaleString\("ar-SA"\)/);
  for (const kind of Object.keys(DRAFT_KINDS) as Array<keyof typeof DRAFT_KINDS>) {
    assert.equal(AI_TOOLS["legal-drafter"].price({ kind }, { pages: null, turn: 0 }), DRAFT_KINDS[kind].price, kind);
  }
  // The helper's labels where a page had a typed number.
  assert.match(shown("app/ai/quick-answer/page.tsx"), /\{aiToolPriceText\("quick-answer", "ar"\)\} للسؤال/);
  assert.match(shown("app/dashboard/business/kanban/CaseGraphView.tsx"), /\(\$\{aiToolPriceText\("canvas-card", "ar"\)\}\)/);
  assert.match(shown("app/ai/najiz-optimizer/page.tsx"), /اختصر بالذكاء الاصطناعي \(\$\{aiToolPriceText\("najiz-optimizer", "ar"\)\}\)/);
});

test("task 4: the admin AI table shows the range a run can be charged (the drafter is not 0)", () => {
  // price({}) read 0 for the drafter (no kind) and 30 for case-brief (no pages).
  assert.equal(display.registryPointsLabel("legal-drafter", "en"), expectedLabel(["legal-drafter"], "en"));
  assert.notEqual(display.registryPointsLabel("legal-drafter", "en"), "0");
  assert.equal(display.registryPointsLabel("case-brief", "en"), expectedLabel(["case-brief"], "en"));
  assert.equal(display.registryPointsLabel("echo-fast", "en"), "1");
  assert.equal(display.registryPointsLabel("no-such-tool", "en"), null);
  const route = shown("app/api/v1/admin/ai-runs/route.ts");
  assert.match(route, /priceLabel: registryPointsLabel\(spec\.id, "en"\)/);
  assert.doesNotMatch(route, /spec\.price\(/, "the admin table computes a price of its own");
  const page = shown("app/dashboard/admin/ai-usage/page.tsx");
  assert.match(page, /\{t\.priceLabel\} نقطة/);
  assert.doesNotMatch(page, /\{t\.price\}/);
});

test("task 4: the catalog useUser loads on every page does not import the AI registry", () => {
  const src = readFileSync(new URL("../../constants/lawyerAiCatalog.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /^import /m, "lawyerAiCatalog.ts imports something: the badges belong in lawyerAiBadges.ts");
});

test("task 4: no AI screen types a points number of its own", () => {
  const roots = ["app/ai", "components/draft", "components/legal-opinion", "app/dashboard/business/kanban", "app/laws", "constants/lawyerAiCatalog.ts", "constants/lawyerAiBadges.ts"];
  const files: string[] = [];
  const walk = (rel: string): void => {
    const url = new URL(`../../${rel}`, import.meta.url);
    if (statSync(url).isFile()) {
      files.push(rel);
      return;
    }
    for (const entry of readdirSync(url)) walk(`${rel}/${entry}`);
  };
  for (const r of roots) walk(r);
  const typedPoints = /[0-9٠-٩]\s?(?:نقطة|نقاط)(?![\u0600-\u06FF])|\b\d[\d,]*\s(?:points|pts)\b/;
  let scanned = 0;
  for (const rel of files) {
    if (!/\.tsx?$/.test(rel) || /\.test\.tsx?$/.test(rel)) continue;
    scanned++;
    const hit = typedPoints.exec(shown(rel));
    assert.equal(hit, null, `${rel} types «${hit?.[0]}»: read it from the registry (toolPointsDisplay.ts)`);
  }
  assert.ok(scanned > 50, `scanned only ${scanned} files`);
});

test("٢١٦: the price list does not say points are deducted on every use (enforcement is off)", () => {
  assert.doesNotMatch(pricingCards, /تُخصم[^\n]*كل استخدام|لكل استخدام|per use/i);
  assert.match(pricingCards, /قائمة أسعار الأدوات بالنقاط/);
  // Wave 1 task 6: nor WHEN deduction starts. It follows the runtime switch
  // platform_settings.points_enforcement (ai_start_run), not the e-payment
  // launch, so the old «يبدأ الخصم الآلي … مع إطلاق الدفع الإلكتروني» was
  // false whenever an admin had turned it on. The copy states the price only.
  assert.doesNotMatch(pricingCards, /الخصم الآلي[^\n"]*الدفع الإلكتروني/);
  assert.doesNotMatch(pricingCards, /automatic deduction[^\n"]*electronic payment/i);
  assert.match(pricingCards, /قائمة أسعار أدوات المحامي بالنقاط: تكلفة كل تشغيل للأداة/);
  // The lawyer card at provider registration made the same claim (fix round 1).
  assert.doesNotMatch(providerRegistration, /خصم النقاط|تُخصم|[Pp]oints deducted|deducted per/);
  assert.ok(providerRegistration.includes('"أسعار الأدوات بالنقاط حسب قائمة الأسعار"'), "provider registration (ar)");
  assert.ok(providerRegistration.includes('"Tool prices in points per the price list"'), "provider registration (en)");
});

test("library subscription buttons point to live routes", () => {
  assert.doesNotMatch(library, /ctaHref: "\/subscribe\?plan=lib-/);
  assert.equal((library.match(/\/laws\/subscribe\?plan=lib-/g) ?? []).length, 6);
  assert.equal((library.match(/\/contact\?type=firm-library/g) ?? []).length, 6);
});

test("individual pricing pyramid includes approved plans and per-service pricing", () => {
  // pay-per-piece and ind-ai × two languages; ind-preventive and
  // ind-litigation are retired (q329, owner package of 1 Nov 2026).
  assert.equal((individuals.match(/isBetaHidden: false/g) ?? []).length, 4);
  assert.match(individuals, /id: "pay-per-piece"/);
  assert.match(individuals, /id: "ind-ai"/);
  assert.doesNotMatch(individuals, /id: "ind-preventive"/);
  assert.doesNotMatch(individuals, /id: "ind-litigation"/);
  assert.doesNotMatch(individuals, /ind-family/);
  assert.match(individuals, /priceMonthly: "حسب الخدمة"/);
  assert.match(individuals, /priceYearly: "بدون اشتراك"/);
});

// ── Owner answers ٢١٣ + ١٧٦ (2026-10-18), then q329 (1 Nov 2026) ─────────────

const plansTs = readFileSync(new URL("../../lib/pricing/plans.ts", import.meta.url), "utf8");

test("٢١٣/١٧٦: the 699 family plan is gone from the individuals plans and their comparison", () => {
  assert.doesNotMatch(individuals, /ind-family|٦٩٩|٦٬٩٩٠|\b699\b|6,990/);
  assert.doesNotMatch(plansTs, /ind-family|\b699\b|\b6990\b/);
});

test("q329: «التأمين القانوني» (399 / 3,990) and «الباقة الوقائية» (149 / 1,490) are retired — no card or column on /pricing or /services/individuals, still resolvable in the book", () => {
  // Not sold: the book throws for every cycle, so no page can print the old prices.
  for (const id of ["ind-litigation", "ind-preventive"]) {
    for (const cycle of ["monthly", "yearly"] as const) assert.throws(() => bookSar(id, cycle), `${id} ${cycle}`);
  }
  // No card, no comparison column, no canonical plan.
  for (const text of [individuals, plansTs]) {
    assert.doesNotMatch(text, /id: "ind-litigation"|"ind-litigation":|id: "ind-preventive"|"ind-preventive":/);
  }
  // The family lines were the 399-a-month plan's (dependants at 319 / 279 / 239
  // a month); they went with it. The 365 plan that replaces it waits on ٤٢٠.
  assert.doesNotMatch(individuals, /FAMILY_LINES|SHOW_FAMILY_DEPENDENTS|familyLines|٣١٩ ر\.س|SAR 319/);
  // The ind-ai card no longer names the retired insurance plan.
  assert.doesNotMatch(individuals, /"[^"\n]*«التأمين القانوني»[^"\n]*"|unlike Legal Insurance/);
});

test("٢١٣: the footnote renders, small and grey, under the card on both pages", () => {
  const services = readFileSync(new URL("../../app/services/individuals/page.tsx", import.meta.url), "utf8");
  assert.match(services, /\{\(isAr \? plan\.footnoteAr : plan\.footnoteEn\) && \(/);
  assert.match(services, /text-\[11px\] text-ink-faint[^"]*">\s*\{isAr \? plan\.footnoteAr : plan\.footnoteEn\}/);
  // One plan is sold now (ind-ai, q329): never the old four-column grid.
  assert.doesNotMatch(services, /lg:grid-cols-4/);
  assert.match(pricingCards, /\{plan\.footnote && \(/);
  assert.match(pricingCards, /text-\[11px\][\s\S]{0,120}\{plan\.footnote\}/);
});

test("retired shield and group plans are removed", () => {
  assert.doesNotMatch(individuals, /id: "shield"/);
  assert.doesNotMatch(individuals, /id: "group"/);
});

test("provider registration no longer sells the retired monthly AI plans", () => {
  assert.doesNotMatch(providerRegistration, /AI قانوني غير محدود|Unlimited legal AI/);
  assert.doesNotMatch(providerRegistration, /price: "١٩٩"|price: "٤٩٩"|price: "199"|price: "499"/);
  // Owner answer ١٧٥: the firm ERP is 990/month for 3 seats, not 17,988/year;
  // since the 25-Oct rule 1 professionals see the yearly price, read from the book.
  assert.doesNotMatch(providerRegistration, /١٧٬٩٨٨|17,988/);
  assert.match(providerRegistration, /price: bookPriceText\("firm-basic", "yearly", "ar"\)/);
  assert.match(providerRegistration, /price: bookPriceText\("lawyer-pro", "yearly", "ar"\)/);
  assert.doesNotMatch(providerRegistration, /price: "[٠-٩0-9]/, "no literal price on a plan the book sells");
  assert.match(providerRegistration, /ERP مجاني للمحامي الفرد/);
  assert.doesNotMatch(providerRegistration, /محفظة/);
});

// ── Owner answer ٢١٧ (2026-10-18): extra seats are sold through sales ─────────
// The 200–250 SAR/month range is the sales team's internal guide; no public
// page shows it (pricingHonesty.test.ts) and no page quotes a seat price.

const SALES_LINE_AR = "مقاعد إضافية: تواصل مع المبيعات";
const SALES_LINE_EN = "Extra seats: contact sales";
const SALES_HREF = "/contact?type=firm-seats";

function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

test("٢١٧: every firm plan sends extra seats to sales, with a link", () => {
  const firms = readFileSync(new URL("../../constants/pricing/pricing.firms.ts", import.meta.url), "utf8");
  const [firmsAr, firmsEn = ""] = firms.split("\n  en: [");
  assert.equal(count(firmsAr, `salesLine: { label: "${SALES_LINE_AR}", href: "${SALES_HREF}" }`), 2, "both Arabic firm plans");
  assert.equal(count(firmsEn, `salesLine: { label: "${SALES_LINE_EN}", href: "${SALES_HREF}" }`), 2, "both English firm plans");
  assert.doesNotMatch(firms, /مقاعد إضافية عند الطلب|Extra seats on request/);
  // The card renders the line as a link.
  assert.match(pricingCards, /plan\.salesLine && \(/);
  assert.match(pricingCards, /href=\{plan\.salesLine\.href\}/);

  const pro = readFileSync(new URL("../../app/pro/page.tsx", import.meta.url), "utf8");
  assert.equal(count(pro, `salesLine: { ar: "${SALES_LINE_AR}", en: "${SALES_LINE_EN}", href: "${SALES_HREF}" }`), 2, "/pro: both firm plans");
  assert.match(pro, /href=\{plan\.salesLine\.href\}/);
  // The office plan bundles no points, so it does not include the lawyer plan.
  assert.doesNotMatch(pro, /ما في باقة المحامي المحترف|Everything in Professional Lawyer/);

  // Registration: a plan card is a <button>, so the line is text there.
  assert.ok(providerRegistration.includes(`"${SALES_LINE_AR}"`), "provider registration (ar)");
  assert.ok(providerRegistration.includes(`"${SALES_LINE_EN}"`), "provider registration (en)");
});

test("٢١٧: no stale firm price or seat price is left on the firm surfaces", () => {
  // The four yearly tiers (17,988 / 47,988 / 95,988 / 179,988) and their seat
  // prices (2,388 / 2,988 / 3,588). The same digits are also the live NGO,
  // provider and legal-department prices, so the scan is the firm files.
  const stale = /(?<![\d٠-٩,٬])(?:17,?988|47,?988|95,?988|179,?988|2,?388|2,?988|3,?588|١٧[,٬]?٩٨٨|٢[,٬]?٣٨٨|٢[,٬]?٩٨٨|٣[,٬]?٥٨٨)(?![\d٠-٩])/;
  for (const path of [
    "constants/pricing/pricing.firms.ts",
    "app/pro/page.tsx",
    "app/register/provider/data.ts",
    "app/dashboard/admin/pricing/page.tsx",
    "constants/firmProfileReadiness.ts",
  ]) {
    const text = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
    assert.doesNotMatch(text, stale, `${path} still carries a stale firm price`);
  }
  const admin = readFileSync(new URL("../../app/dashboard/admin/pricing/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(admin, /"firm-growth"|"firm-scale"/, "admin pricing: plans that no longer exist");
  const readiness = readFileSync(new URL("../../constants/firmProfileReadiness.ts", import.meta.url), "utf8");
  const contracts = readiness.slice(readiness.indexOf("export const FIRM_PLAN_CONTRACTS"), readiness.indexOf("export const FIRM_ROLE_CONTRACTS"));
  assert.match(contracts, /plan: "firm-basic",\s*annualPrice: bookSar\("firm-basic", "yearly"\),\s*includedSeats: 3,\s*extraSeatAnnualPrice: null,\s*includedAnnualPoints: 0,/);
  assert.match(contracts, /plan: "firm-enterprise",\s*annualPrice: bookSar\("firm-enterprise", "yearly"\),\s*includedSeats: 5,\s*extraSeatAnnualPrice: null,\s*includedAnnualPoints: 0,/);
  assert.doesNotMatch(contracts, /firm-growth|firm-scale/);
});

// ── q327 (owner package of 1 Nov 2026): contract review 600 / 800, no «99» ──

test("q327: contract review is 600 for individuals; contract drafting says the tool's points, not a riyal amount", async () => {
  const { CLIENT_SERVICE_CATALOG } = await import("../../constants/clientServiceCatalog.ts");
  const row = (id: string) => {
    const r = CLIENT_SERVICE_CATALOG.find((s) => s.serviceId === id);
    assert.ok(r, id);
    return r;
  };
  const review = row("contract-review");
  assert.equal(review.basePrice, 600, "individuals' price (the business 800 is the contract-review-business variant, S6)");
  const business = row("contract-review-business");
  assert.equal(business.basePrice, 800, "q327: «من ٨٠٠» for business");
  assert.equal(business.priceMode, "starting_from");
  assert.equal(business.audience, "corporate");
  assert.equal(business.variantOf, "contract-review");
  assert.equal(review.priceMode, "starting_from");
  assert.doesNotMatch(review.priceNote ?? "", /2x/);
  const draft = row("contract-draft");
  assert.equal(draft.basePrice, 0, "nothing charges riyals for drafting: the tool debits points");
  // Task 6 (G): no plan grant includes drafting, so not «مشمول في الباقة».
  assert.equal(draft.priceMode, "points");
  assert.equal(draft.includedByPlan, undefined, "no plan includes contract drafting");
  assert.equal(draft.requiresPayment, false);
  assert.equal(draft.route, "/ai/contract-drafter");
  // The note names exactly what /ai/contract-drafter debits — no «أو».
  assert.equal(draft.priceNote, `${display.arabicPoints(CONTRACT_DRAFT_PRICE)} نقطة للعقد`);
  assert.equal(draft.tag, undefined, "no popularity claim");
});

test("q327: no «٩٩ ر.س» / «99 SAR» price is left in the consultation and service constants", () => {
  for (const path of [
    "components/consultation/constants.ts",
    "constants/servicesData.ts",
    "constants/clientServiceCatalog.ts",
  ]) {
    const text = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
    // A price field or note of exactly 99 — not 199 / 299 / 499 / 599.
    assert.doesNotMatch(text, /price: "(?:٩٩ ر\.س|99 SAR)"/, `${path}: a 99 price`);
    assert.doesNotMatch(text, /basePrice: 99,/, `${path}: a 99 base price`);
    assert.doesNotMatch(text, /priceNote: "[^"\n]*(?<![\d٠-٩])(?:٩٩|99)(?![\d٠-٩])[^"\n]*"/, `${path}: a 99 price note`);
  }
});

test("q327: migration 20261102_10 writes the same two rows the code catalogue carries (the DB row wins on /api/client-pricing)", async () => {
  const { CLIENT_SERVICE_CATALOG } = await import("../../constants/clientServiceCatalog.ts");
  const sql = readFileSync(new URL("../../../supabase/migrations/20261102_10_retire_cancelled_prices.sql", import.meta.url), "utf8");
  // Statements only: the header and the rollback note are comments.
  const code = sql.replace(/--.*$/gm, "");
  // contract-draft's last writer is 20261102_11 (next test); _10 still owns
  // its base_price.
  for (const id of ["contract-draft", "contract-review"]) {
    const row = CLIENT_SERVICE_CATALOG.find((s) => s.serviceId === id);
    assert.ok(row?.priceNote, id);
    const stmt = code
      .split(";")
      .find((s) => /update public\.admin_pricing_catalog\s+set base_price = /.test(s) && s.includes(`where service_id = '${id}'`));
    assert.ok(stmt, `${id}: an UPDATE keyed by service_id`);
    assert.match(stmt, new RegExp(`set base_price = ${row.basePrice},`), `${id}: base_price ${row.basePrice}`);
    if (id === "contract-review") assert.ok(stmt.includes(`'priceNote', '${row.priceNote}'`), `${id}: the same note`);
  }
  // Retire, never delete: no DROP, no DELETE, no function (PGRST203).
  assert.doesNotMatch(code, /\b(?:drop|delete|truncate)\b|create (?:or replace )?function/i);
});

test("S6 (q327): migration 20261103_20 inserts the same business variant the code catalogue carries", async () => {
  const { CLIENT_SERVICE_CATALOG } = await import("../../constants/clientServiceCatalog.ts");
  const v = CLIENT_SERVICE_CATALOG.find((s) => s.serviceId === "contract-review-business")!;
  const base = CLIENT_SERVICE_CATALOG.find((s) => s.serviceId === "contract-review")!;
  const sql = readFileSync(new URL("../../../supabase/migrations/20261103_20_contract_review_business_row.sql", import.meta.url), "utf8");
  const code = sql.replace(/--.*$/gm, "");
  const tuple = `('${v.serviceId}', '${v.audience}', '${v.categoryId}', '${v.label}', ${v.basePrice}, '${v.priceMode}', '${v.receiverType}', '${v.betaVisibility}', ${v.requiresPayment}, true,`;
  assert.ok(code.includes(tuple), "the same id, audience, category, label, price, mode, receiver, visibility, payment flag");
  const meta = JSON.parse(/'(\{"route"[\s\S]*?\})'::jsonb/.exec(code)![1]);
  assert.equal(meta.variantOf, v.variantOf);
  assert.equal(meta.priceNote, v.priceNote);
  assert.equal(meta.route, base.route, "the variant opens the base service's form");
  assert.equal(meta.icon, v.icon);
  assert.equal(meta.requestType, v.requestType);
  assert.equal(meta.humanService, true);
  // A re-run never overwrites an admin's edit; nothing else is written.
  assert.match(code, /on conflict \(service_id\) do nothing;/);
  assert.doesNotMatch(code, /\b(?:update|drop|delete|truncate)\b|create (?:or replace )?function|\bpolicy\b/i);
});

test("task 6 (G): migration 20261102_11 writes contract-draft's mode and note exactly as the code row carries them", async () => {
  const { CLIENT_SERVICE_CATALOG } = await import("../../constants/clientServiceCatalog.ts");
  const { formatClientServicePrice } = await import("../pricingRepository.ts");
  const row = CLIENT_SERVICE_CATALOG.find((s) => s.serviceId === "contract-draft")!;
  const sql = readFileSync(new URL("../../../supabase/migrations/20261102_11_contract_draft_points_price.sql", import.meta.url), "utf8");
  const code = sql.replace(/--.*$/gm, "");
  const stmt = code.split(";").find((s) => /update public\.admin_pricing_catalog/.test(s));
  assert.ok(stmt && stmt.includes("where service_id = 'contract-draft'"));
  assert.ok(stmt.includes(`set price_mode = '${row.priceMode}',`), "the same mode");
  assert.ok(stmt.includes(`'priceNote', '${row.priceNote}'`), "the same note");
  assert.match(stmt, /- 'includedByPlan'/, "the plan claim is removed from the row");
  assert.doesNotMatch(stmt, /base_price/, "riyals untouched (0 since _10)");
  assert.doesNotMatch(code, /\b(?:drop|delete|truncate)\b|create (?:or replace )?function/i);
  // The card reads «بالنقاط» + «٥٠٠ نقطة للعقد», never «مشمول في الباقة».
  assert.equal(formatClientServicePrice(row), "بالنقاط");
});

// ── S5-B6 (absorbed into Task 4 by preflight R9) ──

test("admin pricing: «Beta free AI» never counts a «قريباً» tool", () => {
  const admin = readFileSync(new URL("../../app/dashboard/admin/pricing/page.tsx", import.meta.url), "utf8");
  assert.match(admin, /tool\.betaStatus === "beta-free" && !tool\.comingSoon/);
  // no bare beta-free filter left beside it
  assert.equal(admin.split('betaStatus === "beta-free"').length - 1, 1, "one beta-free filter, the guarded one");
  // pinned to the catalogue at HEAD: the only beta-free tool (consult) is «قريباً»
  assert.equal(catalog.LAWYER_AI_TOOLS.filter((t) => t.betaStatus === "beta-free" && !t.comingSoon).length, 0);
  assert.ok(catalog.LAWYER_AI_TOOLS.some((t) => t.betaStatus === "beta-free" && t.comingSoon), "fixture: a «قريباً» beta-free tool exists");
});

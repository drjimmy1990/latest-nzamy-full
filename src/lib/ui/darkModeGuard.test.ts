/**
 * darkModeGuard.test.ts — no page outside the admin console paints a light
 * surface, a light hue border or invisible text in dark mode (dark-mode sweep,
 * 2026-10-25). The rules live in darkModeScan.ts; this file walks every .tsx
 * under src and holds the allow-list of deliberate exceptions.
 *
 * The admin console (src/app/dashboard/admin/**, and AdminSidebar, which only
 * the console mounts) is not scanned file by file: its layout wraps everything
 * in ForceDarkTheme and the `dark` class, so it is dark whatever the site theme
 * is. That exemption holds only while the layout says so, which is asserted
 * below; it is not an allow-list entry.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { classFindings, lightOnly, scanSource, stripComments, type DarkModeFinding } from "./darkModeScan.ts";

const SRC = join(import.meta.dirname, "../..");

const TOGGLE = "the white thumb of a toggle switch, on a coloured track in both themes";
const ON_FILL = "a white mark on a coloured (green, blue, gold or brand) fill in both themes";
const ON_BAND = "a white call-to-action or active tab on a dark/green brand band in both themes";
const INVERTED = "the dark-theme branch of a primary button that is deliberately inverted (white on the dark page)";

/**
 * Deliberate light surfaces: [file under src, a substring of the class string, why].
 * A `null` substring exempts the whole file; only unmounted components get one
 * (checked below: nothing imports them).
 */
const ALLOW: [string, string | null, string][] = [
  // toggle-switch thumbs
  ["app/ai/analyze-strength/page.tsx", "rounded-full bg-white shadow transition-all", TOGGLE],
  ["app/ai/case-brief/page.tsx", "w-4 rounded-full bg-white shadow-sm", TOGGLE],
  ["app/ai/debt-collection/page.tsx", "w-4 h-4 rounded-full bg-white shadow-sm", TOGGLE],
  ["app/ai/legal-opinion/_components/LetterWorkflow.tsx", "rounded-full bg-white shadow transition-all", TOGGLE],
  ["app/community/ask/page.tsx", "w-4 h-4 rounded-full bg-white shadow-sm", TOGGLE],
  ["app/community/[id]/page.tsx", "w-4 h-4 rounded-full bg-white shadow", TOGGLE],
  ["app/dashboard/client/_components/ClientLetterWorkflow.tsx", "rounded-full bg-white shadow-md transition-all", TOGGLE],
  ["app/dashboard/firm/branding/page.tsx", "w-5 h-5 rounded-full bg-white shadow-md", TOGGLE],
  ["app/dashboard/firm/fees/page.tsx", "w-3 h-3 rounded-full bg-white shadow-sm transition-all", TOGGLE],
  ["app/dashboard/firm/team/roles/page.tsx", "rounded-full bg-white shadow transition-all", TOGGLE],
  ["app/dashboard/provider/profile/page.tsx", "h-5 w-5 rounded-full bg-white shadow", TOGGLE],
  ["app/laws/[slug]/_ai-components.tsx", "w-4 h-4 rounded-full bg-white shadow-sm", TOGGLE],
  ["app/settings/components/tabs/_shared.tsx", "w-5 h-5 bg-white rounded-full shadow-sm", TOGGLE],
  ["components/calculators/CalcLaborRights.tsx", "w-4 h-4 rounded-full bg-white shadow-sm", TOGGLE],
  ["components/cases/NewCaseSteps.tsx", "w-4 h-4 bg-white rounded-full shadow transition-all", TOGGLE],
  ["components/contracts/steps/draft/StepBestPractices.tsx", "rounded-full bg-white shadow transition-all", TOGGLE],
  ["components/draft/steps/StepCase.tsx", "rounded-full bg-white shadow transition-all", TOGGLE],
  ["components/pricing/PricingHero.tsx", "h-4 w-4 rounded-full bg-white transition-transform", TOGGLE],
  ["components/services/ServiceRequestWizard.tsx", "w-5 h-5 rounded-full bg-white shadow transition-all", TOGGLE],
  // marks on a coloured fill
  ["app/dashboard/ngo/page.tsx", "w-1.5 h-1.5 rounded-full bg-white", `${ON_FILL}: the timeline dot`],
  ["components/legal-opinion/ContextStudy.tsx", "w-1.5 h-1.5 bg-white rounded-full", `${ON_FILL}: the chosen-goal radio dot`],
  ["app/lawyers/browse/page.tsx", "border-white bg-white", `${ON_FILL}: the ticked state of the emerald «accepting clients» toggle`],
  ["components/consultation/steps/StepScheduling.tsx", "bg-white/50", `${ON_FILL}: the free-slot dot on the selected (green) day`],
  ["components/dashboard/SessionChatPane.tsx", "bg-white/70", `${ON_FILL}: the voice-note waveform inside the sender's own (green) bubble`],
  // white on a brand band
  ["app/ai/disclaimer/page.tsx", "rounded-2xl bg-white px-7 py-3.5 text-sm font-bold text-royal", ON_BAND],
  ["app/ai-disclaimer/page.tsx", "rounded-2xl bg-white px-7 py-3.5 text-sm font-bold text-royal", ON_BAND],
  ["app/services/individuals/page.tsx", "rounded-2xl bg-white px-8 py-4 text-sm font-bold text-royal", ON_BAND],
  ["app/services/notary/page.tsx", "bg-white text-[#0B3D2E] shadow-lg", `${ON_BAND}: the active service tab`],
  ["components/Footer.tsx", "rounded-2xl bg-white px-8 py-4 text-sm font-bold text-royal", ON_BAND],
  ["components/pricing/PricingCTA.tsx", "rounded-2xl bg-white px-8 py-4 text-sm font-bold text-royal", ON_BAND],
  ["components/pricing/PricingCards.tsx", "bg-white text-[#0B3D2E] shadow-[0_4px_20px_-4px_rgba(255,255,255,0.3)]", `${ON_BAND}: the CTA on the highlighted (dark green) plan card`],
  ["app/forgot-password/page.tsx", "bg-white text-royal", `${ON_BAND}: the current step in the green side panel`],
  ["app/onboarding/page.tsx", "bg-white text-royal", `${ON_BAND}: the current step in the green side panel`],
  ["app/register/client/page.tsx", "bg-white text-royal", `${ON_BAND}: the current step in the green side panel`],
  ["app/register/provider/page.tsx", "bg-white text-royal", `${ON_BAND}: the current step in the green side panel`],
  // inverted primary buttons
  ["app/dashboard/government/page.tsx", "bg-white text-zinc-950 hover:bg-slate-200", INVERTED],
  ["app/dashboard/ngo/page.tsx", "bg-white text-zinc-950 hover:bg-slate-200", INVERTED],
  // must stay white
  ["app/dashboard/lawyer/_components/ShareProfileModal.tsx", "w-28 h-28 flex-shrink-0 rounded-xl bg-white p-1.5", "the QR code's quiet zone: scanners need dark modules on white"],
  ["components/payments/MoyasarCheckout.tsx", "nz-moyasar-surface", "Moyasar's card form keeps its own light styling: an always-light surface in both themes"],
  // unmounted
  ["app/dashboard/client/cases/_components/NewCaseModal/index.tsx", null, "unmounted: the client cases page links to the request catalogue instead (see the comment there)"],
  ["app/dashboard/client/cases/_components/NewCaseModal/DirectTrack.tsx", null, "unmounted: only NewCaseModal renders it"],
  ["app/dashboard/client/cases/_components/NewCaseModal/ConsultTrack.tsx", null, "unmounted: only NewCaseModal renders it"],
];

const ADMIN_ONLY = ["components/admin/AdminSidebar.tsx"];

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (name.endsWith(".tsx")) out.push(relative(SRC, p).split("\\").join("/"));
  }
  return out;
}
const ALL_TSX = tsxFiles(SRC);
const SCANNED = ALL_TSX.filter((f) => !f.startsWith("app/dashboard/admin/") && !ADMIN_ONLY.includes(f));
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

const allowed = (f: DarkModeFinding) => ALLOW.some(([file, needle]) => file === f.file && (needle === null || f.text.includes(needle)));

test("the scanner: light surfaces, light borders and invisible text; variants and overlays pass", () => {
  assert.deepEqual(classFindings("rounded bg-white p-4"), ["white"]);
  assert.deepEqual(classFindings("bg-white/80 backdrop-blur"), ["white"]);
  assert.deepEqual(classFindings("bg-[#f9fafb] min-h-screen"), ["white"]);
  assert.deepEqual(classFindings("bg-amber-50 text-amber-700"), ["panel"]);
  assert.deepEqual(classFindings("bg-red-100"), ["panel"]);
  assert.deepEqual(classFindings("border border-amber-200"), ["border"]);
  assert.deepEqual(classFindings("text-gray-200 font-bold"), ["invisible"]);
  assert.deepEqual(classFindings("dark:text-slate-200"), ["invisible"]);
  for (const ok of [
    "bg-white dark:bg-dark-card",
    "hover:bg-white print:bg-white",
    "bg-white/10 bg-white/5 bg-white/[0.03]",
    "bg-[#0c0f12] bg-[#C8A762]",
    "bg-gray-50 bg-slate-50 bg-emerald-50 bg-sky-50 border-gray-200 border-slate-200",
    "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20",
    "border-zinc-200/5",
    "text-zinc-200 text-gray-300 text-gray-200 dark:text-zinc-200",
  ]) assert.deepEqual(classFindings(ok), [], ok);
});

test("the scanner: light-theme-only strings are not dark-mode surfaces", () => {
  const at = (code: string, needle: string) => code.indexOf(needle) - 1;
  const cases: [string, string, boolean][] = [
    ['className={isDark ? "bg-zinc-900" : "bg-white"}', '"bg-white"', true],
    ['className={isDark ? "bg-white" : "bg-zinc-900"}', '"bg-white"', false],
    ['className={!isDark ? "bg-white" : "bg-zinc-900"}', '"bg-white"', true],
    ['className={`p-4 ${isDark ? (a || "bg-zinc-900") : (b || "bg-white")}`}', '"bg-white"', true],
    ['className={`${on ? "x" : isDark ? "bg-zinc-900" : "bg-white"}`}', '"bg-white"', true],
    ['className={`${D ? "bg-zinc-900" : "bg-white"}`}', '"bg-white"', true],
    ['{!isDark && "bg-white"}', '"bg-white"', true],
    ['const M = { a: { light: "bg-amber-50", dark: "bg-amber-500/10" } }', '"bg-amber-50"', true],
    ['const M = { a: { badgeL: "bg-amber-50", badgeD: "x" } }', '"bg-amber-50"', true],
    ['const s = (dark: string, light: string) => isDark ? dark : light;\nconst c = s("bg-zinc-900", "bg-white");', '"bg-white"', true],
    ['className={cn("bg-white", isDark && "ring")}', '"bg-white"', false],
    ['className="bg-white"', '"bg-white"', false],
  ];
  for (const [code, needle, want] of cases) assert.equal(lightOnly(code, at(code, needle) + 1), want, code);
});

test("the admin console is exempt only because it is dark whatever the site theme is", () => {
  const layout = stripComments(read("app/dashboard/admin/layout.tsx"));
  assert.match(layout, /import \{ ForceDarkTheme \} from "@\/components\/ThemeProvider"/);
  assert.match(layout, /return \(\s*<ForceDarkTheme>[\s\S]*<\/ForceDarkTheme>\s*\);/);
  const root = /<div className="([^"]*bg-\[#0a0a0f\][^"]*)"/.exec(layout);
  assert.ok(root, "the console root");
  assert.ok(root[1].split(/\s+/).includes("dark"), "the console root carries the dark class");
  for (const file of ADMIN_ONLY) {
    const name = file.split("/").pop()!.replace(/\.tsx$/, "");
    const importers = ALL_TSX.filter((f) => f !== file && new RegExp(`from ["'][^"']*/${name}["']`).test(read(f)));
    assert.deepEqual(importers.filter((f) => !f.startsWith("app/dashboard/admin/")), [], `${file} is mounted outside the console`);
  }
});

test("every allow-list entry is still needed, and whole-file entries are unmounted", () => {
  const raw = SCANNED.flatMap((f) => scanSource(f, read(f)));
  for (const [file, needle, why] of ALLOW) {
    assert.ok(why.length > 10, `${file}: a reason`);
    assert.ok(raw.some((f) => f.file === file && (needle === null || f.text.includes(needle))), `stale allow-list entry: ${file}: ${needle}`);
    if (needle === null) {
      const dir = file.slice(0, file.lastIndexOf("/"));
      const base = file.endsWith("/index.tsx") ? dir.split("/").pop()! : file.split("/").pop()!.replace(/\.tsx$/, "");
      const importers = ALL_TSX.filter((f) => !f.startsWith(dir + "/") && new RegExp(`from ["'][^"']*/${base}["']`).test(read(f)));
      assert.deepEqual(importers, [], `${file} is exempt as unmounted but is imported`);
    }
  }
});

test("no page outside the admin console paints a light surface, a light border or invisible text in dark mode", () => {
  const findings = SCANNED.flatMap((f) => scanSource(f, read(f))).filter((f) => !allowed(f));
  assert.deepEqual(findings.map((f) => `${f.file}:${f.line} [${f.kind}] ${f.text.trim()}`), []);
});

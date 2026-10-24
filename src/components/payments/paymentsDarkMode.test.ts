/**
 * paymentsDarkMode.test.ts — no payments surface paints a light panel in dark
 * mode (payments UX fixes, 2026-10-25: the tester found white cards, cream
 * notices and black-on-black card fields).
 *
 * For every class string in the files below:
 *   - `bg-white` (or `bg-white/50`…`/100`, `bg-[#fff]`, `bg-[#ffffff]`) and the
 *     light `bg-<hue>-50` panels need a `dark:bg-*` in the same string;
 *   - `border-slate-200` / `border-amber-200`… need a `dark:border-*`;
 *   - dark text (`text-zinc-900`, `text-amber-800`…) needs a `dark:text-*`;
 *   - `text-gray-100` / `text-gray-200` are banned outright: globals.css turns
 *     gray-50/100/200 into dark SURFACES, so that text is invisible.
 * A variant-prefixed token (`print:bg-white`, `hover:bg-red-50`) is not a
 * surface and is not matched. The light branch of an `isDark ? "…" : "…"`
 * ternary is the light theme by construction. The rest is the allow-list
 * below, one reason each.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");

const FILES = [
  "app/checkout/page.tsx",
  "components/payments/MoyasarCheckout.tsx",
  "app/payments/result/page.tsx",
  "components/payments/ResultAutoRefresh.tsx",
  "app/dashboard/billing/page.tsx",
  "components/payments/BillingControls.tsx",
  "app/dashboard/billing/receipt/[orderId]/page.tsx",
  "app/settings/components/tabs/SubscriptionTab.tsx",
  "app/settings/components/tabs/PaymentsTab.tsx",
  "components/payments/PointsBalanceCard.tsx",
  "app/dashboard/admin/subscriptions/orders/page.tsx",
  "app/dashboard/admin/settings/page.tsx",
  "components/pricing/PricingCards.tsx",
];

/** Deliberate light surfaces: [file, a substring of the class string, why]. */
const ALLOW: [string, string, string][] = [
  ["components/payments/MoyasarCheckout.tsx", "nz-moyasar-surface", "Moyasar's card form keeps its own light styling: an always-light surface in both themes (item 2)"],
  ["components/pricing/PricingCards.tsx", "bg-white text-[#0B3D2E] shadow-[0_4px_20px_-4px_rgba(255,255,255,0.3)]", "the white CTA on the highlighted (dark green) plan card"],
];

function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => (line.trimStart().startsWith("//") ? "" : line))
    .join("\n");
}

/**
 * Every string a class can live in, with its start offset: "…" and '…'
 * literals, and the static text of `…` templates — each `${…}` inside a
 * template is scanned on its own, so a ternary's two branches are two strings.
 */
function literals(code: string): { text: string; at: number }[] {
  const out: { text: string; at: number }[] = [];
  function scan(from: number, to: number) {
    let i = from;
    while (i < to) {
      const c = code[i];
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < to && code[j] !== c && code[j] !== "\n") j += code[j] === "\\" ? 2 : 1;
        if (code[j] === c) out.push({ text: code.slice(i + 1, j), at: i });
        i = j + 1;
      } else if (c === "`") {
        let j = i + 1;
        let text = "";
        while (j < to && code[j] !== "`") {
          if (code[j] === "$" && code[j + 1] === "{") {
            let depth = 1;
            let k = j + 2;
            while (k < to && depth > 0) {
              if (code[k] === "{") depth++;
              else if (code[k] === "}") depth--;
              k++;
            }
            scan(j + 2, k - 1);
            text += " ";
            j = k;
          } else {
            text += code[j];
            j++;
          }
        }
        out.push({ text, at: i });
        i = j + 1;
      } else {
        i++;
      }
    }
  }
  scan(0, code.length);
  return out;
}

const tok = (body: string) => new RegExp(`(?<![\\w:/\\[-])${body}(?![\\w/\\-\\]])`);
const WHITE = /(?<![\w:/[-])bg-(?:white(?:\/(?:[5-9]\d|100))?|\[#fff(?:fff)?\])(?![\w\-\]]|\/(?:\d|\[))/i;
const LIGHT_PANEL = tok("bg-(?:amber|red|emerald|sky|zinc|slate|gray|green|yellow|orange|blue)-50(?:\\/\\d+)?");
const LIGHT_BORDER = tok("border-(?:slate|amber|red|emerald|sky|gray)-200(?:\\/\\d+)?");
const DARK_TEXT = tok("text-(?:zinc|slate|gray|neutral|amber|red|emerald|sky|green)-(?:700|800|900|950)");
const INVISIBLE_TEXT = /(?<![\w:/[-])text-gray-(?:100|200)(?![\w-])/;

function isLightTernaryBranch(code: string, at: number): boolean {
  const before = code.slice(Math.max(0, at - 400), at);
  return /:\s*$/.test(before) && /isDark\s*\?/.test(before);
}

function findings(file: string): string[] {
  const code = stripComments(readFileSync(join(ROOT, file), "utf8"));
  const out: string[] = [];
  for (const { text, at } of literals(code)) {
    if (INVISIBLE_TEXT.test(text)) out.push(`${file}: invisible dark-mode text in "${text}"`);
    const allowed = ALLOW.some(([f, s]) => f === file && text.includes(s)) || isLightTernaryBranch(code, at);
    if (allowed) continue;
    if ((WHITE.test(text) || LIGHT_PANEL.test(text)) && !/(?<![\w-])dark:bg-/.test(text)) out.push(`${file}: light surface without dark:bg- in "${text}"`);
    if (LIGHT_BORDER.test(text) && !/(?<![\w-])dark:border-/.test(text)) out.push(`${file}: light border without dark:border- in "${text}"`);
    if (DARK_TEXT.test(text) && !/(?<![\w-])dark:text-/.test(text)) out.push(`${file}: dark text without dark:text- in "${text}"`);
  }
  return out;
}

test("the scanner itself: matches surfaces, skips variants and translucent overlays", () => {
  assert.ok(WHITE.test("rounded bg-white p-4"));
  assert.ok(WHITE.test("bg-white/80 backdrop-blur"));
  assert.ok(WHITE.test("bg-[#fff] p-2"));
  for (const s of ["print:bg-white", "hover:bg-white", "bg-white/10", "bg-white/5", "bg-white/[0.03]", "dark:bg-white"]) assert.ok(!WHITE.test(s), s);
  assert.ok(LIGHT_PANEL.test("bg-amber-50 p-3"));
  assert.ok(LIGHT_PANEL.test("bg-amber-50/80"));
  assert.ok(!LIGHT_PANEL.test("hover:bg-red-50"));
  assert.ok(!LIGHT_PANEL.test("bg-amber-500"));
  assert.ok(INVISIBLE_TEXT.test("text-gray-200 font-bold"));
  assert.ok(!INVISIBLE_TEXT.test("dark:text-gray-200"));
});

test("every allow-list entry still matches a class string (no stale exemptions)", () => {
  for (const [file, needle] of ALLOW) {
    assert.ok(stripComments(readFileSync(join(ROOT, file), "utf8")).includes(needle), `${file}: ${needle}`);
  }
});

test("no payments surface paints a light panel, a light border or invisible text in dark mode", () => {
  const all = FILES.flatMap(findings);
  assert.deepEqual(all, []);
});

test("the Moyasar form renders into an always-light surface: white, dark text, color-scheme light", () => {
  const form = stripComments(readFileSync(join(ROOT, "components/payments/MoyasarCheckout.tsx"), "utf8"));
  const wrapper = /<div\s+data-light-surface\s+className="([^"]*)"\s+style=\{\{ colorScheme: "light" \}\}\s*>\s*<div className="mysr-form" \/>/.exec(form);
  assert.ok(wrapper, "the wrapper directly around .mysr-form");
  for (const cls of ["nz-moyasar-surface", "bg-white", "text-zinc-900", "[color-scheme:light]"]) {
    assert.ok(wrapper[1].split(/\s+/).includes(cls), cls);
  }
  assert.doesNotMatch(wrapper[1], /dark:bg-|dark:text-/, "the form area does not follow the theme");
  // the scoped rules that undo globals.css's `.dark input` colours inside it
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  assert.match(css, /\.nz-moyasar-surface \{\s*color-scheme: light;\s*background-color: #ffffff;\s*color: #18181b;\s*\}/);
  assert.match(css, /\.dark \.nz-moyasar-surface input,\s*\.dark \.nz-moyasar-surface textarea,\s*\.dark \.nz-moyasar-surface select \{\s*background-color: #ffffff !important;\s*color: #1a1a1a !important;/);
  assert.match(css, /\.dark \.nz-moyasar-surface input::placeholder,\s*\.dark \.nz-moyasar-surface textarea::placeholder \{\s*color: #9ca3af !important;/);
  // the scoped rules come after the site-wide dark input rule they override
  assert.ok(css.indexOf(".dark .nz-moyasar-surface input,") > css.indexOf(".dark input,\n.dark textarea {"));
});

test("the admin console pages stay dark whatever the site theme is (the console shell is dark-only)", () => {
  const layout = readFileSync(join(ROOT, "app/dashboard/admin/layout.tsx"), "utf8");
  assert.match(layout, /bg-\[#0a0a0f\]/, "the premise: the console shell is always dark");
  const settings = stripComments(readFileSync(join(ROOT, "app/dashboard/admin/settings/page.tsx"), "utf8"));
  assert.doesNotMatch(settings, /useTheme/);
  assert.match(settings, /const isDark = true;/);
  assert.equal((settings.match(/<div className="dark p-6 md:p-10 [^"]*\[color-scheme:dark\]" dir="rtl">/g) ?? []).length, 2, "loading and loaded roots");
  const orders = stripComments(readFileSync(join(ROOT, "app/dashboard/admin/subscriptions/orders/page.tsx"), "utf8"));
  assert.match(orders, /return <div dir="rtl" className="dark [^"]*\[color-scheme:dark\]/);
});

test("the receipt prints black on white, also when printed from dark mode", () => {
  const receipt = stripComments(readFileSync(join(ROOT, "app/dashboard/billing/receipt/[orderId]/page.tsx"), "utf8"));
  // a print: variant loses to dark: on the same property; the important form wins
  assert.match(receipt, /<main[^>]*dark:text-zinc-100[^>]*print:text-black!/);
  assert.match(receipt, /<article[^>]*print:text-black!/);
  assert.match(receipt, /const NOTICE = "[^"]*dark:bg-amber-500\/10 dark:text-amber-300[^"]*print:text-black!"/);
  for (const m of receipt.matchAll(/className="([^"]*)"/g)) {
    if (/(?<![\w-])dark:text-/.test(m[1]) && !/print:hidden/.test(m[1])) assert.match(m[1], /print:text-[^\s"]+!/, m[1]);
  }
});

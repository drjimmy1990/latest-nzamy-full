/**
 * liveClaims.test.ts — Wave 1 task 6 (owner package of 1 Nov 2026, slice D
 * "honesty defects"): claims on live pages that nothing behind them backs.
 *
 * Source-level: each test reads the file the visitor's screen is built from
 * and fails if the false sentence comes back.
 *
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/services/liveClaims.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

// ── §3.3b-8a: the template library has no AI behind it ───────────────────────

test("templates: no «AI-powered» / «AI مُحسَّن» claim and no isAi flag", () => {
  const page = src("app/ai/templates/page.tsx");
  const data = src("app/ai/templates/_data.tsx");
  assert.doesNotMatch(page, /AI-powered|AI مُحسَّن|AI محسن/);
  assert.doesNotMatch(page, /\.isAi\b/);
  assert.doesNotMatch(data, /isAi\s*:/, "a template still carries an «AI» flag");
  // The templates themselves stay.
  assert.ok((data.match(/\bid: "t\d+"/g) ?? []).length >= 40, "the template list was emptied");
});

// ── §3.3b-8c: the debt-collection notice composer ────────────────────────────

test("debt collection: the friendly notice asks for what is owed TO us, not by us", () => {
  const page = src("app/ai/debt-collection/page.tsx");
  assert.doesNotMatch(page, /المستحق علينا/);
  assert.match(page, /المبلغ المستحق لنا/);
});

test("debt collection: no notice calls itself an accredited legal instrument", () => {
  const page = src("app/ai/debt-collection/page.tsx");
  assert.doesNotMatch(page, /سنداً قانونياً معتمداً|سند قانوني معتمد/);
  assert.doesNotMatch(page, /جهة قانونية معتمدة|مكتب محاماة معتمد|مكتب قانوني معتمد/);
  assert.doesNotMatch(page, /نموذج جاهز للتقديم/);
  // It says what it is: a draft to review.
  assert.match(page, /مسودة إشعار؛ راجعها قبل إرسالها/);
  assert.match(page, /مسودة إنذار؛ راجعها قبل إرسالها/);
});

/**
 * _ai-reply.test.ts — what the library assistant tells a guest, a free user and
 * a rate-limited caller. Run with:
 *   node --test "src/app/laws/?slug?/_ai-reply.test.ts"   (a literal [slug] is a glob class)
 *
 * Two halves, like src/app/api/v1/profile/route.test.ts:
 *   1. the decision, through the pure ./_ai-reply.ts;
 *   2. the wiring in ./_ai-components.tsx (a client component that imports
 *      next/link and framer-motion), asserted against its source.
 * The statuses come from src/app/api/ai/_libraryAiAccess.ts (401 / 403) and the
 * route's own rate limit (429); src/app/api/ai/library-ai-access.test.ts pins
 * that side.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { libraryAiRefusal } from "./_ai-reply.ts";

const componentSource = readFileSync(new URL("./_ai-components.tsx", import.meta.url), "utf8");
const replySource = readFileSync(new URL("./_ai-reply.ts", import.meta.url), "utf8");

test("a guest (401) is sent to sign in and brought back to the page they asked from", () => {
  const refusal = libraryAiRefusal(401, "/laws/نظام-الشركات?tab=ai");
  assert.ok(refusal?.action);
  assert.equal(refusal.action.label, "تسجيل الدخول");
  assert.equal(
    refusal.action.href,
    `/login?next=${encodeURIComponent("/laws/نظام-الشركات?tab=ai")}`,
  );
  // The query string survives as one `next` value, not as extra /login params.
  assert.equal(new URL(refusal.action.href, "https://x.test").searchParams.get("next"), "/laws/نظام-الشركات?tab=ai");
  assert.match(refusal.text, /سجّل الدخول/);
  // The assistant is not part of the library subscription (owner ٢٠٧); the
  // guest is told that, and is not told which plan to buy.
  assert.equal(refusal.text, "سجّل الدخول لتستخدم مساعد المكتبة.\nاشتراك المكتبة يشمل النصوص دون المساعد.");
});

test("a signed-in user below pro (403) is told the plan does not include it and shown the plans", () => {
  const refusal = libraryAiRefusal(403, "/precedents/x");
  assert.ok(refusal);
  // A library-only subscriber gets this 403 too (owner ٢٠٧): the text says the
  // library subscription covers the texts, not the assistant, and the link goes
  // to the plans page, not back to the library subscription they already have.
  // It names no plan: /pricing shows lawyers «المحامي المحترف» and everyone
  // else the individuals tab, so no plan there reads "Pro".
  assert.equal(
    refusal.text,
    "المساعد الذكي للمكتبة غير مشمول في اشتراكك الحالي؛ اشتراك المكتبة يشمل النصوص دون المساعد.",
  );
  assert.deepEqual(refusal.action, { label: "عرض الباقات", href: "/pricing" });
  assert.doesNotMatch(refusal.text, /مشتركي المكتبة|قيد التفعيل/);
  // /pricing is the plans page (src/app/pricing/page.tsx). It reads no query
  // parameter, so the link carries none.
  assert.ok(existsSync(new URL("../../pricing/page.tsx", import.meta.url)), "src/app/pricing/page.tsx");
});

test("no refusal names a plan or calls the assistant a library-subscriber feature", () => {
  // The refusals as shown, and every string literal in the module (comments
  // stripped), so a branch added later is covered too.
  for (const status of [401, 403, 429]) {
    const refusal = libraryAiRefusal(status, "/laws/x");
    assert.ok(refusal);
    for (const text of [refusal.text, refusal.action?.label ?? ""]) {
      assert.doesNotMatch(text, /باقة Pro|لمشتركي المكتبة|\bPro\b/, text);
    }
  }
  const code = replySource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /باقة Pro|لمشتركي المكتبة/);
});

test("the rate limit (429) says to wait, with no link", () => {
  const refusal = libraryAiRefusal(429, "/laws/x");
  assert.equal(refusal?.text, "طلبات كثيرة خلال وقت قصير — حاول مجدداً بعد قليل.");
  assert.equal(refusal?.action, undefined);
});

test("not configured, library closed and server errors fall through to the caller's wording", () => {
  for (const status of [400, 500, 502, 503, 504]) {
    assert.equal(libraryAiRefusal(status, "/laws/x"), null, String(status));
  }
});

test("the new copy is Arabic, with no Latin letters (it names no plan)", () => {
  for (const status of [401, 403, 429]) {
    const refusal = libraryAiRefusal(status, "/laws/x");
    assert.ok(refusal);
    for (const text of [refusal.text, refusal.action?.label ?? "ـ"]) {
      assert.match(text, /[؀-ۿ]/, text);
      assert.doesNotMatch(text, /[A-Za-z]/, text);
    }
  }
});

test("LibraryAI asks libraryAiRefusal on a non-ok answer and keeps «قيد التفعيل» otherwise", () => {
  assert.match(componentSource, /import \{ libraryAiRefusal, type LibraryAiAction \} from "\.\/_ai-reply";/);
  const start = componentSource.indexOf("export function LibraryAI(");
  const end = componentSource.indexOf("export function ArticleExplainModal(");
  assert.ok(start > -1 && end > start);
  const libraryAi = componentSource.slice(start, end);

  assert.match(
    libraryAi,
    /const refusal = libraryAiRefusal\(res\.status, window\.location\.pathname \+ window\.location\.search\);\s*if \(refusal\) \{\s*reply = refusal\.text;\s*action = refusal\.action;\s*\} else \{\s*reply = isRTL\s*\?\s*"الذكاء الاصطناعي قيد التفعيل وقريباً سيتوفر\./,
  );
  // The refusal is decided only on the non-ok arm, after the fetch.
  assert.ok(libraryAi.indexOf("if (res.ok) {") < libraryAi.indexOf("const refusal = libraryAiRefusal("));
  // The action reaches the message and is rendered as a link.
  assert.match(libraryAi, /setMsgs\(m => \[\.\.\.m, \{ role: "ai", text: reply, action \}\]\);/);
  assert.match(libraryAi, /\{m\.action && \(\s*<Link href=\{m\.action\.href\}[^>]*>\s*\{m\.action\.label\}\s*<\/Link>\s*\)\}/);
});

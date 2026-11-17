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
  // The library subscription opens the assistant (owner ٥ / ١٥, replacing ٢٠٧);
  // every question is paid in points. No plan is named.
  assert.equal(refusal.text, "سجّل الدخول لتستخدم مساعد المكتبة.\nيفتحه اشتراك المكتبة، وكل سؤال بنقاط.");
});

test("a signed-in user without access (403) is told the library subscription opens it and linked to it", () => {
  const refusal = libraryAiRefusal(403, "/precedents/x");
  assert.ok(refusal);
  // Owner ٥ / ١٥ (17 Nov 2026, replacing ٢٠٧): an active library subscription
  // opens the assistant, so a 403 means the caller has none; the link goes to
  // the library subscription page. It names no plan.
  assert.equal(
    refusal.text,
    "المساعد الذكي للمكتبة غير مشمول في اشتراكك الحالي؛ يفتحه اشتراك المكتبة، وكل سؤال بنقاط.",
  );
  assert.deepEqual(refusal.action, { label: "اشترك في المكتبة", href: "/laws/subscribe" });
  assert.doesNotMatch(refusal.text, /مشتركي المكتبة|قيد التفعيل/);
  assert.ok(existsSync(new URL("../subscribe/page.tsx", import.meta.url)), "src/app/laws/subscribe/page.tsx");
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

test("LibraryAI and «اشرح لي» ask the pipeline through askLibrary, and show its refusal's link", () => {
  // Wave 2 L5: both call /api/v1/ai/runs via _library-assistant.ts, which maps
  // 401 / 403 library_tier to libraryAiRefusal (library-assistant.test.ts).
  assert.match(componentSource, /import \{ askLibrary \} from "\.\/_library-assistant";/);
  assert.doesNotMatch(componentSource, /\/api\/ai\/library-chat|\/api\/ai\/explain-article/);
  const start = componentSource.indexOf("export function LibraryAI(");
  const end = componentSource.indexOf("export function ArticleExplainModal(");
  assert.ok(start > -1 && end > start);
  const libraryAi = componentSource.slice(start, end);
  const explain = componentSource.slice(end);

  assert.match(libraryAi, /await askLibrary\(\{ message: query \}, window\.location\.pathname \+ window\.location\.search\);/);
  assert.match(explain, /await askLibrary\(\s*\{ message: query, articleId: article\.id \},\s*window\.location\.pathname \+ window\.location\.search,\s*\);/);
  for (const part of [libraryAi, explain]) {
    // The action reaches the message and is rendered as a link.
    assert.match(part, /setMsgs\(m => \[\.\.\.m, \{ role: "ai", text: reply, action, cites \}\]\);/);
    assert.match(part, /\{m\.action && \(\s*<Link href=\{m\.action\.href\}[^>]*>\s*\{m\.action\.label\}\s*<\/Link>\s*\)\}/);
  }
});

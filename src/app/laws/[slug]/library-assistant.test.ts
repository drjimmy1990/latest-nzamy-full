/**
 * library-assistant.test.ts — the law page's one call to the library
 * assistant: what it sends, and what each answer of the run route becomes.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test "src/app/laws/[slug]/library-assistant.test.ts"
 */
import test from "node:test";
import assert from "node:assert/strict";
import { askLibrary, LIBRARY_AI_SOON } from "./_library-assistant.ts";

function reply(status: number, body: unknown) {
  const sent: Array<Record<string, unknown>> = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fetchImpl, sent };
}

test("it sends the tool, the message, the open article and a fresh key", async () => {
  const { fetchImpl, sent } = reply(200, { output: { reply: "شرح [S1]" }, citations: [{ sid: "S1" }] });
  const a = await askLibrary({ message: "اشرح لي", articleId: "labor-law__art-80" }, "/laws/labor-law", fetchImpl);
  assert.deepEqual(a, { text: "شرح [S1]", citations: [{ sid: "S1" }] });
  assert.equal(sent[0].tool, "library-assistant");
  assert.deepEqual(sent[0].input, { message: "اشرح لي", article_id: "labor-law__art-80" });
  assert.match(String(sent[0].idempotencyKey), /^[A-Za-z0-9_-]{8,100}$/);

  await askLibrary({ message: "سؤال" }, "/laws/x", fetchImpl);
  assert.equal((sent[1].input as Record<string, unknown>).article_id, null);
});

test("signed out and below Pro are told what to do, with a link", async () => {
  const out = await askLibrary({ message: "س" }, "/laws/a?x=1", reply(401, { error: "سجّل الدخول" }).fetchImpl);
  assert.equal(out.action?.href, "/login?next=%2Flaws%2Fa%3Fx%3D1");
  const tier = await askLibrary({ message: "س" }, "/laws/a", reply(403, { error: "يتطلب Pro", code: "library_tier" }).fetchImpl);
  assert.equal(tier.action?.href, "/pricing");
});

test("a tool that is off reads «قيد التفعيل»; the server's own refusal is shown as it is", async () => {
  assert.equal((await askLibrary({ message: "س" }, "/", reply(423, { error: "off", code: "tool_off" }).fetchImpl)).text, LIBRARY_AI_SOON);
  const none = await askLibrary({ message: "س" }, "/", reply(422, { error: "لم أجد في مكتبة الأنظمة…", code: "no_sources" }).fetchImpl);
  assert.deepEqual(none, { text: "لم أجد في مكتبة الأنظمة…", citations: [] });
});

test("a network failure is a plain error, never an invented reply", async () => {
  const fetchImpl = (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
  const out = await askLibrary({ message: "س" }, "/", fetchImpl);
  assert.equal(out.citations.length, 0);
  assert.match(out.text, /تعذّر/);
});

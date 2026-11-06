/**
 * toolStatusClient.test.ts — what a screen makes of GET /api/v1/ai/tool-status.
 * R31 and S3-07: only a 200 that says usable counts. Everything else is "not usable",
 * so a screen shows no price and no form on any doubt.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/toolStatusClient.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readToolUsable, toolStatusUrl } from "./toolStatusClient.ts";

const reply = (status: number, body: unknown) => async () =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

test("a 200 that says usable is the only yes", async () => {
  assert.equal(await readToolUsable("contract-review", reply(200, { usable: true })), true);
});

test("every other answer is no: refused, frozen, signed out, limited, broken, or a yes in another shape", async () => {
  const no: Array<[string, () => Promise<Response>]> = [
    ["usable false", reply(200, { usable: false })],
    ["401 signed out", reply(401, { error: "x" })],
    ["403 frozen, even saying usable", reply(403, { usable: true })],
    ["400 unknown tool", reply(400, { code: "unknown_tool" })],
    ["429", reply(429, { usable: true })],
    ["500", reply(500, { usable: true })],
    ["a 201 is not the route's answer", reply(201, { usable: true })],
    ["not JSON", reply(200, "<html>")],
    ["a truthy non-boolean", reply(200, { usable: "true" })],
    ["a number", reply(200, { usable: 1 })],
    ["no field", reply(200, {})],
    ["null body", reply(200, "null")],
    ["a network error", async () => { throw new TypeError("failed to fetch"); }],
  ];
  for (const [name, f] of no) assert.equal(await readToolUsable("contract-review", f as never, async () => {}), false, name);
});

test("it asks the real route, for that tool, and the browser may not cache the answer", async () => {
  assert.equal(toolStatusUrl("contract-review"), "/api/v1/ai/tool-status?tool=contract-review");
  const seen: Array<[string, RequestInit | undefined]> = [];
  await readToolUsable("contract-negotiator", (async (url: string, init?: RequestInit) => {
    seen.push([url, init]);
    return new Response("{}", { status: 200 });
  }) as never);
  assert.equal(seen[0][0], "/api/v1/ai/tool-status?tool=contract-negotiator");
  assert.equal(seen[0][1]?.cache, "no-store");
});

test("the hook starts unknown, and leaves a late answer out after unmount", () => {
  const hook = readFileSync(join(process.cwd(), "src/hooks/useToolUsable.ts"), "utf8");
  assert.match(hook, /useState<boolean \| null>\(null\)/);
  assert.match(hook, /readToolUsable\(tool\)/);
  assert.match(hook, /live = false/);
});

test("a limit is not a no: one wait for Retry-After, one more ask, and the second answer decides", async () => {
  const replies = [new Response("{}", { status: 429, headers: { "Retry-After": "7" } }), new Response(JSON.stringify({ usable: true }), { status: 200 })];
  const waits: number[] = [];
  let asked = 0;
  const yes = await readToolUsable("quick-answer", (async () => { asked += 1; return replies.shift()!; }) as never, async (ms) => { waits.push(ms); });
  assert.equal(yes, true);
  assert.equal(asked, 2);
  assert.deepEqual(waits, [7000]);
});

test("a second limit stays closed (no price on a doubt), and only one retry is ever made", async () => {
  let asked = 0;
  const waits: number[] = [];
  const answer = await readToolUsable("quick-answer", (async () => { asked += 1; return new Response(JSON.stringify({ usable: true }), { status: 429 }); }) as never, async (ms) => { waits.push(ms); });
  assert.equal(answer, false);
  assert.equal(asked, 2);
  assert.equal(waits.length, 1);
});

test("Retry-After is capped at the bucket's minute; nonsense waits a second; other refusals are not retried", async () => {
  const waitFor = async (retryAfter: string) => {
    const waits: number[] = [];
    await readToolUsable("quick-answer", (async () => new Response("{}", { status: 429, headers: { "Retry-After": retryAfter } })) as never, async (ms) => { waits.push(ms); });
    return waits[0];
  };
  assert.equal(await waitFor("86400"), 60_000);
  assert.equal(await waitFor("soon"), 1000);
  let asked = 0;
  await readToolUsable("quick-answer", (async () => { asked += 1; return new Response("{}", { status: 503 }); }) as never, async () => { throw new Error("no wait"); });
  assert.equal(asked, 1);
});

/**
 * aiDeviceCheck.routes.test.ts — l19 review B2 (owner ٢٣٣: «المساعد الذكي،
 * أدوات AI»): the AI run route, the free-question status and the site
 * assistant apply the account device rule (enforceLibraryDevice, the gate the
 * library uses), right after the user is known and before anything is read,
 * charged or answered. Switch off = no effect and fail-open are the gate's own
 * (accountDeviceGate.test.ts, device-limit.routes.test.ts); this file holds
 * the routes to calling it. Source contract (regex over the files).
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/devices/aiDeviceCheck.routes.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const IMPORT = 'import { enforceLibraryDevice } from "@/lib/library/deviceLimitServer";';

test("POST /api/v1/ai/runs: device-checked right after sign-in, before the body, the reads and the charge", () => {
  const src = read("app/api/v1/ai/runs/route.ts");
  assert.ok(src.includes(IMPORT));
  const post = src.slice(src.indexOf("export async function POST"));
  const auth = post.indexOf("const { user } = auth;");
  const call = post.indexOf("const deviceRefusal = await enforceLibraryDevice(user.id, true);");
  assert.ok(auth > 0 && call > auth, "after the user is known");
  assert.ok(post.slice(call, call + 160).includes("if (deviceRefusal) return deviceRefusal;"));
  assert.ok(call < post.indexOf("await request.json()"), "before the body is read");
  assert.ok(call < post.indexOf("startRunWith("), "before the run is started and charged");
  assert.equal(src.match(/enforceLibraryDevice\(/g)?.length, 1, "called once");
});

test("GET /api/v1/ai/free-question: device-checked after sign-in, before the count is read", () => {
  const src = read("app/api/v1/ai/free-question/route.ts");
  assert.ok(src.includes(IMPORT));
  const call = src.indexOf("const deviceRefusal = await enforceLibraryDevice(auth.user.id, true);");
  assert.ok(call > src.indexOf("if (auth instanceof NextResponse) return auth;"));
  assert.ok(src.slice(call, call + 160).includes("if (deviceRefusal) return deviceRefusal;"));
  assert.ok(call < src.indexOf("freeQuestionStatusWith(admin"));
});

test("POST /api/v1/chatbot: a signed-in viewer is device-checked before the answer; a guest never", () => {
  const src = read("app/api/v1/chatbot/route.ts");
  assert.ok(src.includes(IMPORT));
  const call = src.indexOf("const deviceRefusal = await enforceLibraryDevice(viewer.id, true);");
  assert.ok(call > 0);
  assert.match(src.slice(call - 40, call), /if \(viewer\) \{\s*$/, "only when signed in");
  assert.ok(src.slice(call, call + 120).includes("if (deviceRefusal) return deviceRefusal;"));
  assert.ok(call < src.indexOf("answerMessage(message, feed)"));
  // the feed still sees the viewer only for the two intents that need him
  assert.match(src, /if \(!needs\.sale && !needs\.offers\) viewer = null;/);
});

test("the refusal is the account rule's own 403 (never a free pass, never a body-supplied user)", () => {
  const server = read("lib/library/deviceLimitServer.ts");
  assert.match(server, /accountDeviceOutcome\(\{/);
  assert.match(server, /NextResponse\.json\(accountDeviceRefusalBody\(\), \{\s*status: 403,/);
  for (const f of ["app/api/v1/ai/runs/route.ts", "app/api/v1/ai/free-question/route.ts", "app/api/v1/chatbot/route.ts"]) {
    assert.doesNotMatch(read(f), /enforceLibraryDevice\([^)]*body/, f);
  }
});

/**
 * route.test.ts — source contract for POST /api/v1/payments/webhook
 * (Moyasar payments B1, Task 6). The route only parses JSON and wires the
 * real dependencies into handleWebhookWith, whose behaviour is executed in
 * src/lib/payments/webhookCore.test.ts (secret, duplicates, retries,
 * outcomes) and webhookCheck.test.ts (the check itself).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isGeneralRateLimitedApiPath } from "../../../../../lib/rateLimitRoutes.ts";

const routeSource = readFileSync(join(import.meta.dirname, "route.ts"), "utf8");

function codeOnly(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("//");
    })
    .join("\n");
}

const code = codeOnly(routeSource);

test("the route hands the real dependencies to handleWebhookWith", () => {
  assert.match(code, /handleWebhookWith\(\s*\{\s*admin: createServiceClient,\s*fulfill: fulfillOrder,\s*webhookSecret: process\.env\.MOYASAR_WEBHOOK_SECRET,\s*secretKey: process\.env\.MOYASAR_SECRET_KEY,\s*\},\s*body,\s*\)/);
  // the service client is passed, not built, so the handler builds it only after the secret check
  assert.doesNotMatch(code, /createServiceClient\(\)/);
  assert.doesNotMatch(code, /getMoyasarConfig\(/);
});

test("the reply is the handler's status and body; a throw is a 503 (Moyasar retries), never 500", () => {
  assert.match(code, /NextResponse\.json\(result\.body, \{ status: result\.status \}\)/);
  assert.match(code, /\.catch\([\s\S]{0,200}status: 503/);
  assert.doesNotMatch(code, /status: 500/);
});

test("the body is never logged", () => {
  for (const line of code.split("\n").filter((l) => /console\.(log|warn|error|info)/.test(l))) {
    assert.doesNotMatch(line, /secret|body\b/i, line);
  }
});

test("the webhook is outside the general rate limiter", () => {
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1/payments/webhook"), false);
});

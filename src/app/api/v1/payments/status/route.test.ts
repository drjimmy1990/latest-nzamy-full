/**
 * route.test.ts — source contract for GET /api/v1/payments/status (B1 final
 * review, finding 1). The route imports next/server and the Supabase
 * clients, so it cannot run under `node --test`; the viewer rule it calls
 * (viewerGatewayState: test mode only for staff and test accounts) is
 * executed against a fake service client in
 * src/lib/payments/testModeAccess.test.ts. The wiring is pinned here.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

const code = codeOnly(readFileSync(join(import.meta.dirname, "route.ts"), "utf8"));
const get = code.slice(code.indexOf("export async function GET("));

test("the status passes through viewerGatewayState before it is answered", () => {
  assert.ok(get.length > 0);
  assert.match(code, /import \{ viewerGatewayState \} from "@\/lib\/payments\/testModeAccess"/);
  assert.match(get, /await viewerGatewayState\(await getPaymentGatewayStatus\(\), \{/);
  // the session is the signed-in user's own; the lookups use the service client
  assert.match(get, /userId: async \(\) => \{[\s\S]*?auth\.getUser\(\)[\s\S]*?user\?\.id \?\? null/);
  assert.match(get, /admin: \(\) => createServiceClient\(\)/);
  const viewAt = get.indexOf("viewerGatewayState(");
  const answerAt = get.indexOf("NextResponse.json({ status, provider, disabled }");
  assert.ok(viewAt > -1 && answerAt > viewAt, "the viewer's state is what is answered");
});

test("only the three public fields, never cached, fail closed", () => {
  assert.match(get, /NextResponse\.json\(\{ status, provider, disabled \}, \{/);
  assert.equal((get.match(/"Cache-Control": "no-store"/g) ?? []).length, 2);
  assert.match(code, /export const dynamic = "force-dynamic"/);
  assert.match(get, /\{ status: "disabled", provider: null, disabled: true \}/);
  assert.doesNotMatch(get, /status: 500/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const SOURCE = readFileSync("src/app/api/v1/leads/business-assessment/route.ts", "utf8");

test("the lead throttle uses the shared visitor key, never the first forwarded entry", () => {
  assert.match(SOURCE, /import \{ resolveClientIp \} from "@\/lib\/rateLimit";/);
  assert.match(SOURCE, /import \{ libraryReadClientKey \} from "@\/lib\/rateLimitRoutes";/);
  assert.match(SOURCE, /const key = libraryReadClientKey\(getHeader, resolveClientIp\(getHeader\)\);/);
  assert.match(SOURCE, /return key === "unknown" \? null : key;/);
  assert.doesNotMatch(SOURCE, /split\(","\)\[0\]/);
  assert.doesNotMatch(SOURCE, /headers\.get\("x-forwarded-for"\)/);
});

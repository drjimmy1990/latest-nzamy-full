/**
 * O6 (batch l11-sec): the test mail sink holds test accounts' device and
 * sign-up codes, so GET /api/v1/admin/test-batches returns it only to a role
 * that may manage the tests (settings.write), never to an auditor.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { staffCan } from "../auth/staffRoles.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const route = readFileSync(join(ROOT, "src/app/api/v1/admin/test-batches/route.ts"), "utf8");

test("O6: settings.write is a manage permission an auditor and operations lack", () => {
  assert.equal(staffCan("super_admin", "settings.write"), true);
  assert.equal(staffCan("auditor", "settings.write"), false);
  assert.equal(staffCan("operations", "settings.write"), false);
  assert.equal(staffCan("auditor", "read"), true);
});

test("O6: the sink is read only when the caller's role may manage the tests", () => {
  const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
  assert.match(get, /requireStaff\("read"\)/);
  assert.match(get, /const canReadMail = staffCan\(gate\.role, "settings\.write"\)/);
  const sinkRead = get.indexOf('.from("test_mail_sink")');
  const guard = get.indexOf("canReadMail\n") >= 0 ? get.indexOf("canReadMail\n") : get.search(/canReadMail\s*\?/);
  assert.ok(guard > 0 && guard < sinkRead, "the sink read sits behind canReadMail");
  assert.match(get, /mail: !canReadMail \|\| mail\.error \? null/);
  assert.match(get, /mailHidden: !canReadMail/);
});

test("O6: the page says why the sink is hidden instead of an error", () => {
  const page = readFileSync(join(ROOT, "src/app/dashboard/admin/test-batches/page.tsx"), "utf8");
  assert.match(page, /data\.mailHidden \?/);
});

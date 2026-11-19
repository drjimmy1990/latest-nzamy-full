/**
 * testBatches.test.ts — «مسح دفعة الاختبار» (owner file 19 §1ج.3–4, batch
 * l9-testinfra). The database half is proved in Docker
 * (supabase/tests/rls/test_infra.test.sql, T32–T37); this file proves the
 * app half: the batch id, the TOTP re-check, the file chunks, the wording,
 * and the route wiring (read from the source: the routes import next/server).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/testBatches/testBatches.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FRESH_TOTP_MAX_AGE_S,
  TOTP_NOT_ENROLLED_AR,
  TOTP_STALE_AR,
  blockerHintAr,
  chunkFilesByBucket,
  freshTotpDecision,
  lastTotpAt,
  onDeleteAr,
  purgeSummaryAr,
  validBatchId,
} from "./testBatches.ts";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.sig`;
}

test("batch ids: the database's format (lower-case letters, digits, dashes; 3–64)", () => {
  for (const ok of ["qa-2026-11-19-a", "legacy", "qa-unassigned", "abc"]) assert.equal(validBatchId(ok), true, ok);
  for (const bad of ["QA-1", "qa b", "-qa", "ab", "a".repeat(65), "qa_1", "", null, 7, "qa-١"]) {
    assert.equal(validBatchId(bad), false, String(bad));
  }
});

test("the last TOTP time comes from the amr claim's totp entries only", () => {
  assert.equal(lastTotpAt(jwt({ amr: [{ method: "password", timestamp: 900 }, { method: "totp", timestamp: 1000 }, { method: "totp", timestamp: 1100 }] })), 1100);
  assert.equal(lastTotpAt(jwt({ amr: [{ method: "password", timestamp: 900 }] })), null);
  assert.equal(lastTotpAt(jwt({ amr: ["password", "totp"] })), null, "the string form has no time: not fresh");
  assert.equal(lastTotpAt(jwt({ amr: [{ method: "totp", timestamp: "1000" }] })), null);
  assert.equal(lastTotpAt("not-a-jwt"), null);
  assert.equal(lastTotpAt(null), null);
});

test("the purge needs a TOTP entered within five minutes on an aal2 session — never a password-only session", () => {
  const now = 2_000_000;
  const fresh = jwt({ aal: "aal2", amr: [{ method: "password", timestamp: now - 3600 }, { method: "totp", timestamp: now - 30 }] });
  assert.deepEqual(freshTotpDecision({ hasVerifiedTotp: true, accessToken: fresh, nowS: now }), { ok: true });
  assert.equal(FRESH_TOTP_MAX_AGE_S, 300);

  const stale = jwt({ aal: "aal2", amr: [{ method: "totp", timestamp: now - 301 }] });
  assert.deepEqual(freshTotpDecision({ hasVerifiedTotp: true, accessToken: stale, nowS: now }), {
    ok: false,
    code: "totp_required",
    error: TOTP_STALE_AR,
  });
  const aal1 = jwt({ aal: "aal1", amr: [{ method: "totp", timestamp: now - 10 }] });
  assert.equal(freshTotpDecision({ hasVerifiedTotp: true, accessToken: aal1, nowS: now }).ok, false);
  const passwordOnly = jwt({ aal: "aal1", amr: [{ method: "password", timestamp: now - 10 }] });
  assert.equal(freshTotpDecision({ hasVerifiedTotp: true, accessToken: passwordOnly, nowS: now }).ok, false);
  const future = jwt({ aal: "aal2", amr: [{ method: "totp", timestamp: now + 3600 }] });
  assert.equal(freshTotpDecision({ hasVerifiedTotp: true, accessToken: future, nowS: now }).ok, false);
  assert.deepEqual(freshTotpDecision({ hasVerifiedTotp: false, accessToken: fresh, nowS: now }), {
    ok: false,
    code: "totp_not_enrolled",
    error: TOTP_NOT_ENROLLED_AR,
  });
  assert.equal(freshTotpDecision({ hasVerifiedTotp: true, accessToken: null, nowS: now }).ok, false);
});

test("files: per bucket, at most N paths per Storage call, junk dropped", () => {
  const files = [
    ...Array.from({ length: 205 }, (_, i) => ({ bucket: "documents", name: `u/${i}.pdf` })),
    { bucket: "lawyer-licences", name: "licences/u/a.png" },
    { bucket: "", name: "x" },
    { bucket: "documents" },
    null,
  ];
  const chunks = chunkFilesByBucket(files, 100);
  assert.deepEqual(chunks.map((c) => [c.bucket, c.names.length]), [["documents", 100], ["documents", 100], ["documents", 5], ["lawyer-licences", 1]]);
  assert.deepEqual(chunkFilesByBucket(undefined), []);
});

test("wording: dry-run, blocked, failed, purged — counts and kept rows named", () => {
  const tables = { service_requests: { tagged: 2, delete: 2, kept: 0 }, reviews: { tagged: 1, delete: 0, kept: 1 } };
  assert.equal(
    purgeSummaryAr({ status: "dry_run", tables, files: { count: 3 }, blockers: [] }),
    "تشغيل تجريبي: سيُحذف 2 صفاً و3 ملفاً، ولم يُحذف شيء الآن. ويبقى 1 صفاً (مرتبطاً بحساب حقيقي أو سجلاً يُحفظ).",
  );
  assert.match(purgeSummaryAr({ status: "dry_run", tables, blockers: [{ table: "community_answers", rows: 1 }] }), /المسح ممنوع الآن/);
  assert.match(purgeSummaryAr({ status: "blocked" }), /لم يُمسح شيء/);
  assert.match(purgeSummaryAr({ status: "failed", error: "P0001 x" }), /لم يُمسح شيء: P0001 x/);
  assert.match(purgeSummaryAr({ status: "purged", tables }, 3, 0), /^مُسحت الدفعة: حُذف 2 صفاً وحُذف 3 ملفاً\./);
  assert.match(purgeSummaryAr({ status: "purged", tables }, 2, 1), /تعذّر حذف 1/);
  assert.equal(onDeleteAr("c"), "سيُحذف معه تلقائياً");
  assert.equal(onDeleteAr("a"), "يمنع الحذف");
  assert.match(blockerHintAr("founder_seats") ?? "", /تحرير المقاعد التجريبية/);
  assert.equal(blockerHintAr("community_answers"), null);
});

// ── wiring ───────────────────────────────────────────────────────────────────

test("purge route: super admin gate, then confirm + fresh TOTP before the real purge; files only after a done purge", () => {
  const r = codeOnly(read("app/api/v1/admin/test-batches/purge/route.ts"));
  const gateAt = r.indexOf('await requireStaff("users.delete")');
  const confirmAt = r.indexOf("if (body?.confirm !== batch)");
  const totpAt = r.indexOf("await readFreshTotp()");
  const rpcAt = r.indexOf('service.rpc("test_batch_purge"');
  const removeAt = r.indexOf(".remove(chunk.names)");
  const doneAt = r.indexOf('service.rpc("test_batch_purge_files_done"');
  const logAt = r.indexOf("logAdminAction(");
  assert.ok(gateAt > -1 && gateAt < confirmAt && confirmAt < totpAt && totpAt < rpcAt, "gate → confirm → TOTP → purge");
  assert.ok(r.slice(r.lastIndexOf("if (", confirmAt - 30), totpAt).includes("if (!dryRun)"), "confirm and TOTP guard the real purge");
  assert.match(r, /if \(!totp\.ok\) return NextResponse\.json\(\{ error: totp\.error, code: totp\.code \}, \{ status: 403 \}\)/);
  assert.match(r, /const dryRun = body\?\.dryRun !== false;/, "anything but an explicit false is a dry-run");
  assert.ok(r.slice(rpcAt, removeAt).includes('if (!dryRun && result.status === "purged")'), "files only after a done purge");
  assert.ok(removeAt < doneAt && doneAt < logAt, "remove files → their audit row → the admin audit row");
  assert.match(r, /p_ip: ip/);
  assert.match(r, /const ip = clientIpFrom\(request\);/);
  assert.match(r, /delete shown\.file_list;/, "the file paths are not sent to the browser");
  assert.equal(r.includes("deleteUser"), false, "never deletes an account");
});

test("batches route: read for GET, settings.write for moving an account; the page and the navs", () => {
  const r = codeOnly(read("app/api/v1/admin/test-batches/route.ts"));
  assert.ok(r.indexOf('await requireStaff("read")') < r.indexOf('service.rpc("test_batch_overview")'));
  assert.ok(r.indexOf('await requireStaff("settings.write")') < r.indexOf('service.rpc("test_account_set_batch"'));
  assert.match(r, /test_batch:not_test_account[\s\S]*?status: 409/);
  const page = read("app/dashboard/admin/test-batches/page.tsx");
  assert.match(page, /supabase\.auth\.mfa\.challengeAndVerify\(\{ factorId: factor\.id, code: totp \}\)/);
  const verifyAt = page.indexOf("challengeAndVerify(");
  const purgeAt = page.indexOf("dryRun: false, confirm: dry.batch");
  assert.ok(verifyAt > -1 && verifyAt < purgeAt, "the TOTP code is verified right before the purge request");
  assert.match(page, /disabled=\{busy \|\| confirmText !== dry\.batch \|\| code\.length !== 6\}/);
  assert.match(read("lib/auth/adminNavAccess.ts"), /"\/dashboard\/admin\/test-batches": "users\.delete"/);
  assert.match(read("components/admin/adminNavByRole.ts"), /href: "\/dashboard\/admin\/test-batches"/);
  assert.match(read("constants/navigation.sidebars.primary.ts"), /href: "\/dashboard\/admin\/test-batches"/);
});

/**
 * suspensionTerms.test.ts — batch l16 (owner س٢١٥ + C07/C09/C10/C12/C33–C35):
 * a flexible admin suspension with three ready templates (72 h / 14 d / 7 d)
 * or a custom end, a reason, an automatic lift, an audit row and an appeal —
 * and no open-ended suspension. The pure rules and the server reads/writes
 * (with a fake client) are executed; the routes and pages are read as source.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/auth/suspensionTerms.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CUSTOM_MAX_MS,
  SUSPENSION_TEMPLATES,
  SUSPENSION_TERMS_AR,
  APPEAL_AR,
  banDurationUntil,
  formatSuspensionEndAr,
  parseAppeal,
  parseSuspensionTerms,
  suspensionEmailAr,
  suspensionLiftedEmailAr,
  templateLabelAr,
} from "./suspensionTerms.ts";
import { ACCOUNT_SUSPENSION_KEY, isSuspendedUser, suspensionUntil, suspendedAppMetadata } from "./accountSuspension.ts";
import {
  closeAppealsWith,
  insertAppealWith,
  readDueSuspensionsWith,
  recordSuspensionTermsWith,
} from "../accountSuspension/suspensionServer.ts";
import { buildAdminAuditRow } from "./adminAuditRow.ts";
import { adminPageAction, adminPageAllowed } from "./adminNavAccess.ts";

const NOW = Date.parse("2026-11-26T09:00:00Z");
const H = 60 * 60 * 1000;

// ── The terms ────────────────────────────────────────────────────────────────

test("the three ready templates are the owner's: 72 hours, 14 days, 7 days", () => {
  assert.deepEqual(
    SUSPENSION_TEMPLATES.map((t) => [t.id, t.hours]),
    [["72h", 72], ["14d", 336], ["7d", 168]],
  );
  assert.equal(Object.isFrozen(SUSPENSION_TEMPLATES), true);
});

test("a ready template computes its own end from now", () => {
  for (const t of SUSPENSION_TEMPLATES) {
    const r = parseSuspensionTerms({ template: t.id, reason: "مخالفة شروط الاستخدام" }, NOW);
    assert.ok(r.ok, t.id);
    assert.equal(r.ok && Date.parse(r.terms.endsAt), NOW + t.hours * H, t.id);
    assert.equal(r.ok && r.terms.reason, "مخالفة شروط الاستخدام");
  }
  // an ends_at sent with a template is ignored
  const r = parseSuspensionTerms({ template: "72h", reason: "سبب كافٍ", ends_at: "2030-01-01T00:00:00Z" }, NOW);
  assert.equal(r.ok && Date.parse(r.terms.endsAt), NOW + 72 * H);
});

test("custom: between one hour and one year from now, never open-ended", () => {
  const ok = parseSuspensionTerms({ template: "custom", reason: "سبب كافٍ", ends_at: new Date(NOW + 5 * H).toISOString() }, NOW);
  assert.ok(ok.ok);
  for (const [endsAt, error] of [
    [undefined, SUSPENSION_TERMS_AR.badEnd],
    ["", SUSPENSION_TERMS_AR.badEnd],
    ["forever", SUSPENSION_TERMS_AR.badEnd],
    [new Date(NOW + 10 * 60 * 1000).toISOString(), SUSPENSION_TERMS_AR.endTooSoon],
    [new Date(NOW - H).toISOString(), SUSPENSION_TERMS_AR.endTooSoon],
    [new Date(NOW + CUSTOM_MAX_MS + H).toISOString(), SUSPENSION_TERMS_AR.endTooLate],
    ["9999-12-31T00:00:00Z", SUSPENSION_TERMS_AR.endTooLate],
  ] as const) {
    assert.deepEqual(parseSuspensionTerms({ template: "custom", reason: "سبب كافٍ", ends_at: endsAt }, NOW), { ok: false, error }, String(endsAt));
  }
});

test("a suspension without a template or a reason is refused", () => {
  assert.deepEqual(parseSuspensionTerms(undefined, NOW), { ok: false, error: SUSPENSION_TERMS_AR.missing });
  assert.deepEqual(parseSuspensionTerms({}, NOW), { ok: false, error: SUSPENSION_TERMS_AR.missing });
  assert.deepEqual(parseSuspensionTerms({ template: "forever", reason: "سبب كافٍ" }, NOW), { ok: false, error: SUSPENSION_TERMS_AR.badTemplate });
  assert.deepEqual(parseSuspensionTerms({ template: "72h" }, NOW), { ok: false, error: SUSPENSION_TERMS_AR.reasonShort });
  assert.deepEqual(parseSuspensionTerms({ template: "72h", reason: "   ab  " }, NOW), { ok: false, error: SUSPENSION_TERMS_AR.reasonShort });
  assert.deepEqual(parseSuspensionTerms({ template: "72h", reason: "س".repeat(1001) }, NOW), { ok: false, error: SUSPENSION_TERMS_AR.reasonLong });
});

test("banDurationUntil: whole minutes rounded up, at least one", () => {
  assert.equal(banDurationUntil(new Date(NOW + 72 * H).toISOString(), NOW), "4320m");
  assert.equal(banDurationUntil(new Date(NOW + 61_000).toISOString(), NOW), "2m");
  assert.equal(banDurationUntil(new Date(NOW - H).toISOString(), NOW), "1m");
});

test("labels and the Riyadh end time", () => {
  assert.equal(templateLabelAr("14d"), "١٤ يوماً");
  assert.equal(templateLabelAr("custom"), "مدة مخصّصة");
  assert.equal(templateLabelAr("x"), null);
  assert.equal(formatSuspensionEndAr("nope"), null);
  assert.match(formatSuspensionEndAr("2026-11-29T19:30:00Z") ?? "", /٢٠٢٦/);
});

// ── The gate honours the end ─────────────────────────────────────────────────

test("isSuspendedUser: a copy whose `until` has passed no longer suspends; one without `until` still does", () => {
  const meta = (entry: unknown) => ({ app_metadata: { [ACCOUNT_SUSPENSION_KEY]: entry } });
  assert.equal(isSuspendedUser(meta({ status: "suspended", until: new Date(NOW + H).toISOString() }), NOW), true);
  assert.equal(isSuspendedUser(meta({ status: "suspended", until: new Date(NOW - 1).toISOString() }), NOW), false);
  assert.equal(isSuspendedUser(meta({ status: "suspended", until: new Date(NOW).toISOString() }), NOW), false);
  // fail closed: a copy from before س٢١٥, or an unreadable end
  assert.equal(isSuspendedUser(meta({ status: "suspended" }), NOW), true);
  assert.equal(isSuspendedUser(meta({ status: "suspended", until: "garbage" }), NOW), true);
  assert.equal(isSuspendedUser(meta({ status: "suspended", until: 12 }), NOW), true);
  // a running GoTrue ban still wins over an expired copy
  assert.equal(
    isSuspendedUser({ banned_until: new Date(NOW + H).toISOString(), ...meta({ status: "suspended", until: new Date(NOW - H).toISOString() }) }, NOW),
    true,
  );
  assert.equal(suspensionUntil(meta({ status: "suspended", until: "2026-12-01T00:00:00.000Z" })), "2026-12-01T00:00:00.000Z");
  assert.equal(suspensionUntil(meta({ status: "active", until: "2026-12-01T00:00:00.000Z" })), null);
  assert.deepEqual(suspendedAppMetadata({}, "a", "t", "u"), { account_suspension: { status: "suspended", at: "t", by: "a", until: "u" } });
});

// ── Appeals ──────────────────────────────────────────────────────────────────

test("parseAppeal: an e-mail (lower-cased) and 10..3000 characters", () => {
  assert.deepEqual(parseAppeal({ email: " A@B.co ", message: "  أعترض على الإيقاف لأنه خطأ  " }), {
    ok: true,
    email: "a@b.co",
    message: "أعترض على الإيقاف لأنه خطأ",
  });
  assert.deepEqual(parseAppeal({}), { ok: false, error: APPEAL_AR.required });
  assert.deepEqual(parseAppeal({ email: "nope", message: "x".repeat(20) }), { ok: false, error: APPEAL_AR.badEmail });
  assert.deepEqual(parseAppeal({ email: "a@b.co", message: "قصير" }), { ok: false, error: APPEAL_AR.short });
  assert.deepEqual(parseAppeal({ email: "a@b.co", message: "x".repeat(3001) }), { ok: false, error: APPEAL_AR.long });
});

/** A chainable fake of `db.from(table)…` that records every call and answers per table. */
function fakeDb(answers: Record<string, Array<{ data?: unknown; error?: { code?: string; message?: string } | null }>>) {
  const calls: Array<{ table: string; ops: Array<[string, unknown[]]> }> = [];
  const db = {
    from(table: string) {
      const entry = { table, ops: [] as Array<[string, unknown[]]> };
      calls.push(entry);
      const queue = answers[table] ?? [];
      const answer = queue.shift() ?? { data: null, error: null };
      const chain: Record<string, unknown> = {};
      for (const op of ["select", "update", "insert", "eq", "is", "not", "lte", "order", "limit", "in", "maybeSingle"]) {
        chain[op] = (...args: unknown[]) => {
          entry.ops.push([op, args]);
          return chain;
        };
      }
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: answer.data ?? null, error: answer.error ?? null });
      return chain;
    },
  };
  return { db: db as unknown as Parameters<typeof recordSuspensionTermsWith>[0], calls };
}

test("insertAppealWith: recorded only for an account with an open suspension; the same outward answer otherwise", async () => {
  const ok = fakeDb({
    profiles: [{ data: { id: "u-1" } }],
    account_suspension_freezes: [{ data: { id: "f-1" } }],
    account_suspension_appeals: [{ data: null }],
  });
  assert.deepEqual(await insertAppealWith(ok.db, { email: "a@b.co", message: "نص الاعتراض هنا" }), { state: "recorded" });
  const insert = ok.calls.find((c) => c.table === "account_suspension_appeals")!.ops.find(([op]) => op === "insert");
  assert.deepEqual(insert?.[1][0], { freeze_id: "f-1", user_id: "u-1", message: "نص الاعتراض هنا" });

  const noAccount = fakeDb({ profiles: [{ data: null }] });
  assert.deepEqual(await insertAppealWith(noAccount.db, { email: "x@y.co", message: "نص الاعتراض هنا" }), { state: "no_suspension" });
  assert.equal(noAccount.calls.length, 1, "no further read for an unknown address");

  const notSuspended = fakeDb({ profiles: [{ data: { id: "u-1" } }], account_suspension_freezes: [{ data: null }] });
  assert.deepEqual(await insertAppealWith(notSuspended.db, { email: "a@b.co", message: "نص الاعتراض هنا" }), { state: "no_suspension" });

  const twice = fakeDb({
    profiles: [{ data: { id: "u-1" } }],
    account_suspension_freezes: [{ data: { id: "f-1" } }],
    account_suspension_appeals: [{ error: { code: "23505" } }],
  });
  assert.deepEqual(await insertAppealWith(twice.db, { email: "a@b.co", message: "نص الاعتراض هنا" }), { state: "already_pending" });

  const route = code(read("app/api/v1/suspension-appeal/route.ts"));
  assert.ok(route.includes("APPEAL_AR.received"));
  assert.equal(/no_suspension|already_pending/.test(route), false, "the route never answers differently for an unknown address");
});

test("recordSuspensionTermsWith writes end, template and reason on the OPEN freeze only", async () => {
  const { db, calls } = fakeDb({ account_suspension_freezes: [{ data: [{ id: "f-9" }] }] });
  const r = await recordSuspensionTermsWith(db, { userId: "u-1", endsAt: "2026-11-29T09:00:00.000Z", template: "72h", reason: "سبب" });
  assert.deepEqual(r, { state: "recorded", freezeId: "f-9" });
  const ops = calls[0].ops;
  assert.deepEqual(ops.find(([op]) => op === "update")?.[1][0], { ends_at: "2026-11-29T09:00:00.000Z", template: "72h", suspend_reason: "سبب" });
  assert.deepEqual(ops.find(([op]) => op === "is")?.[1], ["lifted_at", null]);
  const none = fakeDb({ account_suspension_freezes: [{ data: [] }] });
  assert.deepEqual(await recordSuspensionTermsWith(none.db, { userId: "u", endsAt: "e", template: "7d", reason: "سبب" }), { state: "no_open_freeze" });
  const missing = fakeDb({ account_suspension_freezes: [{ error: { code: "42703" } }] });
  assert.deepEqual(await recordSuspensionTermsWith(missing.db, { userId: "u", endsAt: "e", template: "7d", reason: "سبب" }), { state: "migration_missing" });
});

test("readDueSuspensionsWith: open rows whose end has passed, oldest first", async () => {
  const { db, calls } = fakeDb({
    account_suspension_freezes: [{ data: [{ id: "f-1", user_id: "u-1", ends_at: "2026-11-26T08:00:00Z" }, { id: 3 }] }],
  });
  const r = await readDueSuspensionsWith(db, "2026-11-26T09:00:00Z", 50);
  assert.deepEqual(r, { state: "ok", rows: [{ freezeId: "f-1", userId: "u-1", endsAt: "2026-11-26T08:00:00Z" }] });
  const ops = calls[0].ops;
  assert.deepEqual(ops.find(([op]) => op === "is")?.[1], ["lifted_at", null]);
  assert.deepEqual(ops.find(([op]) => op === "lte")?.[1], ["ends_at", "2026-11-26T09:00:00Z"]);
  assert.deepEqual(ops.find(([op]) => op === "order")?.[1], ["ends_at", { ascending: true }]);
  const missing = fakeDb({ account_suspension_freezes: [{ error: { code: "42703" } }] });
  assert.deepEqual(await readDueSuspensionsWith(missing.db, "t", 5), { state: "migration_missing" });
});

test("closeAppealsWith closes only the waiting appeals", async () => {
  const { db, calls } = fakeDb({ account_suspension_appeals: [{ data: [{ id: "a" }, { id: "b" }] }] });
  assert.equal(await closeAppealsWith(db, { userId: "u-1", status: "ended", actorId: null, nowIso: "t" }), 2);
  assert.deepEqual(calls[0].ops.filter(([op]) => op === "eq").map(([, a]) => a), [["user_id", "u-1"], ["status", "new"]]);
});

test("the e-mails: reason, end and the appeal; the lift mail claims no extension it did not make", () => {
  const m = suspensionEmailAr({ reason: "مخالفة", endsAt: "2026-11-29T09:00:00Z" });
  assert.deepEqual(m.details.map(([k]) => k), ["سبب الإيقاف", "ينتهي الإيقاف"]);
  assert.ok(m.paragraphs.some((p) => p.includes("الاعتراض")));
  assert.ok(!suspensionLiftedEmailAr({ automatic: true, extended: false }).paragraphs.some((p) => p.includes("مُدِّدت")));
  assert.ok(suspensionLiftedEmailAr({ automatic: false, extended: true }).paragraphs.some((p) => p.includes("مُدِّدت")));
});

test("a system audit row: actor_type 'system' and no actor", () => {
  const row = buildAdminAuditRow({ actorId: null, actorType: "system", action: "user_unsuspended_auto", targetType: "profile", targetId: "u" }, null);
  assert.equal(row.actor_type, "system");
  assert.equal(row.actor_id, null);
  assert.equal(buildAdminAuditRow({ actorId: "a", action: "x", targetType: "t", targetId: null }, null).actor_type, "admin");
});

// ── Routes and pages, read as source ─────────────────────────────────────────

const SRC = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(SRC, ...rel.split("/")), "utf8").replace(/\r\n/g, "\n");
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("users PATCH: a suspension needs its terms before any write, and carries them to the ban, the freeze row, the mail and the audit", () => {
  const route = code(read("app/api/v1/admin/users/[id]/route.ts"));
  const patch = route.slice(route.indexOf("export async function PATCH("), route.indexOf("export async function DELETE("));
  const termsAt = patch.indexOf("parseSuspensionTerms(body.suspension");
  const writeAt = patch.indexOf(".update(updateData)");
  assert.ok(termsAt > -1 && termsAt < writeAt, "the terms are checked before the profile write");
  assert.ok(/suspendAccountWith\(adminClient, \{[\s\S]*?endsAt: terms\.endsAt/.test(patch), "the ban ends at the terms' end");
  const banAt = patch.indexOf("await suspendAccountWith(adminClient,");
  const freezeAt = patch.indexOf("await freezeEntitlementsWith(adminClient,");
  const recordAt = patch.indexOf("await recordSuspensionTermsWith(adminClient,");
  assert.ok(banAt < freezeAt && freezeAt < recordAt, "ban → freeze → terms on the freeze row");
  assert.ok(patch.includes("after.reason = terms.reason") && patch.includes("after.ends_at = terms.endsAt"), "the audit row carries the terms");
  const thawAt = patch.indexOf("await thawEntitlementsWith(adminClient,");
  const closeAt = patch.indexOf('status: "lifted"');
  assert.ok(thawAt > -1 && closeAt > thawAt, "a lift closes the waiting appeals");
});

test("the automatic lift: cron secret first, then the SAME lift path, appeals ended, a system audit row", () => {
  const route = code(read("app/api/v1/cron/suspension-lift/route.ts"));
  const secretAt = route.indexOf("cronSecretMatches(");
  const readAt = route.indexOf("readDueSuspensionsWith(");
  assert.ok(secretAt > -1 && secretAt < readAt);
  const liftAt = route.indexOf("await liftSuspensionWith(admin,");
  const thawAt = route.indexOf("await thawEntitlementsWith(admin,");
  const closeAt = route.indexOf('status: "ended"');
  const auditAt = route.indexOf('action: "user_unsuspended_auto"');
  assert.ok(liftAt > readAt && thawAt > liftAt && closeAt > thawAt && auditAt > closeAt);
  assert.ok(route.includes('actorType: "system"'));
  assert.ok(route.includes('skipped: "schema_missing"'));
});

test("C09/C10/C12: the user page lifts with status active, reads the suspension from GoTrue, and the display name", () => {
  const page = code(read("app/dashboard/admin/users/[id]/page.tsx"));
  const reactivate = page.slice(page.indexOf("const handleReactivate"), page.indexOf("const handleRejectAppeal"));
  assert.ok(reactivate.includes('JSON.stringify({ status: "active" })'));
  assert.equal(reactivate.includes("verified: true"), false);
  assert.ok(page.includes("mapStatus(activeSub?.status, U.verified_at, U.suspension?.suspended)"));
  assert.equal(page.includes("سيتم إلغاء أي اشتراك نشط"), false, "a suspension freezes, it cancels nothing (owner ٢٥)");
  assert.equal(page.includes("U.full_name"), false);
  assert.equal(page.includes("U.status ==="), false);
  const get = code(read("app/api/v1/admin/users/[id]/route.ts"));
  assert.ok(get.includes("last_sign_in_at: lastSignInAt"));
});

test("C07: the subscriptions page reads the API's data envelope and no hard-coded price or dead button", () => {
  const page = code(read("app/dashboard/admin/subscriptions/page.tsx"));
  assert.ok(page.includes("json?.data"));
  assert.equal(/\b(99|299|599|1999)\b/.test(page), false, "no stale literal prices");
  assert.equal(page.includes("subscriptionsByTier"), false);
  assert.ok(page.includes('href="/dashboard/admin/pricing"') && page.includes('href="/dashboard/admin/users"'));
  assert.equal(/churn/i.test(page.replace(/TrendDown/g, "")), false, "no invented churn");
});

test("C33: the page guard — exact page, longest classified parent, view-as, unclassified = super admin only", () => {
  assert.equal(adminPageAction("/dashboard/admin/settings"), "settings.write");
  assert.equal(adminPageAction("/dashboard/admin/users/1b2c"), "read");
  assert.equal(adminPageAction("/dashboard/admin/users/1b2c/view-as"), "users.view_as");
  assert.equal(adminPageAction("/dashboard/admin/users/roles"), "staff.manage");
  assert.equal(adminPageAction("/dashboard/admin/subscriptions/orders/x/invoice"), "payments.read");
  assert.equal(adminPageAction("/dashboard/admin/subscriptions/coupons/"), "settings.write");
  assert.equal(adminPageAction("/dashboard/admin/no-such-page"), "staff.manage");
  assert.equal(adminPageAction("/dashboard/admin"), "read");
  for (const page of ["/dashboard/admin/settings", "/dashboard/admin/team", "/dashboard/admin/subscriptions/coupons", "/dashboard/admin/broadcasts", "/dashboard/admin/content/articles"]) {
    assert.equal(adminPageAllowed(page, "operations"), false, page);
    assert.equal(adminPageAllowed(page, "auditor"), false, page);
    assert.equal(adminPageAllowed(page, "super_admin"), true, page);
    assert.equal(adminPageAllowed(page, null), true, `${page}: an unreadable role is left to the server`);
  }
  assert.equal(adminPageAllowed("/dashboard/admin/users/abc", "auditor"), true);
  const layout = read("app/dashboard/admin/layout.tsx");
  assert.ok(layout.includes("<AdminPageGuard>{children}</AdminPageGuard>"));
});

test("C34/C35: no admin GET is gated on the bare user_type, assertRole([\"admin\"]) or requireAdmin()", () => {
  for (const rel of [
    "settings", "stats", "subscriptions", "users", "users/[id]", "verifications",
    "library-invitations", "community/reports", "feature-requests", "library-issue-reports",
    "articles", "articles/[id]", "audit-log", "broadcasts", "community/moderation", "corporates", "coupons",
    "coupons/[id]/usage", "entitlements/requests", "erp", "library", "marketplace", "payments", "receipts",
    "revenue", "service-orders", "teams", "tickets",
  ]) {
    const src = code(read(`app/api/v1/admin/${rel}/route.ts`));
    const get = src.slice(src.indexOf("export async function GET("));
    const body = get.slice(0, get.indexOf("export async function", 10) > 0 ? get.indexOf("export async function", 10) : undefined);
    assert.ok(/requireStaff\("(read|payments\.read)"\)/.test(body), `${rel}: GET uses requireStaff`);
    assert.equal(/requireAdmin\(|assertRole\(\s*\[\s*"admin"|user_type !== "admin"/.test(body), false, rel);
  }
  for (const rel of ["acceptances", "lawyers", "requests", "settings"]) {
    const src = code(read(`app/api/v1/admin/marketplace/${rel}/route.ts`));
    const get = src.slice(src.indexOf("export async function GET("));
    const end = get.indexOf("export async function", 10);
    assert.ok((end > 0 ? get.slice(0, end) : get).includes('requireStaff("read")'), `marketplace/${rel}: the auditor reads`);
  }
});

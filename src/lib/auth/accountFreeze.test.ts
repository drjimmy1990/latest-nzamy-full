/**
 * accountFreeze.test.ts — the pure half of D6 (owner ٢٩٨): who counts as
 * frozen, the app_metadata it writes, the error codes and the Arabic copy.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/auth/accountFreeze.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNT_FREEZE_KEY,
  ACCOUNT_FROZEN_PATH,
  ADMIN_PURGE_CONFIRM_AR,
  DELETE_CONFIRM_PHRASE_AR,
  activeAppMetadata,
  classifyDeleteUserError,
  deletionErrorAr,
  freezeStateFromUser,
  frozenAppMetadata,
  frozenUntilAr,
  isMissingAccountDeletionSchema,
  phraseMatches,
} from "./accountFreeze.ts";

test("only app_metadata.account_deletion.status === 'frozen' freezes", () => {
  assert.deepEqual(freezeStateFromUser(null), { frozen: false, purgeAfter: null });
  assert.deepEqual(freezeStateFromUser(undefined), { frozen: false, purgeAfter: null });
  assert.deepEqual(freezeStateFromUser({}), { frozen: false, purgeAfter: null });
  assert.deepEqual(freezeStateFromUser({ app_metadata: {} }), { frozen: false, purgeAfter: null });
  assert.deepEqual(freezeStateFromUser({ app_metadata: { [ACCOUNT_FREEZE_KEY]: "frozen" } }), { frozen: false, purgeAfter: null });
  assert.deepEqual(freezeStateFromUser({ app_metadata: { [ACCOUNT_FREEZE_KEY]: null } }), { frozen: false, purgeAfter: null });
  assert.deepEqual(freezeStateFromUser({ app_metadata: { [ACCOUNT_FREEZE_KEY]: { status: "active" } } }), { frozen: false, purgeAfter: null });
  assert.deepEqual(freezeStateFromUser({ app_metadata: { [ACCOUNT_FREEZE_KEY]: { status: "Frozen" } } }), { frozen: false, purgeAfter: null });
  assert.deepEqual(
    freezeStateFromUser({ app_metadata: { [ACCOUNT_FREEZE_KEY]: { status: "frozen", purge_after: "2026-12-25T10:00:00.000Z" } } }),
    { frozen: true, purgeAfter: "2026-12-25T10:00:00.000Z" },
  );
  // a missing or non-string date still freezes — the gate never opens on a malformed date
  assert.deepEqual(freezeStateFromUser({ app_metadata: { [ACCOUNT_FREEZE_KEY]: { status: "frozen", purge_after: 5 } } }), { frozen: true, purgeAfter: null });
});

test("user_metadata is never read — the user can write it with his own token", () => {
  assert.equal(
    freezeStateFromUser({ user_metadata: { [ACCOUNT_FREEZE_KEY]: { status: "frozen" } }, app_metadata: {} }).frozen,
    false,
  );
  assert.equal(
    freezeStateFromUser({ user_metadata: { [ACCOUNT_FREEZE_KEY]: { status: "active" } }, app_metadata: { [ACCOUNT_FREEZE_KEY]: { status: "frozen" } } }).frozen,
    true,
  );
});

test("the metadata writers keep every other app_metadata key (provider, providers)", () => {
  const existing = { provider: "google", providers: ["google"], other: 1 };
  const frozen = frozenAppMetadata(existing, "2026-12-25T10:00:00.000Z");
  assert.deepEqual(frozen, {
    provider: "google",
    providers: ["google"],
    other: 1,
    [ACCOUNT_FREEZE_KEY]: { status: "frozen", purge_after: "2026-12-25T10:00:00.000Z" },
  });
  assert.equal(freezeStateFromUser({ app_metadata: frozen }).frozen, true);
  const active = activeAppMetadata(frozen);
  assert.deepEqual(active, { provider: "google", providers: ["google"], other: 1, [ACCOUNT_FREEZE_KEY]: { status: "active" } });
  assert.equal(freezeStateFromUser({ app_metadata: active }).frozen, false);
  assert.deepEqual(frozenAppMetadata(null, null), { [ACCOUNT_FREEZE_KEY]: { status: "frozen", purge_after: null } });
  assert.deepEqual(activeAppMetadata(["x"]), { [ACCOUNT_FREEZE_KEY]: { status: "active" } });
});

test("the frozen page path and the confirmation phrases", () => {
  assert.equal(ACCOUNT_FROZEN_PATH, "/account-frozen");
  assert.equal(DELETE_CONFIRM_PHRASE_AR, "احذف حسابي");
  assert.equal(ADMIN_PURGE_CONFIRM_AR, "حذف نهائي");
  assert.equal(phraseMatches("  احذف حسابي ", DELETE_CONFIRM_PHRASE_AR), true);
  assert.equal(phraseMatches("احذف  حسابي", DELETE_CONFIRM_PHRASE_AR), true);
  assert.equal(phraseMatches("احذف", DELETE_CONFIRM_PHRASE_AR), false);
  assert.equal(phraseMatches(undefined, DELETE_CONFIRM_PHRASE_AR), false);
  assert.equal(phraseMatches(42, DELETE_CONFIRM_PHRASE_AR), false);
});

test("missing schema codes — the code before 20261026_70 runs", () => {
  for (const code of ["42P01", "42883", "PGRST202", "PGRST205"]) assert.equal(isMissingAccountDeletionSchema(code), true, code);
  for (const code of ["42501", "55000", "23503", undefined, null, ""]) assert.equal(isMissingAccountDeletionSchema(code), false, String(code));
});

test("database refusals become Arabic", () => {
  assert.match(deletionErrorAr("ACCOUNT_DELETION_ADMIN"), /الإدارة/);
  assert.match(deletionErrorAr("ACCOUNT_DELETION_ENTITY_OWNER:firm"), /المكتب/);
  assert.match(deletionErrorAr("ACCOUNT_DELETION_ENTITY_OWNER:business"), /الشركة|الجهة/);
  assert.match(deletionErrorAr("ACCOUNT_PURGE_IN_PROGRESS"), /جارٍ/);
  assert.match(deletionErrorAr("something else"), /تعذّر/);
  assert.match(deletionErrorAr(undefined), /تعذّر/);
});

test("a deleteUser failure: a key or the entity guard blocks for good, anything else retries", () => {
  assert.deepEqual(classifyDeleteUserError("update or delete on table \"users\" violates foreign key constraint \"x_fkey\" on table \"x\""), {
    outcome: "blocked",
    reason: "foreign_key",
  });
  assert.deepEqual(classifyDeleteUserError("Database error deleting user: ACCOUNT_DELETE_ENTITY_OWNER: account …"), {
    outcome: "blocked",
    reason: "entity_owner",
  });
  // GoTrue hides the database's reason behind this text; a refusal by the
  // database is deterministic (a key, a trigger), so it is not retried daily.
  assert.deepEqual(classifyDeleteUserError("Database error deleting user"), { outcome: "blocked", reason: "database_refused" });
  assert.deepEqual(classifyDeleteUserError("fetch failed"), { outcome: "retry", reason: "delete_failed" });
  assert.deepEqual(classifyDeleteUserError("User not found"), { outcome: "purged", reason: "already_gone" });
});

test("the frozen-until date is a Riyadh Gregorian date in Arabic", () => {
  // 22:30 UTC on 24 Dec is already 25 Dec in Riyadh
  const ar = frozenUntilAr("2026-12-24T22:30:00.000Z");
  assert.ok(ar && ar.includes("٢٥") && ar.includes("ديسمبر") && ar.includes("٢٠٢٦"), String(ar));
  assert.equal(frozenUntilAr("not a date"), null);
  assert.equal(frozenUntilAr(null), null);
  assert.equal(frozenUntilAr(""), null);
});

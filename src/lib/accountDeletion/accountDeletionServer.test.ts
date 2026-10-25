/**
 * accountDeletionServer.test.ts — the purge order and «حذف نهائي الآن»'s
 * freeze, run against a recording fake of the service client (D6 review,
 * findings 4 and 5).
 *
 *   * prepare is a dry run, so nothing about the files is decided before the
 *     delete: the file list is asked for only after deleteUser succeeds, and a
 *     refused delete removes nothing.
 *   * «حذف نهائي الآن» never leaves an account the purge did not end without
 *     the frozen copy in app_metadata: frozen before the purge, re-frozen with
 *     the surviving request's purge_after after it, and the request cancelled
 *     when that copy cannot be written.
 *
 *   * the lawyer's letterhead logo (`branding` bucket, `u/<id>/`) goes after
 *     the delete too; a firm's (`f/<firm>/`) is never touched (final review,
 *     item 3).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/accountDeletion/accountDeletionServer.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeDb, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import { purgeAccountWith, purgeNowWith } from "./accountDeletionServer.ts";
import { ACCOUNT_FREEZE_KEY } from "../auth/accountFreeze.ts";

const USER = "11111111-0000-0000-0000-000000000001";
const ACTOR = "aaaaaaaa-0000-0000-0000-00000000000a";
const REQ = "rrrrrrrr-0000-0000-0000-000000000001";
const PURGE_AFTER = "2026-12-25T00:00:00.000Z";

interface World {
  prepare?: { data?: unknown; error?: { code?: string; message?: string } | null };
  deleteError?: string | null;
  paths?: string[];
  activeAfter?: "requested" | "blocked" | null;
  updateFails?: boolean;
  /** Objects in the branding bucket, keyed by folder ("u/<id>"); a missing key lists nothing. */
  branding?: Record<string, Array<{ name: string; id: string | null }>>;
  brandingListError?: string;
}

function harness(world: World) {
  const events: string[] = [];
  let deleted = false;
  let appMetadata: Record<string, unknown> = { provider: "email" };
  const { client, log } = fakeDb((q: FakeQuery) => {
    if (q.op === "rpc") {
      events.push(`rpc:${q.table}`);
      if (q.table === "account_purge_prepare") return world.prepare ?? { data: { ok: true, dry_run: true, keep_preview: {} } };
      if (q.table === "account_purge_storage_paths") {
        assert.ok(deleted, "the file list is asked for only after the account is deleted");
        return { data: world.paths ?? [] };
      }
      return { data: null };
    }
    if (q.table === "account_deletion_requests") {
      events.push("read:active");
      const status = deleted ? null : (world.activeAfter === undefined ? "purging" : world.activeAfter);
      return { data: status ? { id: REQ, status, requested_at: "2026-10-26T00:00:00.000Z", purge_after: PURGE_AFTER, requested_by: "admin" } : null };
    }
    return {};
  });
  const c = client as unknown as Record<string, unknown>;
  c.auth = {
    admin: {
      async deleteUser(id: string) {
        events.push(`deleteUser:${id}`);
        if (world.deleteError) return { data: null, error: { message: world.deleteError } };
        deleted = true;
        return { data: null, error: null };
      },
      async getUserById(id: string) {
        return { data: { user: { id, app_metadata: appMetadata } }, error: null };
      },
      async updateUserById(_id: string, attrs: { app_metadata: Record<string, unknown> }) {
        events.push(`metadata:${JSON.stringify(attrs.app_metadata[ACCOUNT_FREEZE_KEY])}`);
        if (world.updateFails) return { data: null, error: { message: "gotrue down" } };
        appMetadata = attrs.app_metadata;
        return { data: null, error: null };
      },
    },
  };
  c.storage = {
    from(bucket: string) {
      return {
        async list(folder: string, opts: { limit: number; offset: number }) {
          events.push(`list:${bucket}:${folder}:${opts.offset}`);
          if (bucket === "branding" && world.brandingListError) return { data: null, error: { message: world.brandingListError } };
          const all = bucket === "branding" ? (world.branding?.[folder] ?? []) : [];
          return { data: all.slice(opts.offset, opts.offset + opts.limit), error: null };
        },
        async remove(paths: string[]) {
          events.push(`remove:${bucket}:${paths.join(",")}`);
          return { data: null, error: null };
        },
      };
    },
  };
  return { admin: client as SupabaseClient, events, log, metadata: () => appMetadata };
}

const finishOf = (log: FakeQuery[]) => log.filter((q) => q.op === "rpc" && q.table === "account_purge_finish").map((q) => q.payload as Record<string, unknown>);

test("purge: prepare → deleteUser → the file list → remove → finish purged", async () => {
  const h = harness({ paths: [`${USER}/1-vault.pdf`, `${USER}/9-orphan.pdf`] });
  const run = await purgeAccountWith(h.admin, { requestId: REQ, userId: USER });
  assert.equal(run.outcome, "purged");
  assert.equal(run.storageRemoved, 2);
  assert.deepEqual(h.events, [
    "rpc:account_purge_prepare",
    `deleteUser:${USER}`,
    "rpc:account_purge_storage_paths",
    `remove:documents:${USER}/1-vault.pdf,${USER}/9-orphan.pdf`,
    `list:branding:u/${USER}:0`,
    "rpc:account_purge_finish",
  ]);
  assert.equal(finishOf(h.log)[0].p_outcome, "purged");
});

test("purge: a refused delete lists and removes no file, and ends blocked", async () => {
  const h = harness({ deleteError: "Database error deleting user", branding: { [`u/${USER}`]: [{ name: "logo-abcdefgh.png", id: "o1" }] } });
  const run = await purgeAccountWith(h.admin, { requestId: REQ, userId: USER });
  assert.equal(run.outcome, "blocked");
  assert.equal(h.events.some((e) => e.startsWith("remove:") || e.startsWith("list:") || e === "rpc:account_purge_storage_paths"), false);
  assert.equal(finishOf(h.log)[0].p_outcome, "blocked");
});

test("purge: a blocked prepare never reaches deleteUser", async () => {
  const h = harness({ prepare: { data: { ok: false, blocked: "firm_assets_left" } } });
  const run = await purgeAccountWith(h.admin, { requestId: REQ, userId: USER });
  assert.deepEqual([run.outcome, run.reason], ["blocked", "firm_assets_left"]);
  assert.equal(h.events.some((e) => e.startsWith("deleteUser:")), false);
});

test("purge: a failed file list after the delete still ends purged, recorded as list_failed", async () => {
  const h = harness({});
  const c = h.admin as unknown as { rpc: (fn: string, a: unknown) => unknown };
  const realRpc = c.rpc.bind(c);
  c.rpc = (fn: string, a: unknown) =>
    fn === "account_purge_storage_paths" ? Promise.resolve({ data: null, error: { code: "57014", message: "timeout" } }) : realRpc(fn, a);
  const run = await purgeAccountWith(h.admin, { requestId: REQ, userId: USER });
  assert.equal(run.outcome, "purged");
  const fin = finishOf(h.log)[0];
  assert.equal((fin.p_report as Record<string, unknown>).storage_failed, "list_failed");
});

test("purge now: a blocked purge leaves the account frozen with the request's purge_after (finding 5)", async () => {
  const h = harness({ deleteError: "Database error deleting user", activeAfter: "blocked" });
  const res = await purgeNowWith(h.admin, { requestId: REQ, userId: USER, actorId: ACTOR });
  assert.deepEqual([res.ok, res.ok ? null : res.frozen], [false, true]);
  const frozenAt = h.events.indexOf(`metadata:${JSON.stringify({ status: "frozen", purge_after: PURGE_AFTER })}`);
  assert.ok(frozenAt > -1 && frozenAt < h.events.indexOf("rpc:account_purge_prepare"), "frozen before the purge runs");
  assert.deepEqual(h.metadata()[ACCOUNT_FREEZE_KEY], { status: "frozen", purge_after: PURGE_AFTER });
  assert.equal(h.metadata().provider, "email", "the rest of app_metadata is kept");
  assert.equal(h.events.includes("rpc:account_deletion_cancel_for"), false);
});

test("purge now: a retry (row back to requested) is frozen too", async () => {
  const h = harness({ deleteError: "fetch failed", activeAfter: "requested" });
  const res = await purgeNowWith(h.admin, { requestId: REQ, userId: USER, actorId: ACTOR });
  assert.equal(res.ok, false);
  assert.equal(res.run.outcome, "retry");
  assert.deepEqual(h.metadata()[ACCOUNT_FREEZE_KEY], { status: "frozen", purge_after: PURGE_AFTER });
});

test("purge now: when the frozen copy cannot be written, the surviving request is cancelled — never requested and not frozen", async () => {
  const h = harness({ deleteError: "Database error deleting user", activeAfter: "blocked", updateFails: true });
  const res = await purgeNowWith(h.admin, { requestId: REQ, userId: USER, actorId: ACTOR });
  assert.deepEqual([res.ok, res.ok ? null : res.frozen], [false, false]);
  const cancel = h.log.find((q) => q.op === "rpc" && q.table === "account_deletion_cancel_for");
  assert.ok(cancel, "the request is cancelled");
  assert.deepEqual(cancel.payload, { p_user: USER, p_actor: ACTOR });
});

test("purge now: a purged account is simply gone", async () => {
  const h = harness({ paths: [] });
  const res = await purgeNowWith(h.admin, { requestId: REQ, userId: USER, actorId: ACTOR });
  assert.equal(res.ok, true);
  assert.equal(h.events.includes("rpc:account_deletion_cancel_for"), false);
});

// ── the letterhead logo (final review, item 3) ─────────────────────────────

const FIRM = "f1f1f1f1-0000-0000-0000-0000000000f1";

test("purge: the lawyer's letterhead logos (u/<id>/) are removed after the delete; the firm's (f/…) are never listed", async () => {
  const h = harness({
    paths: [`${USER}/1-vault.pdf`],
    branding: {
      [`u/${USER}`]: [
        { name: "logo-current1.png", id: "o1" },
        { name: "logo-replaced0.webp", id: "o2" },
      ],
      [`f/${FIRM}`]: [{ name: "logo-firm0001.png", id: "o3" }],
    },
  });
  const run = await purgeAccountWith(h.admin, { requestId: REQ, userId: USER });
  assert.equal(run.outcome, "purged");
  assert.equal(run.storageRemoved, 3, "the document and both logos");
  const deletedAt = h.events.indexOf(`deleteUser:${USER}`);
  const removeLogos = h.events.indexOf(`remove:branding:u/${USER}/logo-current1.png,u/${USER}/logo-replaced0.webp`);
  assert.ok(removeLogos > deletedAt, "the logos go only after the account is deleted");
  assert.equal(h.events.some((e) => e.includes("f/")), false, "a firm's vault is not the member's");
  const report = finishOf(h.log)[0].p_report as Record<string, unknown>;
  assert.equal(report.storage_removed, 1);
  assert.equal(report.branding_removed, 2);
  assert.deepEqual(report.branding_failed, []);
});

test("purge: the logo folder is paged through before anything is removed", async () => {
  const many = Array.from({ length: 130 }, (_, i) => ({ name: `logo-p${String(i).padStart(8, "0")}.png`, id: `o${i}` }));
  const h = harness({ paths: [], branding: { [`u/${USER}`]: many } });
  const run = await purgeAccountWith(h.admin, { requestId: REQ, userId: USER });
  assert.equal(run.storageRemoved, 130);
  const lists = h.events.filter((e) => e.startsWith("list:branding:"));
  assert.deepEqual(lists, [`list:branding:u/${USER}:0`, `list:branding:u/${USER}:100`]);
  const firstRemove = h.events.findIndex((e) => e.startsWith("remove:branding:"));
  assert.ok(firstRemove > h.events.lastIndexOf(lists[1]), "removal starts after the last page");
});

test("purge: a branding list that fails (63 not run: no bucket) still ends purged, recorded as branding_failed", async () => {
  const h = harness({ paths: [], brandingListError: "Bucket not found" });
  const run = await purgeAccountWith(h.admin, { requestId: REQ, userId: USER });
  assert.equal(run.outcome, "purged");
  const report = finishOf(h.log)[0].p_report as Record<string, unknown>;
  assert.equal(report.branding_failed, "list_failed");
  assert.equal(report.branding_removed, 0);
});

test("purge: a failed documents list still removes the letterhead logos", async () => {
  const h = harness({ branding: { [`u/${USER}`]: [{ name: "logo-current1.png", id: "o1" }] } });
  const c = h.admin as unknown as { rpc: (fn: string, a: unknown) => unknown };
  const realRpc = c.rpc.bind(c);
  c.rpc = (fn: string, a: unknown) =>
    fn === "account_purge_storage_paths" ? Promise.resolve({ data: null, error: { code: "57014", message: "timeout" } }) : realRpc(fn, a);
  const run = await purgeAccountWith(h.admin, { requestId: REQ, userId: USER });
  assert.equal(run.outcome, "purged");
  assert.ok(h.events.includes(`remove:branding:u/${USER}/logo-current1.png`));
  const report = finishOf(h.log)[0].p_report as Record<string, unknown>;
  assert.equal(report.storage_failed, "list_failed");
  assert.equal(report.branding_removed, 1);
});

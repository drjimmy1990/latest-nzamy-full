/**
 * vaultForPrint.test.ts — q344 as shrunk by R32: a caller without
 * `permissions.print` reads nothing through the print path.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/branding/vaultForPrint.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { BrandingOwner, VaultRow } from "./brandingServer.ts";
import { letterheadPermissionsFor } from "./firmLetterheadPermissions.ts";
import { readVaultForPrintWith, type VaultForPrintDeps } from "./vaultForPrint.ts";

const FIRM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const docxOf = (id: string) => `f/${id}/asset-letterhead-docx-abcdefgh.docx`;
const pdfOf = (id: string) => `f/${id}/asset-letterhead-pdf-abcdefgh.pdf`;

const owner = (role: string | null, isOwner = false): BrandingOwner => ({
  scope: "firm",
  ownerId: FIRM,
  firmRole: role ?? undefined,
  permissions: letterheadPermissionsFor("firm", { isOwner, role }),
});
const row = { id: "v1", firm_id: FIRM } as VaultRow;

function fake(assets: Awaited<ReturnType<VaultForPrintDeps["readAssets"]>> = { data: [], error: null }, vault: Awaited<ReturnType<VaultForPrintDeps["readVault"]>> = { row, error: null }) {
  const calls: string[] = [];
  const deps: VaultForPrintDeps = {
    readVault: async () => { calls.push("vault"); return vault; },
    readAssets: async (id) => { calls.push(`assets:${id}`); return assets; },
  };
  return { deps, calls };
}

test("a member without print reads nothing: not the vault, not its files", async () => {
  for (const role of ["lawyer", "paralegal", "secretary", null]) {
    const { deps, calls } = fake({ data: [{ kind: "letterhead_docx", path: docxOf(FIRM) }], error: null });
    const out = await readVaultForPrintWith(owner(role), deps);
    assert.equal(out.denied, true, String(role));
    assert.equal(out.row, null);
    assert.equal(out.docxPath, null);
    assert.deepEqual(calls, [], "no query");
  }
});

test("the three print roles read the vault and the template", async () => {
  for (const o of [owner("office_admin"), owner("managing_partner"), owner(null, true)]) {
    const { deps, calls } = fake({ data: [{ kind: "letterhead_docx", path: docxOf(FIRM) }, { kind: "letterhead_pdf", path: pdfOf(FIRM) }], error: null });
    const out = await readVaultForPrintWith(o, deps);
    assert.equal(out.denied, false);
    assert.equal(out.row, row);
    assert.equal(out.docxPath, docxOf(FIRM));
    assert.equal(out.hasPdf, true);
    assert.deepEqual(calls, ["vault", "assets:v1"]);
  }
});

test("a lawyer reads his own", async () => {
  const me = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const path = `u/${me}/asset-letterhead-docx-abcdefgh.docx`;
  const { deps } = fake({ data: [{ kind: "letterhead_docx", path }], error: null });
  const out = await readVaultForPrintWith({ scope: "lawyer", ownerId: me, permissions: letterheadPermissionsFor("lawyer") }, deps);
  assert.equal(out.docxPath, path);
});

test("a path outside this owner's folder, or of another kind's shape, yields nothing", async () => {
  const { deps } = fake({ data: [{ kind: "letterhead_docx", path: docxOf(OTHER) }, { kind: "letterhead_pdf", path: pdfOf(OTHER) }], error: null });
  const out = await readVaultForPrintWith(owner("office_admin"), deps);
  assert.equal(out.docxPath, null);
  assert.equal(out.hasPdf, false);
  const traversal = fake({ data: [{ kind: "letterhead_docx", path: `f/${FIRM}/../${OTHER}/asset-letterhead-docx-abcdefgh.docx` }], error: null });
  assert.equal((await readVaultForPrintWith(owner("office_admin"), traversal.deps)).docxPath, null);
});

test("no vault yet: no assets query", async () => {
  const { deps, calls } = fake(undefined, { row: null, error: null });
  const out = await readVaultForPrintWith(owner("office_admin"), deps);
  assert.equal(out.row, null);
  assert.deepEqual(calls, ["vault"]);
});

test("the vault read's error is returned; the assets' table missing or failing still prints the identity", async () => {
  const failing = fake(undefined, { row: null, error: { code: "42P01" } });
  assert.equal((await readVaultForPrintWith(owner("office_admin"), failing.deps)).error?.code, "42P01");

  for (const error of [{ code: "PGRST205" }, { code: "500" }]) {
    const { deps } = fake({ data: null, error });
    const out = await readVaultForPrintWith(owner("office_admin"), deps);
    assert.equal(out.row, row);
    assert.equal(out.docxPath, null);
    assert.equal(out.error, null);
  }
});

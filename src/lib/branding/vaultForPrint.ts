/**
 * vaultForPrint.ts — what the print path may read of a vault, and how (q344, as
 * shrunk by R32). A lawyer reads his own vault; a firm caller reads through RLS,
 * which already limits the firm vault and its files to the same three roles as
 * `permissions.print`. There is no print kit, no per-member grant and no RLS
 * change: a caller without print never reaches the database here.
 *
 * Paths go through the shape checks before anyone signs or downloads them, so a
 * row pointing at another owner's folder yields nothing. The reader is injected
 * so node --test can prove what is, and is not, queried.
 * brandingServer.readVaultForPrint binds it to the session.
 */
import { isMissingBrandingAssetsTable, isOwnAssetPath } from "./brandingAssets.ts";
import type { BrandingOwner, VaultRow } from "./brandingServer.ts";

export interface VaultForPrint {
  /** No print permission. Nothing was read. */
  denied: boolean;
  row: VaultRow | null;
  docxPath: string | null;
  hasPdf: boolean;
  error: { code?: string; message?: string } | null;
}

export interface VaultForPrintDeps {
  readVault: () => Promise<{ row: VaultRow | null; error: { code?: string; message?: string } | null }>;
  readAssets: (vaultId: string) => Promise<{ data: { kind: string; path: string }[] | null; error: { code?: string; message?: string } | null }>;
}

export async function readVaultForPrintWith(owner: BrandingOwner, deps: VaultForPrintDeps): Promise<VaultForPrint> {
  const empty = { denied: false, row: null, docxPath: null, hasPdf: false, error: null };
  if (!owner.permissions.print) return { ...empty, denied: true };

  const { row, error } = await deps.readVault();
  if (error) return { ...empty, error };
  if (!row) return empty;

  // Without the assets (the table not there yet, or a failed read) the identity
  // still prints; only the uploaded files are missing from this export.
  const assets = await deps.readAssets(row.id);
  if (assets.error && !isMissingBrandingAssetsTable(assets.error)) return { ...empty, row };
  const rows = assets.data ?? [];

  const docx = rows.find((a) => a.kind === "letterhead_docx");
  return {
    ...empty,
    row,
    docxPath: docx && isOwnAssetPath(docx.path, owner.scope, owner.ownerId, "letterhead_docx") ? docx.path : null,
    hasPdf: rows.some((a) => a.kind === "letterhead_pdf" && isOwnAssetPath(a.path, owner.scope, owner.ownerId, "letterhead_pdf")),
  };
}

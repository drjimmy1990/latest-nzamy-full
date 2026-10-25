/**
 * _names.ts — writer display names for a page of ledger rows. Labels only:
 * the rows were already chosen by RLS on the session client; see
 * hydrateAuthorNames (cases/[id]/notes/_shared.ts) for why the name lookup
 * itself uses the service client.
 */

import { hydrateAuthorNames, type CaseNoteRow } from "@/app/api/v1/cases/[id]/notes/_shared";
import type { LedgerRow } from "@/lib/ledger/ledgerInput";

export async function ledgerWriterNames(rows: readonly LedgerRow[]): Promise<Map<string, string>> {
  const authors = rows
    .filter((r) => !!r.created_by)
    .map((r) => ({ author_user_id: r.created_by as string })) as unknown as CaseNoteRow[];
  return hydrateAuthorNames(authors);
}

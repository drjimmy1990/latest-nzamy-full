/**
 * caseDocumentObject.ts — may the service role remove this `documents`
 * storage object? (N3.9, owner directive ٥: a case document's file is never
 * deleted.)
 *
 * Two attachments rows can name the same storage_path: POST /api/v1/documents
 * only checks the path is in the caller's own folder, so an uploader could
 * register a personal VAULT row on his own case document's path, bin it, and
 * have DELETE ?permanent=1 (or the 30-day cron) remove the object with the
 * service client — the case document's row survives, its bytes do not. A
 * contract version's path is client-supplied the same way. So every
 * service-role `.remove()` of a documents object asks this first and keeps the
 * bytes when a case document still points at them; the row being purged goes
 * either way.
 *
 * A direct query, not public.storage_object_is_case_document, so it works
 * before 20261025_51 runs. Fail safe: an unreadable answer keeps the bytes.
 */

export interface AttachmentsReader {
  from(table: string): {
    select(cols: string): {
      eq(col: string, v: unknown): {
        not(col: string, op: string, v: unknown): {
          limit(n: number): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
        };
      };
    };
  };
}

/**
 * `client` is a service-role SupabaseClient. Typed loosely on purpose: the
 * generated client's builder types are too deep to match an interface
 * structurally (TS2589), so it is read through AttachmentsReader.
 */
export async function storageObjectHeldByCaseDocument(client: unknown, path: string): Promise<boolean> {
  try {
    const { data, error } = await (client as AttachmentsReader)
      .from("attachments")
      .select("id")
      .eq("storage_path", path)
      .not("request_id", "is", null)
      .limit(1);
    if (error) {
      console.error("[caseDocumentObject] lookup failed — keeping the object:", path, error.message, error.code);
      return true;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    console.error("[caseDocumentObject] lookup threw — keeping the object:", path, err);
    return true;
  }
}

interface RowsByPathReader {
  from(table: string): {
    select(cols: string): {
      eq(col: string, v: unknown): {
        neq(col: string, v: unknown): { limit(n: number): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> };
        limit(n: number): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
      };
    };
  };
}

/**
 * Does any OTHER row — an attachments row or a contract version, live or in
 * the bin — still name this documents path? Then the service role must keep
 * the bytes (final review, item 1). The delete paths remove a file from the
 * folder it was WRITTEN in (folder_owner_id), and two rows can share one
 * path in that folder: 20261026_70 moves a removed member's vault copy of a
 * firm contract version to the firm owner, so the owner's vault row and the
 * member's contract version both point at the member's file. Purging one must
 * not take the other's bytes. `self` is the row being deleted (excluded; a
 * row already deleted needs no exclusion). Fail safe: an unreadable answer
 * keeps the bytes.
 */
export async function storageObjectHeldByAnotherRow(
  client: unknown,
  path: string,
  self: { table: "attachments" | "contract_versions"; id: string | number },
): Promise<boolean> {
  try {
    const reader = client as RowsByPathReader;
    for (const table of ["attachments", "contract_versions"] as const) {
      const byPath = reader.from(table).select("id").eq("storage_path", path);
      const { data, error } = await (table === self.table ? byPath.neq("id", self.id) : byPath).limit(1);
      if (error) {
        console.error("[caseDocumentObject] other-row lookup failed — keeping the object:", table, path, error.message, error.code);
        return true;
      }
      if (Array.isArray(data) && data.length > 0) return true;
    }
    return false;
  } catch (err) {
    console.error("[caseDocumentObject] other-row lookup threw — keeping the object:", path, err);
    return true;
  }
}

/**
 * archivedView.ts — the row → DTO mapping of «المحذوفات» (N3.9,
 * GET /api/v1/cases/[id]/archived), shared by the route and the screen.
 *
 * Everything the route returns is restorable by the caller: 20261025_51 makes
 * the archived-row SELECT rule and the restore rule the same people (for a
 * note: its author, or a supervisor of the case — for a firm note; for a
 * case-team note only a supervisor on that team; never a private note; for a
 * document: its uploader, a participant, or a supervisor). So there is no
 * per-row "can restore" flag to drift from the database's answer.
 *
 * A document's storage path never leaves the server.
 *
 * Pure (type imports only) so archivedView.test.ts runs it under node --test.
 */

export interface ArchivedNoteRow {
  id: string;
  author_user_id: string;
  visibility: string;
  body: string;
  created_at: string;
  deleted_at: string;
  deleted_by: string | null;
}

export interface ArchivedDocumentRow {
  id: number | string;
  file_name: string | null;
  owner_user_id: string | null;
  created_at: string;
  deleted_at: string;
  deleted_by: string | null;
}

export interface ArchivedNoteDto {
  id: string;
  body: string;
  visibility: "private" | "firm" | "case_team";
  authorName: string | null;
  mine: boolean;
  createdAt: string;
  deletedAt: string;
  deletedByName: string | null;
}

export interface ArchivedDocumentDto {
  id: string;
  name: string;
  uploaderName: string | null;
  createdAt: string;
  deletedAt: string;
  deletedByName: string | null;
}

export interface ArchivedView {
  /** false = 20261025_51 has not run: nothing can be archived yet. */
  available: boolean;
  notes: ArchivedNoteDto[];
  documents: ArchivedDocumentDto[];
}

const vis = (v: string): ArchivedNoteDto["visibility"] => (v === "firm" || v === "case_team" ? v : "private");

export function toArchivedNoteDto(row: ArchivedNoteRow, uid: string, names: Map<string, string>): ArchivedNoteDto {
  return {
    id: row.id,
    body: row.body,
    visibility: vis(row.visibility),
    authorName: names.get(row.author_user_id) ?? null,
    mine: row.author_user_id === uid,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    deletedByName: row.deleted_by ? names.get(row.deleted_by) ?? null : null,
  };
}

export function toArchivedDocumentDto(row: ArchivedDocumentRow, names: Map<string, string>): ArchivedDocumentDto {
  return {
    id: String(row.id),
    name: row.file_name?.trim() || "مستند",
    uploaderName: row.owner_user_id ? names.get(row.owner_user_id) ?? null : null,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    deletedByName: row.deleted_by ? names.get(row.deleted_by) ?? null : null,
  };
}

/** Every account id the view needs a display name for. */
export function archivedNameIds(notes: ArchivedNoteRow[], docs: ArchivedDocumentRow[]): string[] {
  const ids = new Set<string>();
  for (const n of notes) {
    ids.add(n.author_user_id);
    if (n.deleted_by) ids.add(n.deleted_by);
  }
  for (const d of docs) {
    if (d.owner_user_id) ids.add(d.owner_user_id);
    if (d.deleted_by) ids.add(d.deleted_by);
  }
  return [...ids];
}

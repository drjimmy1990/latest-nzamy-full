/**
 * Shared by the two client-note routes (a Next route module may export only
 * its HTTP handlers).
 *
 * CODE-F36 (owner package 2026-10-30): a client note is ARCHIVED, never
 * hard-deleted — migration 20261030_30_client_notes_archive.sql adds
 * `deleted_at` / `deleted_by` and takes DELETE away from the API roles.
 * Before that file runs, `deleted_at` does not exist: the list falls back to
 * every row (nothing can be archived yet), and archive / restore answer 503
 * with CLIENT_NOTES_ARCHIVE_UNAVAILABLE_AR — never a hard delete in its place.
 */

export interface NoteRow {
  id: string;
  client_id: string;
  author_user_id: string;
  visibility: string;
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export const NOTE_SELECT = "id, client_id, author_user_id, visibility, body, created_at, updated_at";
/** Only after 20261030_30 — used by the archive / restore / archived-list paths. */
export const NOTE_SELECT_WITH_ARCHIVE = `${NOTE_SELECT}, deleted_at`;

export const CLIENT_NOTES_ARCHIVE_UNAVAILABLE_AR =
  "الأرشفة غير متاحة بعد على هذه القاعدة — يلزم تنفيذ ترحيل قاعدة البيانات 20261030_30. لم يُحذف شيء.";

export function toNoteDto(row: NoteRow, uid: string) {
  return {
    id: row.id,
    clientId: row.client_id,
    authorUserId: row.author_user_id,
    mine: row.author_user_id === uid,
    visibility: row.visibility,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.deleted_at ?? null,
  };
}

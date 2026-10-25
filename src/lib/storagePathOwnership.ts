/**
 * storagePathOwnership.ts — is this `documents` bucket key inside its writer's
 * own folder? The TypeScript twin of public.storage_path_in_folder
 * (supabase/migrations/20261026_65_attachments_path_ownership.sql).
 *
 * Every route that hands out a file signs (or downloads) the row's
 * storage_path with the SERVICE client, which Storage RLS does not confine.
 * Until 20261026_65 a session could write that column freely through raw
 * PostgREST, so a row could point at someone else's file. 65 stops new rows;
 * this check stops the routes from serving any row written before it — an
 * attachments row whose path is not under `owner_user_id/`, a contract
 * version whose path is not under `uploaded_by/`.
 *
 * The app's keys:
 *   <uid>/<ms>-<name>                      uploadDocumentFile, documents copy
 *   <uid>/contracts/<contract>/<ms>-<name> uploadContractVersionFile
 *   <uid>/notes/<page>-<ms>.<ext>          uploadNoteAudio
 *
 * Pure: no `@/` import, so `node --test` loads it directly.
 */

/**
 * Whose folder a row's file was written in: `folder_owner_id` (20261026_72),
 * else the row's writer column (owner_user_id / uploaded_by) for a row that
 * has none. They differ once 20261026_70 moves a firm member's document to
 * the firm owner, keeps a deleted account's case document for the other party
 * (owner null), or nulls a deleted uploader — the file stays where it was
 * written, and the database (not a session) recorded that folder. A row with
 * no folder_owner_id is one whose file was never in its writer's folder (a
 * pre-65 row), so the fallback still refuses it.
 */
export function fileFolderOwner(folderOwnerId: unknown, writerId: unknown): unknown {
  return typeof folderOwnerId === "string" && folderOwnerId ? folderOwnerId : writerId;
}

/**
 * May the SERVICE role remove this row's file when the row itself is deleted?
 * True when the path sits in the folder the file was written in
 * (fileFolderOwner) — NOT the row's current owner. The three delete paths
 * (documents/[id] permanent delete, the cron's 30-day bin purge, a contract
 * version's delete) used the current owner: after 20261026_70 moves a removed
 * member's firm document to the firm owner, the file stays in the member's
 * folder, the owner bins it, the row goes and the bytes stayed — no row held
 * the path any more, so the member's own-folder Storage SELECT (20261026_71)
 * let him download the firm's file again. With folder_owner_id the bytes go
 * with the row; without it (a pre-65 row, or 72 not run yet) the writer's
 * folder decides, as before.
 */
export function isRemovableWithRow(path: unknown, folderOwnerId: unknown, writerId: unknown): path is string {
  return isPathInOwnerFolder(path, fileFolderOwner(folderOwnerId, writerId));
}

/**
 * The read error of a select naming folder_owner_id before 20261026_72 has
 * run: the column is not there yet. Only that error lets a delete path retry
 * without the column (and fall back to the writer's folder); an RLS refusal,
 * a timeout or any other error never does.
 */
export function isMissingFolderOwnerColumn(error: { code?: unknown; message?: unknown } | null | undefined): boolean {
  if (!error) return false;
  if (error.code !== "42703" && error.code !== "PGRST204") return false;
  return typeof error.message === "string" && error.message.includes("folder_owner_id");
}

export function isPathInOwnerFolder(path: unknown, ownerId: unknown): path is string {
  if (typeof path !== "string" || typeof ownerId !== "string") return false;
  if (!path || !ownerId) return false;
  const segments = path.split("/");
  if (segments.length < 2) return false;
  if (segments.some((s) => s === "" || s === "." || s === "..")) return false;
  return segments[0] === ownerId;
}

/**
 * May /api/v1/share/[token]/verify sign this share's file? The TypeScript twin
 * of public.can_share_attachment (20261026_66), applied to the share's owner
 * rather than the caller: the share points at a LIVE attachments row (not in
 * the bin) whose id is the share's document_id, whose storage_path is the
 * share's document_path, whose owner is the share's owner, and whose file
 * sits in the folder it was written in (fileFolderOwner: a document 70 moved
 * to the firm owner stays in the member's folder). Before 66 a session could insert a share
 * with any path through raw PostgREST; this refuses such rows, and shares of
 * documents deleted or binned since.
 */
export function isShareServable(
  share: { owner_id?: unknown; document_id?: unknown; document_path?: unknown },
  attachment: { id?: unknown; owner_user_id?: unknown; storage_path?: unknown; deleted_at?: unknown; folder_owner_id?: unknown } | null | undefined,
): boolean {
  if (!attachment) return false;
  if (typeof share.document_id !== "string" || String(attachment.id ?? "") !== share.document_id) return false;
  if (typeof share.document_path !== "string" || attachment.storage_path !== share.document_path) return false;
  if (typeof share.owner_id !== "string" || attachment.owner_user_id !== share.owner_id) return false;
  if (attachment.deleted_at !== null && attachment.deleted_at !== undefined) return false;
  return isPathInOwnerFolder(attachment.storage_path, fileFolderOwner(attachment.folder_owner_id, attachment.owner_user_id));
}

/**
 * A licence image key as POST /api/v1/lawyer/licence-image writes it:
 * `licences/<that lawyer's uuid>/<file>` — no empty, '.' or '..' segment. The
 * admin queue signs only such a key (defence in depth: sessions hold no
 * privilege on lawyer_profiles.licence_image_path, 20261019_20).
 */
export function isOwnLicencePath(path: unknown, userId: unknown): path is string {
  if (typeof path !== "string" || typeof userId !== "string" || !userId) return false;
  const segments = path.split("/");
  if (segments.length < 3 || segments[0] !== "licences") return false;
  return isPathInOwnerFolder(segments.slice(1).join("/"), userId);
}

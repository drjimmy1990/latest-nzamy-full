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
 * share's document_path, whose uploader is the share's owner, and whose file
 * sits in that uploader's folder. Before 66 a session could insert a share
 * with any path through raw PostgREST; this refuses such rows, and shares of
 * documents deleted or binned since.
 */
export function isShareServable(
  share: { owner_id?: unknown; document_id?: unknown; document_path?: unknown },
  attachment: { id?: unknown; owner_user_id?: unknown; storage_path?: unknown; deleted_at?: unknown } | null | undefined,
): boolean {
  if (!attachment) return false;
  if (typeof share.document_id !== "string" || String(attachment.id ?? "") !== share.document_id) return false;
  if (typeof share.document_path !== "string" || attachment.storage_path !== share.document_path) return false;
  if (typeof share.owner_id !== "string" || attachment.owner_user_id !== share.owner_id) return false;
  if (attachment.deleted_at !== null && attachment.deleted_at !== undefined) return false;
  return isPathInOwnerFolder(attachment.storage_path, attachment.owner_user_id);
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

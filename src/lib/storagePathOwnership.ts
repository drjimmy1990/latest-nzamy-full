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

/**
 * previewServe.ts — what GET /api/v1/documents/<id>/preview answers. It lives
 * here so the checks can be tested with `node --test`; the route only turns the
 * reply into a Response.
 *
 * It reveals nothing the reader could not already read:
 *   - The row comes through the SESSION client, so RLS decides: the owner, or a
 *     participant of the order the file is bound to (attachments_select_policy).
 *   - A binned row is refused, because the supervisors' archive policy can show one.
 *   - The file must sit in the folder it was written in, the same check as
 *     service-requests/[id]/attachments/[attachmentId]. The service client below
 *     is not confined by Storage RLS, so a planted pre-20261026_65 row pointing
 *     at someone else's file must stop here.
 * Each of those is the same 404, and only then is the service client used.
 *
 * Nothing is stored. Logs carry an error code at most, never a name or text.
 *
 * Pure: relative imports only (type-only for Supabase), so `node --test` runs it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractText, textKindOf, TEXT_SOURCE_MAX_BYTES } from "../ai/textExtract.ts";
import { fileFolderOwner, isPathInOwnerFolder } from "../storagePathOwnership.ts";
import { previewKindOf } from "./previewKind.ts";

export const PREVIEW_TEXT_MAX_CHARS = 20_000;
const SIGNED_URL_SECONDS = 300;
const BUCKET = "documents";

export type PreviewBody =
  | { kind: "pdf" | "image"; name: string; url: string }
  | { kind: "text"; name: string; text: string; truncated: boolean }
  | { kind: "none"; name: string; reason?: "too_large" | "unreadable" };

export type PreviewReply = { status: 200; body: PreviewBody } | { status: 404 } | { status: 503 };

export interface PreviewClients {
  /** The caller's session: RLS applies. */
  session: SupabaseClient;
  /** Reached only after the session's read and the folder check. */
  admin: SupabaseClient;
}

interface PreviewRow {
  file_name: string | null;
  mime_type: string | null;
  storage_path: string | null;
  size_bytes: number | null;
  deleted_at: string | null;
  owner_user_id: string | null;
  folder_owner_id: string | null;
}

export async function previewAttachment(clients: PreviewClients, id: string): Promise<PreviewReply> {
  // attachments.id is a bigserial (documents/_shared.ts isValidAttachmentId).
  if (!/^\d+$/.test(id)) return { status: 404 };

  const { data, error } = await clients.session
    .from("attachments")
    .select("file_name, mime_type, storage_path, size_bytes, deleted_at, owner_user_id, folder_owner_id")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[documents/preview] read failed:", error.code);
    return { status: 404 };
  }
  const row = data as PreviewRow | null;
  if (!row || row.deleted_at) return { status: 404 };
  if (!isPathInOwnerFolder(row.storage_path, fileFolderOwner(row.folder_owner_id, row.owner_user_id))) return { status: 404 };

  const path = row.storage_path as string;
  const name = row.file_name ?? "ملف";
  const kind = previewKindOf(row.mime_type, row.file_name);
  if (kind === "none") return { status: 200, body: { kind: "none", name } };

  if (kind === "pdf" || kind === "image") {
    const signed = await clients.admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
    if (signed.error || !signed.data?.signedUrl) return { status: 503 };
    return { status: 200, body: { kind, name, url: signed.data.signedUrl } };
  }

  const textKind = textKindOf(row.mime_type, row.file_name);
  if (textKind === null || textKind === "doc") return { status: 200, body: { kind: "none", name } };
  if ((row.size_bytes ?? 0) > TEXT_SOURCE_MAX_BYTES) return { status: 200, body: { kind: "none", name, reason: "too_large" } };

  const got = await clients.admin.storage.from(BUCKET).download(path);
  if (got.error || !got.data) return { status: 503 };
  const extracted = extractText(textKind, new Uint8Array(await got.data.arrayBuffer()));
  if (!extracted.ok) {
    const tooLarge = extracted.code === "docx_too_large" || extracted.code === "text_too_large";
    return { status: 200, body: { kind: "none", name, reason: tooLarge ? "too_large" : "unreadable" } };
  }
  const truncated = extracted.text.length > PREVIEW_TEXT_MAX_CHARS;
  return { status: 200, body: { kind: "text", name, text: truncated ? extracted.text.slice(0, PREVIEW_TEXT_MAX_CHARS) : extracted.text, truncated } };
}

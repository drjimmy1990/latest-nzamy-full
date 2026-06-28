/**
 * documentService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode document management service.
 *
 * Backed by the `attachments` table (id, request_id, owner_user_id, file_name,
 * storage_path, mime_type, size_bytes, created_at) and the `documents` storage
 * bucket (private; objects stored under `<user_id>/<timestamp>-<name>`).
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { createClient as createBrowserClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Document {
  id: string;
  request_id: string | null;
  owner_user_id: string | null;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface DocumentInput {
  file_name: string;
  storage_path: string;
  mime_type?: string;
  size_bytes?: number;
  request_id?: string | null;
}

// ─── API types ────────────────────────────────────────────────────────────────

interface DocumentListResponse {
  data: Document[];
}

interface DocumentCreateResponse {
  data: Document;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function getDocuments(): Promise<Document[]> {
  if (!isSupabaseMode) {
    return [];
  }

  try {
    const response = await apiGet<DocumentListResponse>("/api/v1/documents");
    return response.data ?? [];
  } catch {
    return [];
  }
}

/**
 * Upload a file to the `documents` storage bucket, then create the metadata row.
 * Throws on failure (caller is expected to surface the error to the user — no
 * silent demo fallback, since that would fake a successful upload).
 */
export async function uploadDocumentFile(
  file: File,
  opts: { requestId?: string | null } = {},
): Promise<Document> {
  if (!isSupabaseMode) {
    throw new Error("upload_unavailable_demo");
  }

  const supabase = createBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const safeName = file.name.replace(/[^a-zA-Z0-9._\-؀-ۿ\s]/g, "_");
  const storagePath = `${user.id}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadError) throw new Error(uploadError.message);

  try {
    const response = await apiMutate<DocumentCreateResponse>(
      "/api/v1/documents",
      "POST",
      {
        file_name: file.name,
        storage_path: storagePath,
        mime_type: file.type || "application/octet-stream",
        size_bytes: file.size,
        request_id: opts.requestId ?? null,
      },
    );
    return response.data;
  } catch (err) {
    // Roll back the storage object so we don't orphan files.
    await supabase.storage.from("documents").remove([storagePath]).catch(() => {});
    throw err;
  }
}

/** Build a signed URL for viewing/downloading a stored document. */
export async function getDocumentFileUrl(storagePath: string): Promise<string | null> {
  if (!isSupabaseMode || !storagePath) return null;
  const supabase = createBrowserClient();
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(storagePath, 300);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Delete a document (storage object + metadata row). */
export async function deleteDocument(id: string, storagePath?: string | null): Promise<void> {
  if (!isSupabaseMode) return;
  await apiMutate<{ ok: boolean }>(`/api/v1/documents/${id}`, "DELETE", {});
  if (storagePath) {
    const supabase = createBrowserClient();
    await supabase.storage.from("documents").remove([storagePath]).catch(() => {});
  }
}
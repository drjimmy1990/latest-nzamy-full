/**
 * documentService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode document management service.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Document {
  id: string;
  user_id: string;
  request_id: string | null;
  file_name: string;
  file_url: string;
  file_size: string;
  file_type: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentInput {
  file_name: string;
  file_url: string;
  file_size: string;
  file_type: string;
  case_ref?: string;
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
    return response.data;
  } catch {
    return [];
  }
}

export async function uploadDocument(doc: DocumentInput): Promise<Document> {
  if (!isSupabaseMode) {
    // Demo mode: return a fake document record
    return {
      id: `demo-${Date.now()}`,
      user_id: "demo-user",
      request_id: doc.case_ref ?? null,
      file_name: doc.file_name,
      file_url: doc.file_url,
      file_size: doc.file_size,
      file_type: doc.file_type,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  try {
    const response = await apiMutate<DocumentCreateResponse>(
      "/api/v1/documents",
      "POST",
      doc,
    );
    return response.data;
  } catch {
    // Fallback to demo response on failure
    return {
      id: `demo-${Date.now()}`,
      user_id: "demo-user",
      request_id: doc.case_ref ?? null,
      file_name: doc.file_name,
      file_url: doc.file_url,
      file_size: doc.file_size,
      file_type: doc.file_type,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
}

/**
 * _fromAi.ts — the pure half of POST /api/v1/cases/[id]/documents/from-ai
 * (N01-21/22). No imports, so `node --test` loads it.
 */

/** ~ 400 KB of UTF-8 Arabic; an AI result longer than this is not a result. */
export const MAX_AI_DOCUMENT_CHARS = 200_000;
export const MAX_AI_DOCUMENT_TITLE = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ParsedAiDocument =
  | { ok: true; value: { text: string; title: string; runId: string | null } }
  | { ok: false; error: string };

export function parseAiDocumentBody(body: unknown): ParsedAiDocument {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const text = typeof b.text === "string" ? b.text : "";
  if (!text.trim()) return { ok: false, error: "لا يوجد نص لحفظه." };
  if (text.length > MAX_AI_DOCUMENT_CHARS) return { ok: false, error: "النص أطول من أن يُحفظ مستنداً واحداً." };
  const rawTitle = typeof b.title === "string" ? b.title.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "";
  const title = (rawTitle || "مخرج أداة الذكاء الاصطناعي").slice(0, MAX_AI_DOCUMENT_TITLE);
  let runId: string | null = null;
  if (b.runId !== undefined && b.runId !== null && b.runId !== "") {
    if (typeof b.runId !== "string" || !UUID.test(b.runId)) return { ok: false, error: "معرّف التشغيل غير صالح." };
    runId = b.runId;
  }
  return { ok: true, value: { text, title, runId } };
}

/**
 * The stored file: plain UTF-8 text with a BOM (so Notepad/Word open Arabic
 * correctly), an Arabic display name kept in attachments.file_name, and an
 * ASCII storage key (Storage keys travel in an HTTP header — see
 * documentService.uploadDocumentFile).
 */
export function aiDocumentFile(text: string, title: string): {
  fileName: string;
  storageName: string;
  mimeType: string;
  content: string;
} {
  const base = title.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim() || "مخرج أداة الذكاء الاصطناعي";
  return {
    fileName: `${base}.txt`,
    storageName: "ai-result.txt",
    mimeType: "text/plain",
    content: `﻿${text}`,
  };
}

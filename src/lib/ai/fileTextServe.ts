/**
 * fileTextServe.ts — what GET /api/v1/ai/file-text/<token> answers. It lives
 * here so the link's security can be tested with `node --test`; the route only
 * turns the reply into a Response.
 *
 *   an attachment claim   the owner's own vault row (not in the bin), a file in
 *                         his folder of the `documents` bucket, of a text kind:
 *                         downloaded and extracted again, the same extractText
 *                         that was counted and priced. Nothing is stored.
 *   a pasted claim        the run's input, only while the run is `running`, only
 *                         the one field its tool sends as a file
 *                         (AiToolSpec.pasteAsFile).
 *
 * Every refusal is the same 404, so an answer tells nothing about whether a run
 * or a file exists: a token that does not verify reads nothing at all. A missing
 * secret is the only other answer (503, a server not configured). n8n counts a
 * failed download as `download_failed`, and that run is refunded.
 *
 * Logs carry an id and an error code, never a token, an error's message, or text.
 *
 * Pure: relative imports only (type-only for Supabase), so `node --test` runs it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_FILES_BUCKET, storagePathInOwnFolder, verifyFileTextToken, type FileTextClaim } from "./fileTextToken.ts";
import { TEXT_FILE_MAX_CHARS, extractText, textKindOf } from "./textExtract.ts";
import { getAiTool } from "./tools.ts";

export type FileTextReply = { status: 200; text: string } | { status: 404 } | { status: 503 };

async function attachmentText(admin: SupabaseClient, claim: { a: string; u: string }): Promise<string | null> {
  const { data, error } = await admin
    .from("attachments")
    .select("file_name, storage_path, mime_type")
    .eq("id", claim.a)
    .eq("owner_user_id", claim.u)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("[ai/file-text] attachment read failed:", claim.a, error.code);
    return null;
  }
  const row = data as { file_name: string | null; storage_path: string | null; mime_type: string | null } | null;
  if (!row || !storagePathInOwnFolder(row.storage_path, claim.u)) return null;
  const kind = textKindOf(row.mime_type, row.file_name);
  if (kind === null || kind === "doc") return null;

  const got = await admin.storage.from(AI_FILES_BUCKET).download(row.storage_path as string);
  if (got.error || !got.data) {
    console.error("[ai/file-text] download failed:", claim.a);
    return null;
  }
  const extracted = extractText(kind, new Uint8Array(await got.data.arrayBuffer()));
  if (!extracted.ok) {
    console.error("[ai/file-text] extraction refused:", claim.a, extracted.code);
    return null;
  }
  return extracted.text;
}

async function pastedText(admin: SupabaseClient, claim: { r: string; f: string; u: string }): Promise<string | null> {
  const { data, error } = await admin
    .from("ai_runs")
    .select("tool, status, input")
    .eq("id", claim.r)
    .eq("user_id", claim.u)
    .maybeSingle();
  if (error) {
    console.error("[ai/file-text] run read failed:", claim.r, error.code);
    return null;
  }
  const run = data as { tool: string; status: string; input: unknown } | null;
  if (!run || run.status !== "running") return null;
  if (getAiTool(run.tool)?.pasteAsFile?.field !== claim.f) return null;
  const input = run.input;
  if (typeof input !== "object" || input === null || !Object.prototype.hasOwnProperty.call(input, claim.f)) return null;
  const text = (input as Record<string, unknown>)[claim.f];
  return typeof text === "string" && text.trim() ? text : null;
}

export async function serveFileText(
  admin: SupabaseClient,
  token: string,
  opts: { secret: string | undefined; now: number },
): Promise<FileTextReply> {
  if (!opts.secret) return { status: 503 };
  const claim: FileTextClaim | null = verifyFileTextToken(token, opts.secret, opts.now);
  if (!claim) return { status: 404 };
  try {
    const text = "a" in claim ? await attachmentText(admin, claim) : await pastedText(admin, claim);
    return text ? { status: 200, text: text.slice(0, TEXT_FILE_MAX_CHARS) } : { status: 404 };
  } catch (err) {
    console.error("[ai/file-text] threw:", (err as { name?: string } | null)?.name ?? "error");
    return { status: 404 };
  }
}

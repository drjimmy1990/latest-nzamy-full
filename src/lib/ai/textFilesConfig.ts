/**
 * textFilesConfig.ts — whether this server may send .docx, .txt, .md and pasted
 * text to the AI tools. Off unless all three hold: NZAMY_AI_TEXT_FILES is
 * exactly "on", NZAMY_AI_KEY signs the link, and the site has an https address
 * n8n can fetch it from. Off means those inputs are refused before any charge.
 *
 * The route passes the variables one by one, because Next inlines
 * NEXT_PUBLIC_SITE_URL only where it is written out in full.
 *
 * Pure: node:crypto through fileTextToken.ts only, so `node --test` runs it.
 * Server code only.
 */
import { FILE_TEXT_TTL_MS, signFileTextToken } from "./fileTextToken.ts";

export interface TextFilesOption {
  secret: string;
  baseUrl: string;
}

export function aiTextFilesConfig(env: {
  NZAMY_AI_TEXT_FILES?: string;
  NZAMY_AI_KEY?: string;
  NEXT_PUBLIC_SITE_URL?: string;
}): TextFilesOption | null {
  if (env.NZAMY_AI_TEXT_FILES !== "on" || !env.NZAMY_AI_KEY) return null;
  const site = env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") ?? "";
  return /^https:\/\//.test(site) ? { secret: env.NZAMY_AI_KEY, baseUrl: site } : null;
}

/** The link n8n downloads a text from. */
export function fileTextUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/api/v1/ai/file-text/${token}`;
}

/** runCore's StartRunDeps.pastedFileUrl: a signed link to one run's pasted field. */
export function pastedFileUrlFrom(option: TextFilesOption, now: () => number = Date.now) {
  return (runId: string, userId: string, field: string): string =>
    fileTextUrl(option.baseUrl, signFileTextToken({ r: runId, f: field, u: userId, e: now() + FILE_TEXT_TTL_MS }, option.secret));
}

/**
 * textFilesConfig.ts — whether this server may send .docx, .txt, .md and pasted
 * text to the AI tools. Off unless all three hold: NZAMY_AI_TEXT_FILES is
 * exactly "on", NZAMY_AI_KEY signs the link, and the site has an https address
 * n8n can fetch it from. Off means those inputs are refused before any charge.
 *
 * The route passes the variables one by one, because Next inlines
 * NEXT_PUBLIC_SITE_URL only where it is written out in full.
 *
 * Pure and import-free, so `node --test` runs it.
 */

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

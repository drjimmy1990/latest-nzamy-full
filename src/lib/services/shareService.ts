"use client";

/**
 * shareService.ts — browser-side wrapper for POST /api/v1/share.
 *
 * Owner item 174. The only caller of the real share flow — useContractsState
 * .generateShareLink and the two ClientSharePanel/StepApproval panels used to
 * mint a token + passcode in React state with `Math.random()` and persist
 * nothing (see shareSecrets.ts and 20260909_document_shares_hashes.sql for
 * the server side of the fix). This module is what they call instead.
 */

import { apiMutate } from "@/lib/services/api";

export interface CreateShareInput {
  /** attachments.id (bigserial) — the document row being shared. */
  attachmentId: string;
  /** Falls back to the attachment's own file name server-side when omitted. */
  title?: string;
  /** 1-720 hours; the route defaults to 72 (three days) when omitted. */
  expiresInHours?: number;
  /** Defaults to true server-side — most shares should carry a passcode. */
  withPasscode?: boolean;
}

export interface CreateShareResult {
  /** Relative path, e.g. "/share/<token>" — not an absolute URL. */
  url: string;
  /** The plaintext passcode, shown ONCE — the server keeps only its hash. */
  passcode: string | null;
  expiresAt: string;
}

export async function createShare(input: CreateShareInput): Promise<CreateShareResult> {
  const body: Record<string, unknown> = { attachmentId: input.attachmentId };
  if (input.title !== undefined) body.title = input.title;
  if (input.expiresInHours !== undefined) body.expiresInHours = input.expiresInHours;
  if (input.withPasscode !== undefined) body.withPasscode = input.withPasscode;
  return apiMutate<CreateShareResult>("/api/v1/share", "POST", body);
}

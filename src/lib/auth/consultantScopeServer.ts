/**
 * consultantScopeServer.ts — the one read behind "is this caller an
 * INDEPENDENT legal consultant?", shared by the proxy (pages and
 * /api/v1/lawyer), the AI run path and tool-status, so they cannot disagree.
 *
 * Independent = `lawyer_profiles.practice_kind` is exactly 'consultant' AND he
 * is not an active member of a firm. A consultant who is an active member keeps
 * the firm role's tools (FIRM_ROLE_ALLOWED_HREFS, e.g. legal_consultant): the
 * restriction is for the one who works alone, and the delegation phase builds
 * on that membership, so nothing here stands in its way.
 *
 * Reads through the caller's own RLS client (own rows only), never a service
 * client. Cost: one read for everyone, a second only for a consultant.
 *
 * Failure rules, each deliberate:
 *   - practice_kind unreadable or a missing column → advocate (the existing
 *     rule of assertCourtPractice: a blip never locks a real lawyer out);
 *     `readFailed` lets an API caller choose to answer 503 instead;
 *   - the membership read fails for a confirmed consultant → treated as NOT a
 *     member, i.e. independent: a doubt never opens the lawyer's workspace.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { practiceKindFromRead } from "./courtPracticeDecision.ts";
import { type PracticeKind } from "./practiceKind.ts";

export interface ConsultantStanding {
  practiceKind: PracticeKind;
  /** An active firm_members row exists (only read for a consultant). */
  firmMember: boolean;
  /** The practice_kind read errored for a reason other than a missing column. */
  readFailed: boolean;
  /** The kind the scope rules take: 'consultant' only for an independent one. */
  scopeKind: PracticeKind;
}

export async function readConsultantStanding(client: SupabaseClient, userId: string): Promise<ConsultantStanding> {
  let read: ReturnType<typeof practiceKindFromRead>;
  try {
    read = practiceKindFromRead(await client.from("lawyer_profiles").select("practice_kind").eq("user_id", userId).maybeSingle());
  } catch {
    return { practiceKind: "advocate", firmMember: false, readFailed: true, scopeKind: "advocate" };
  }
  const readFailed = read.readFailed && !read.missingColumn;
  if (read.practiceKind !== "consultant") {
    return { practiceKind: "advocate", firmMember: false, readFailed, scopeKind: "advocate" };
  }
  let firmMember = false;
  try {
    const { data, error } = await client
      .from("firm_members")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    firmMember = !error && !!data;
  } catch {
    firmMember = false;
  }
  return { practiceKind: "consultant", firmMember, readFailed, scopeKind: firmMember ? "advocate" : "consultant" };
}

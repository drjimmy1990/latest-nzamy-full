/**
 * The lawyer signup verification flow (owner decisions ٢٠–٢١, amended by ٢٧ /
 * batch l7 decision 12: e-mail only). Server-only; every call uses the
 * service client AFTER the route has proved the caller is a signed-in lawyer,
 * and only ever acts on that caller's own rows.
 *
 * Steps (the browser sees only the public state below — never a code, never
 * the reasons):
 *   1. licence photo → the private bucket lawyer-licences/<uid>/…, AI
 *      pre-check if switched on (else 'skipped' → a human looks at it);
 *   2. registry check of the licence on HIS file + the four-part name he typed
 *      (lawyer_signup_registry_check, 20261124_70);
 *   3. a code to the account's OWN e-mail (no WhatsApp, no SMS, no
 *      registry-mobile code);
 *   4. decision table (decision.ts) → instant approval when switched on and
 *      everything holds, else «سجّلنا بياناتك وسنتواصل معك».
 */

import { randomUUID } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import type { createServiceClient } from "@/lib/supabase/server";
import { validateLicenceUpload } from "@/lib/services/licenceUpload";
import { toPracticeKind } from "@/lib/auth/practiceKind";
import { readSignupProviderConfig, type SignupProviderConfig } from "./providerConfig.ts";
import { decideLawyerSignup, HOLD_MESSAGE_AR, type AiStatus, type Decision, type RegistryStatus } from "./decision.ts";
import { generateOtpCode, hashOtpCode, hashOtpTarget, OTP_RESEND_SECONDS, OTP_TTL_MINUTES, type OtpPurpose } from "./otpCode.ts";
import { isThrowawayEmail } from "./throwawayEmail.ts";
import { maskEmail } from "./mask.ts";
import { compareExtracted } from "./aiLicenceCheck.ts";
import { readLicenceWithGemini } from "./geminiLicence.ts";
import { resendEmailAdapter, type OtpChannelAdapter } from "./channels.ts";
import { approveLawyerInstantly } from "./approve.ts";
import type { NameMatch } from "./nameLicence.ts";

type Svc = Awaited<ReturnType<typeof createServiceClient>>;

export const LICENCE_BUCKET = "lawyer-licences";

/** The migration has not run (table / function unknown). */
export function isMissingSchema(error: { code?: string } | null | undefined): boolean {
  return ["42P01", "42883", "PGRST202", "PGRST205", "42703", "PGRST204"].includes(error?.code ?? "");
}

export class SignupUnavailable extends Error {}

export type PublicState = {
  status: "verified" | "approved" | "pending" | "review";
  next: "upload_licence" | "email_otp" | null;
  holdMessage: string | null;
  practiceKind: "advocate" | "consultant";
  licenceUploaded: boolean;
  /** The e-mail code — the one code of the signup (decision ٢٧). */
  email: {
    masked: string | null;
    verified: boolean;
    available: boolean;
    throwaway: boolean;
    lastSentAt: string | null;
  };
};

type Row = Record<string, unknown> | null;

function cfg(): SignupProviderConfig {
  return readSignupProviderConfig(process.env);
}

async function readRow(svc: Svc, userId: string): Promise<Row> {
  const { data, error } = await svc.from("lawyer_signup_verifications").select("*").eq("user_id", userId).maybeSingle();
  if (error) {
    if (isMissingSchema(error)) throw new SignupUnavailable("schema");
    throw new Error(`lawyer_signup_verifications read failed: ${error.code}`);
  }
  return (data as Row) ?? null;
}

async function lastChallenge(svc: Svc, userId: string, purpose: OtpPurpose) {
  const { data } = await svc
    .from("lawyer_otp_challenges")
    .select("channel, created_at, delivery")
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { channel: string; created_at: string; delivery: string } | null) ?? null;
}

async function latestImage(svc: Svc, userId: string) {
  const { data } = await svc
    .from("lawyer_licence_images")
    .select("id, ai_status, purpose, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string; ai_status: AiStatus; purpose: string } | null) ?? null;
}

function typedName(user: User, row: Row, override?: string | null): string | null {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const candidates = [override, row?.full_name_input, meta?.registry_full_name];
  for (const c of candidates) if (typeof c === "string" && c.trim() !== "") return c.trim().slice(0, 160);
  return null;
}

type RegistryCheck = {
  status: RegistryStatus;
  licence: string | null;
  nameMatch: NameMatch | null;
  otherVerifiedClaims: number;
  hasMobile: boolean;
  mobileHint: string | null;
  registryName: string | null;
  expiry: string | null;
  noProfile: boolean;
};

async function registryCheck(svc: Svc, userId: string, name: string | null): Promise<RegistryCheck> {
  const { data, error } = await svc.rpc("lawyer_signup_registry_check", { p_user: userId, p_full_name: name });
  if (error) {
    if (isMissingSchema(error)) throw new SignupUnavailable("schema");
    console.error("[lawyerSignup] registry check failed:", error.code);
    return { status: "unavailable", licence: null, nameMatch: null, otherVerifiedClaims: 0, hasMobile: false, mobileHint: null, registryName: null, expiry: null, noProfile: false };
  }
  const j = (data ?? {}) as Record<string, unknown>;
  const statuses: RegistryStatus[] = ["valid", "expired", "unverifiable", "not_found", "no_licence"];
  const status = statuses.includes(j.status as RegistryStatus) ? (j.status as RegistryStatus) : "unavailable";
  return {
    status,
    licence: typeof j.licence === "string" ? j.licence : null,
    nameMatch: (["exact", "subset", "different", "none"] as const).find((m) => m === j.name_match) ?? null,
    otherVerifiedClaims: typeof j.other_verified_claims === "number" ? j.other_verified_claims : 0,
    hasMobile: j.has_mobile === true,
    mobileHint: typeof j.mobile_hint === "string" ? j.mobile_hint : null,
    registryName: typeof j.registry_name === "string" ? j.registry_name : null,
    expiry: typeof j.expiry === "string" ? j.expiry : null,
    noProfile: j.status === "no_profile",
  };
}

/**
 * Re-checks everything, records the decision, approves when it may, and
 * returns what the browser may see. Called by every route.
 */
export async function evaluate(svc: Svc, user: User, opts: { fullName?: string | null } = {}): Promise<PublicState> {
  const config = cfg();
  const before = await readRow(svc, user.id);
  const name = typedName(user, before, opts.fullName);
  const reg = await registryCheck(svc, user.id, name);
  if (reg.noProfile) throw new SignupUnavailable("no_profile");

  const { data: lp } = await svc.from("lawyer_profiles").select("*").eq("user_id", user.id).maybeSingle();
  const profile = (lp ?? {}) as Record<string, unknown>;
  const accountStatus = String(profile.verification_status ?? "pending");
  const practiceKind = toPracticeKind(profile.practice_kind);

  const throwaway = isThrowawayEmail(user.email);
  const row = (await readRow(svc, user.id)) ?? {};
  const image = await latestImage(svc, user.id);
  const lastEmail = await lastChallenge(svc, user.id, "email");

  const emailVerified = row.email_otp_verified_at != null;
  const emailAvailable = config.email && !throwaway;
  // Batch l15: a mobile confirmed by the WhatsApp sign-up code stands in for
  // the e-mail code (the user changed decision ٢٧). A failed read counts as
  // not confirmed — the e-mail step is then asked as before.
  const { data: phoneRow } = await svc.from("profiles").select("phone_verified_at").eq("id", user.id).maybeSingle();
  const phoneVerified = (phoneRow as { phone_verified_at?: unknown } | null)?.phone_verified_at != null;
  const decision: Decision = decideLawyerSignup({
    alreadyVerified: accountStatus === "verified",
    accountBlocked: accountStatus === "rejected" || accountStatus === "suspended",
    practiceKind,
    registryStatus: reg.status,
    nameMatch: reg.nameMatch,
    otherVerifiedClaims: reg.otherVerifiedClaims,
    licenceImageUploaded: image !== null,
    aiStatus: image?.ai_status ?? null,
    emailOtpVerified: emailVerified,
    phoneOtpVerified: phoneVerified,
    emailChannelAvailable: emailAvailable,
    mobileChangeRequested: row.mobile_change_requested_at != null,
    emailThrowaway: throwaway,
    instantApprovalEnabled: config.instantApproval,
  });

  let status: PublicState["status"] =
    decision.outcome === "verified" ? "verified" : decision.outcome === "approve" ? "approved" : decision.outcome;
  let reasons: string[] = decision.reasons;

  if (decision.outcome === "approve") {
    const result = await approveLawyerInstantly(svc, user.id);
    if (result !== "approved") {
      status = "review";
      reasons = [
        result === "claimed" ? "licence_claimed"
          : result === "fake_licence" ? "licence_fake_test"
            : result === "not_pending" ? "account_not_pending"
              : "approval_error",
      ];
    }
  }

  const now = new Date().toISOString();
  const dbDecision = status === "approved" || status === "verified" ? "approved" : status;
  const changed = row.decision !== dbDecision || JSON.stringify(row.decision_reasons ?? []) !== JSON.stringify(reasons) || row.email_throwaway !== throwaway;
  if (changed) {
    await svc
      .from("lawyer_signup_verifications")
      .update({
        decision: dbDecision,
        decision_reasons: reasons,
        email_throwaway: throwaway,
        ...(status === "approved" ? { decided_by: "system", decided_at: now } : {}),
        ...(status === "review" && row.decision !== "review" ? { decided_at: now, decided_by: null } : {}),
        updated_at: now,
      })
      .eq("user_id", user.id);
  }

  return {
    status,
    next: decision.next,
    holdMessage: status === "review" ? HOLD_MESSAGE_AR : null,
    practiceKind,
    licenceUploaded: image !== null,
    email: {
      masked: maskEmail(user.email),
      verified: emailVerified,
      available: emailAvailable,
      throwaway,
      lastSentAt: lastEmail?.created_at ?? null,
    },
  };
}

// ── licence photo ───────────────────────────────────────────────────────────

export type UploadOutcome = { ok: true } | { ok: false; status: number; error: string };

export async function storeLicenceImage(
  svc: Svc,
  user: User,
  file: File,
  purpose: "signup",
  fullName: string | null,
): Promise<UploadOutcome> {
  const config = cfg();
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const check = validateLicenceUpload({ size: file.size, type: file.type, head });
  if (!check.ok) return { ok: false, status: check.status, error: check.error };

  const bytes = await file.arrayBuffer();
  const path = `${user.id}/${Date.now()}-${randomUUID()}.${check.ext}`;
  const { error: upErr } = await svc.storage.from(LICENCE_BUCKET).upload(path, bytes, { contentType: check.contentType, upsert: false });
  if (upErr) {
    console.error("[lawyerSignup] licence upload failed:", upErr.message);
    return { ok: false, status: 503, error: "تعذّر رفع صورة الترخيص. أعد المحاولة." };
  }
  const { data: inserted, error: insErr } = await svc
    .from("lawyer_licence_images")
    .insert({ user_id: user.id, purpose, storage_path: path, mime: check.contentType, size_bytes: file.size })
    .select("id")
    .single();
  if (insErr || !inserted) {
    await svc.storage.from(LICENCE_BUCKET).remove([path]);
    if (isMissingSchema(insErr)) throw new SignupUnavailable("schema");
    console.error("[lawyerSignup] licence row insert failed:", insErr?.code);
    return { ok: false, status: 500, error: "تعذّر حفظ صورة الترخيص. أعد المحاولة." };
  }

  // The AI pre-check, against the typed name and the registry answer.
  const before = await readRow(svc, user.id);
  const name = typedName(user, before, fullName);
  const reg = await registryCheck(svc, user.id, name);
  const outcome = await readLicenceWithGemini({
    enabled: config.ai,
    apiKey: process.env.GEMINI_API_KEY,
    model: config.aiModel,
    bytes,
    mime: check.contentType,
  });
  let aiStatus: AiStatus;
  let aiResult: Record<string, unknown>;
  if (outcome.kind === "skipped") {
    aiStatus = "skipped";
    aiResult = { skipped: true };
  } else if (outcome.kind === "error") {
    aiStatus = "error";
    aiResult = { error: outcome.detail, model: config.aiModel };
  } else {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
    const cmp = compareExtracted(outcome.extracted, {
      typedName: name,
      licenceNo: reg.licence,
      registryName: reg.registryName,
      registryExpiry: reg.expiry,
      today,
    });
    aiStatus = cmp.verdict;
    aiResult = { verdict: cmp.verdict, checks: cmp.checks, extracted: cmp.extracted, model: config.aiModel };
  }
  await svc
    .from("lawyer_licence_images")
    .update({
      ai_status: aiStatus,
      ai_result: aiResult,
      ai_checked_at: new Date().toISOString(),
      provider_copy: outcome.kind === "skipped" ? "none" : "inline_not_stored",
    })
    .eq("id", (inserted as { id: string }).id);
  return { ok: true };
}

// ── codes ────────────────────────────────────────────────────────────────────

export type StartOutcome =
  | { ok: true; channel: "email"; hint: string | null; resendAfterSec: number; expiresInSec: number }
  | { ok: false; reason: "not_now" | "unavailable" | "failed" | "cooldown" | "user_limit" | "target_limit" | "throwaway" | "already"; retryAfterSec?: number };

async function issueAndSend(
  svc: Svc,
  args: {
    user: User;
    purpose: OtpPurpose;
    channel: "email";
    adapter: OtpChannelAdapter;
    pepper: string;
    target: string;
    hint: string | null;
    licenceNo: string | null;
  },
): Promise<StartOutcome> {
  const code = generateOtpCode();
  const { data, error } = await svc.rpc("lawyer_otp_issue", {
    p_user: args.user.id,
    p_purpose: args.purpose,
    p_channel: args.channel,
    p_licence_no: args.licenceNo,
    p_target_hash: hashOtpTarget(args.pepper, args.target),
    p_target_hint: args.hint,
    p_code_hash: hashOtpCode(args.pepper, args.user.id, args.purpose, code),
  });
  if (error) {
    if (isMissingSchema(error)) throw new SignupUnavailable("schema");
    console.error("[lawyerSignup] otp issue failed:", error.code);
    return { ok: false, reason: "failed" };
  }
  const j = (data ?? {}) as { ok?: boolean; id?: string; reason?: string; retry_after?: number };
  if (!j.ok || !j.id) {
    const reason = j.reason === "cooldown" || j.reason === "user_limit" || j.reason === "target_limit" ? j.reason : "failed";
    return { ok: false, reason, retryAfterSec: typeof j.retry_after === "number" ? j.retry_after : undefined };
  }
  const sent = await args.adapter.sendOtp(args.target, code, "ar");
  await svc
    .from("lawyer_otp_challenges")
    .update(sent === "sent" ? { delivery: "sent" } : { delivery: "failed", consumed_at: new Date().toISOString() })
    .eq("id", j.id);
  if (sent !== "sent") return { ok: false, reason: sent === "unavailable" ? "unavailable" : "failed" };
  return { ok: true, channel: args.channel, hint: args.hint, resendAfterSec: OTP_RESEND_SECONDS, expiresInSec: OTP_TTL_MINUTES * 60 };
}

/** The e-mail code — to the address of the account itself (never a typed one). */
export async function startEmailOtp(svc: Svc, user: User): Promise<StartOutcome> {
  const config = cfg();
  const email = (user.email ?? "").trim();
  if (!email) return { ok: false, reason: "unavailable" };
  if (isThrowawayEmail(email)) return { ok: false, reason: "throwaway" };
  const row = await readRow(svc, user.id);
  if (row?.email_otp_verified_at) return { ok: false, reason: "already" };
  if (!config.pepper || !config.email) return { ok: false, reason: "unavailable" };
  return issueAndSend(svc, {
    user,
    purpose: "email",
    channel: "email",
    adapter: resendEmailAdapter(process.env, config),
    pepper: config.pepper,
    target: email.toLowerCase(),
    hint: maskEmail(email),
    licenceNo: null,
  });
}

export type VerifyOutcome =
  | { ok: true }
  | { ok: false; reason: "wrong" | "expired" | "locked" | "unavailable"; attemptsLeft?: number };

export async function verifyOtp(svc: Svc, user: User, purpose: OtpPurpose, code: string): Promise<VerifyOutcome> {
  const config = cfg();
  if (!config.pepper) return { ok: false, reason: "unavailable" };
  const { data, error } = await svc.rpc("lawyer_otp_verify", {
    p_user: user.id,
    p_purpose: purpose,
    p_code_hash: hashOtpCode(config.pepper, user.id, purpose, code),
  });
  if (error) {
    if (isMissingSchema(error)) throw new SignupUnavailable("schema");
    console.error("[lawyerSignup] otp verify failed:", error.code);
    return { ok: false, reason: "unavailable" };
  }
  const j = (data ?? {}) as { ok?: boolean; reason?: string; attempts_left?: number };
  if (j.ok) return { ok: true };
  const reason = j.reason === "wrong" || j.reason === "locked" ? j.reason : "expired";
  return { ok: false, reason, attemptsLeft: typeof j.attempts_left === "number" ? j.attempts_left : undefined };
}

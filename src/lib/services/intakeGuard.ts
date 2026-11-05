/**
 * intakeGuard.ts — server-side dispatcher over the four AI intake validators.
 *
 * The validators (orderIntake.ts / .contracts.ts / .wargaming.ts /
 * .legalOpinion.ts) ran ONLY in the browser: every wizard validates before
 * submitting, but POST /api/v1/service-requests stored `metadata` verbatim, so
 * a direct POST could persist a contracts draft with unnamed parties, a review
 * with no contract file, or a wargaming critique with no memo — an order the
 * admin cannot fulfil. This module is the same contract, enforced on the
 * server.
 *
 * Pure: no I/O, no clock, no Supabase — unit-testable with `node --test`, like
 * the validators it dispatches to.
 *
 * Every wizard submits `check.value` — the validator's OWN output — as
 * `metadata.intake` (useDraftState.ts:161, useContractsState.ts:205/258,
 * ai/wargaming/page.tsx:946, ai/legal-opinion/page.tsx:403,
 * LetterWorkflow.tsx:186). So the server never re-validates raw wizard state,
 * it re-validates validator output: the property that keeps every live submit
 * path working is `validate(validate(x).value).ok === true`, asserted per
 * service in intakeGuard.test.ts rather than assumed.
 */

import {
  isRecord,
  str,
  validateDraftIntake,
  type ServiceKey,
  type ValidationResult,
} from "./orderIntake.ts";
import { validateContractsIntake } from "./orderIntake.contracts.ts";
import { validateWargamingIntake } from "./orderIntake.wargaming.ts";
import { validateLegalOpinionIntake } from "./orderIntake.legalOpinion.ts";
import { BRIEF_REVIEW_SERVICE, validateBriefReviewMetadata } from "./briefReviewOrder.ts";
import { COURT_CHOICES } from "../../app/dashboard/lawyer/_components/courtTypes.ts";

export type IntakeGuardResult =
  /** No AI intake on this request — legacy/non-AI orders pass through. */
  | { kind: "pass" }
  | { kind: "ok"; service: GuardedService }
  | { kind: "invalid"; service: GuardedService; errors: string[] };

/** The four wizard services, plus the team-reviewed memo order. */
export type GuardedService = ServiceKey | typeof BRIEF_REVIEW_SERVICE;

const VALIDATOR_BY_SERVICE: Record<ServiceKey, (input: unknown) => ValidationResult<unknown>> = {
  draft: validateDraftIntake,
  contracts: validateContractsIntake,
  wargaming: validateWargamingIntake,
  legal_opinion: validateLegalOpinionIntake,
};

/**
 * The service keys this guard knows how to check, read off the dispatch table
 * itself so the two can never drift apart. `hasOwnProperty`, not `in`: `"toString"
 * in VALIDATOR_BY_SERVICE` is true and would resolve a service that has no
 * validator.
 */
function asServiceKey(v: unknown): ServiceKey | null {
  const s = str(v);
  return Object.prototype.hasOwnProperty.call(VALIDATOR_BY_SERVICE, s) ? (s as ServiceKey) : null;
}

/**
 * Check the `metadata` of an incoming service request against the intake
 * contract for whichever AI service it claims to be.
 *
 * Pass-through rules, in order — an order that is not one of the four AI
 * services must reach the insert untouched (consultation bookings, case
 * requests, contract requests and every other `createWorkflowRequest` caller
 * send a `metadata` with no `intake` at all, or none at all):
 *   1. no metadata object, or no `metadata.intake` → pass.
 *   2. `metadata.intake` present but neither it nor `metadata` names a service
 *      key this guard knows → pass (a shape outside this contract).
 *
 * The service is resolved from `metadata.intake.service` first — the validators
 * check that same discriminant themselves — and falls back to
 * `metadata.service`. The fallback matters: without it a payload could claim to
 * be a draft order in `metadata.service` (which is what the admin queue and the
 * order pages read) while omitting `intake.service`, and slip past unchecked.
 * `createServiceOrder` is the only caller that writes either field, and it
 * always writes both from the same validated value, so the fallback cannot
 * fire on a live path.
 */
export function checkOrderIntake(metadata: unknown): IntakeGuardResult {
  if (!isRecord(metadata)) return { kind: "pass" };

  // «مراجعة وتدقيق مذكرة» (briefReviewOrder.ts) is not a wizard ServiceKey, so
  // the dispatch table below would let it through unchecked; and unlike the
  // wizards, a missing intake is itself invalid for it.
  if (metadata.service === BRIEF_REVIEW_SERVICE || (isRecord(metadata.intake) && metadata.intake.service === BRIEF_REVIEW_SERVICE)) {
    const errors = validateBriefReviewMetadata(metadata);
    return errors.length > 0
      ? { kind: "invalid", service: BRIEF_REVIEW_SERVICE, errors }
      : { kind: "ok", service: BRIEF_REVIEW_SERVICE };
  }

  const checked = checkWizardIntake(metadata);
  if (!checked) return { kind: "pass" };
  const { service, result } = checked;
  if (result.ok) return { kind: "ok", service };
  return { kind: "invalid", service, errors: result.errors };
}

/** The wizard service `metadata` claims and its validator's verdict, or null (no intake / unknown service). */
function checkWizardIntake(
  metadata: Record<string, unknown>,
): { service: ServiceKey; result: ValidationResult<unknown> } | null {
  const intake = metadata.intake;
  if (intake === undefined || intake === null) return null;
  const service =
    asServiceKey(isRecord(intake) ? intake.service : undefined) ?? asServiceKey(metadata.service);
  if (!service) return null;
  return { service, result: VALIDATOR_BY_SERVICE[service](intake) };
}

/** Keys a wizard adds to its intake after validating; nothing else outside the validated value is stored. */
const INTAKE_EXTRAS: Partial<Record<ServiceKey, readonly string[]>> = { contracts: ["contractId", "contractTitle"] };
const INTAKE_EXTRA_MAX = 200;

/** The allowed extras of one service: each kept only as a trimmed string of 1 to 200 characters. */
function extrasOf(service: ServiceKey, intake: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of INTAKE_EXTRAS[service] ?? []) {
    const value = intake[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length >= 1 && trimmed.length <= INTAKE_EXTRA_MAX) out[key] = trimmed;
  }
  return out;
}

/**
 * The `metadata` POST /api/v1/service-requests stores, once checkOrderIntake
 * has passed it. Every key goes through as sent, except two:
 *   - `intake` of the four wizard services is the validator's own `value`, not
 *     the raw body (Wave 1 task 8 re-review, S5-B1): a direct POST can no
 *     longer store what the validator cleans (a hidden party's leftover
 *     representative ID, «أخرى» text), an optional value it rejects, or a key
 *     it does not know. The one addition is INTAKE_EXTRAS: محترف العقود adds
 *     `contractId` / `contractTitle` after validating (useContractsState.ts),
 *     and the order view prints them. Every wizard otherwise sends the
 *     validator's value itself, and every validator returns its own output
 *     unchanged (intakeGuard.test.ts), so a live submit stores the same object
 *     as before. Pasted contract text is inside that value (ruling R12), and
 *     the S6 estimate stamp is added to this function's output by the route.
 *   - `courtClass` is kept only when it is one of the 14 classifications
 *     (COURT_CHOICES) and dropped otherwise (Wave 1 task 10 re-review), as
 *     courtClassOf already ignores it on read.
 * A `metadata` that is not an object is returned unchanged, `{}` for none.
 */
export function persistedRequestMetadata(metadata: unknown): unknown {
  if (!isRecord(metadata)) return metadata ?? {};
  const out: Record<string, unknown> = { ...metadata };
  // A memo-review order (briefReviewOrder.ts) is not a wizard intake: as sent.
  const briefReview =
    metadata.service === BRIEF_REVIEW_SERVICE || (isRecord(metadata.intake) && metadata.intake.service === BRIEF_REVIEW_SERVICE);
  const checked = briefReview ? null : checkWizardIntake(metadata);
  if (checked?.result.ok && isRecord(metadata.intake) && isRecord(checked.result.value)) {
    out.intake = { ...checked.result.value, ...extrasOf(checked.service, metadata.intake) };
  }
  if ("courtClass" in out && !(typeof out.courtClass === "string" && (COURT_CHOICES as readonly string[]).includes(out.courtClass))) {
    delete out.courtClass;
  }
  return out;
}

/**
 * Join the validators' Arabic errors into one user-facing line for the API's
 * 400 body. The errors themselves already name what is missing ("وصف العقد
 * قصير جداً…", "المذكرة المراد نقضها غير موجودة…") — this only frames them.
 */
export function intakeErrorMessageAr(errors: string[]): string {
  return `بيانات الطلب غير مكتملة — ${errors.join("، ")}`;
}

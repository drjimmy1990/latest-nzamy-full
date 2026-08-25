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

export type IntakeGuardResult =
  /** No AI intake on this request — legacy/non-AI orders pass through. */
  | { kind: "pass" }
  | { kind: "ok"; service: ServiceKey }
  | { kind: "invalid"; service: ServiceKey; errors: string[] };

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

  const intake = metadata.intake;
  if (intake === undefined || intake === null) return { kind: "pass" };

  const service =
    asServiceKey(isRecord(intake) ? intake.service : undefined) ?? asServiceKey(metadata.service);
  if (!service) return { kind: "pass" };

  const result = VALIDATOR_BY_SERVICE[service](intake);
  if (result.ok) return { kind: "ok", service };
  return { kind: "invalid", service, errors: result.errors };
}

/**
 * Join the validators' Arabic errors into one user-facing line for the API's
 * 400 body. The errors themselves already name what is missing ("وصف العقد
 * قصير جداً…", "المذكرة المراد نقضها غير موجودة…") — this only frames them.
 */
export function intakeErrorMessageAr(errors: string[]): string {
  return `بيانات الطلب غير مكتملة — ${errors.join("، ")}`;
}

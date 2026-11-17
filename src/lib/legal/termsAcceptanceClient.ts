/**
 * Browser half of /api/v1/legal/terms-acceptance (R7).
 * Never throws: the callers decide what a failure means.
 */
import { CURRENT_TERMS_VERSION } from "./termsVersion";

export type TermsStatus =
  | { kind: "accepted" }
  | { kind: "needs_acceptance" }
  /** Anonymous, frozen, demo, migration not run, server error: ask nothing. */
  | { kind: "unknown" };

export async function fetchTermsStatus(): Promise<TermsStatus> {
  try {
    const res = await fetch("/api/v1/legal/terms-acceptance", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) return { kind: "unknown" };
    const body = (await res.json()) as { acceptedCurrent?: unknown; available?: unknown };
    // The table is not there yet (migration not run): the modal stays closed,
    // and onboarding still shows its consent box — "accepted" would hide it.
    if (body.available === false) return { kind: "unknown" };
    if (body.acceptedCurrent === true) return { kind: "accepted" };
    if (body.acceptedCurrent === false) return { kind: "needs_acceptance" };
    return { kind: "unknown" };
  } catch {
    return { kind: "unknown" };
  }
}

export type RecordOutcome = { ok: true } | { ok: false; error: string | null };

export async function recordTermsAcceptance(context: "signup" | "relogin"): Promise<RecordOutcome> {
  try {
    const res = await fetch("/api/v1/legal/terms-acceptance", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ version: CURRENT_TERMS_VERSION, context }),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    return { ok: false, error: typeof body?.error === "string" ? body.error : null };
  } catch {
    return { ok: false, error: null };
  }
}

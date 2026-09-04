/**
 * profileFormTransform.ts — pure shaping of a settings tab's raw string form
 * state into the `values` object `splitProfileForm(userType, values)`
 * (profileSettingsFields.ts) expects, plus the shared rule for which fields
 * a tab renders but must never submit (Phase 6, task S1).
 * ─────────────────────────────────────────────────────────
 * `profileFieldsFor(userType)` lists every field ProfileTab could show,
 * INCLUDING two the route does not accept:
 *   • "email" (profiles.email) — auth-owned, never in the PATCH allowlist.
 *   • "licenseExpiry" targeting "lawyer" (lawyer_profiles.license_expiry) —
 *     a real column the route's `lawyerFields` allowlist does not carry
 *     (task S1 authorizes `license_issued_on` and `office_address`, not
 *     `license_expiry`). The SAME key targeting "entitySettings" (the
 *     provider role's own `licenseExpiry`) has no such gap —
 *     `entitySettings` accepts any well-formed key — so only the
 *     lawyer-targeted one is excluded here.
 * Both render read-only in the UI and are dropped from the outgoing values
 * here, so a disabled input can never silently fail to save.
 *
 * Kept framework-free (no "@/" imports) so `node --test` can run it
 * directly — same reason preferencesMerge.ts and profileEntityFields.ts stay
 * framework-free.
 */

export interface ProfileFieldLike {
  key: string;
  type?: "text" | "tel" | "email" | "date" | "number" | "textarea";
  target: "profile" | "lawyer" | "entitySettings";
  /** Real column name, when it differs from `key` (mirrors ProfileFieldSpec.column). */
  column?: string;
}

/** Never sent — auth-owned, or not (yet) accepted by the route. Always read-only in the UI. */
const READONLY_KEYS = new Set(["email"]);

/** A NOT NULL column (no usable default once the row exists) with no meaningful "cleared" value — leave it. */
const OMIT_WHEN_EMPTY_KEYS = new Set(["displayName", "phone"]);

/** A NOT NULL column with a `''` default — CAN be cleared, but to `""`, never `null`. */
const EMPTY_STRING_WHEN_EMPTY_KEYS = new Set(["bio"]);

/**
 * True for a field this tab renders but never submits. `email` always;
 * `licenseExpiry` only when it targets `lawyer` — the provider role's
 * `entitySettings`-targeted `licenseExpiry` DOES submit.
 */
export function isReadOnlyProfileField(field: ProfileFieldLike): boolean {
  if (READONLY_KEYS.has(field.key)) return true;
  if (field.key === "licenseExpiry" && field.target === "lawyer") return true;
  return false;
}

/**
 * `lawyer_profiles.specialties` is `text[]` — the one field in this tab
 * backed by a real array column. Every other field (including a
 * same-named "specialties" an entity-settings screen might add) is a plain
 * scalar, so this check is scoped to the exact column, not just the key.
 */
function isLawyerSpecialties(field: ProfileFieldLike): boolean {
  return field.key === "specialties" && field.target === "lawyer";
}

/** "قانون تجاري، عقود" / "قانون تجاري, عقود" → ["قانون تجاري", "عقود"] (both comma forms, trimmed, blanks dropped). */
export function splitCommaList(raw: string): string[] {
  return raw
    .split(/[،,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Shapes one field's raw string input into the value `splitProfileForm`
 * should receive, or `undefined` to omit the key from the outgoing body
 * entirely (a NOT-NULL column whose only "leave it alone" spelling is
 * omission).
 */
export function shapeFieldValue(field: ProfileFieldLike, raw: string): unknown {
  if (isReadOnlyProfileField(field)) return undefined;

  if (isLawyerSpecialties(field)) return splitCommaList(raw);

  if (field.type === "number") {
    const trimmed = raw.trim();
    if (trimmed === "") return undefined;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : undefined;
  }

  if (field.type === "date") {
    const trimmed = raw.trim();
    return trimmed === "" ? null : trimmed.slice(0, 10);
  }

  const trimmed = raw.trim();
  if (trimmed !== "") return trimmed;
  if (OMIT_WHEN_EMPTY_KEYS.has(field.key)) return undefined;
  if (EMPTY_STRING_WHEN_EMPTY_KEYS.has(field.key)) return "";
  return null;
}

/**
 * The display string for one field's raw server value — the read-side
 * counterpart of `shapeFieldValue`. `source` is `profile`, `roleProfile` or
 * `entitySettings` depending on `field.target`; the caller picks which.
 *
 * `null`/`undefined` (including a missing `source`) render as `""` — a form
 * input has no way to show "unset" other than empty. Lawyer specialties (the
 * one `text[]` field this tab has) join with the Arabic comma, mirroring
 * `splitCommaList`'s separator; a date is sliced to its first 10 characters
 * in case the server ever returns a full timestamp instead of a bare date.
 */
export function readProfileFieldValue(
  field: ProfileFieldLike,
  source: Record<string, unknown> | null | undefined,
): string {
  const raw = source ? source[field.column ?? field.key] : undefined;
  if (raw === null || raw === undefined) return "";
  if (isLawyerSpecialties(field) && Array.isArray(raw)) return raw.join("، ");
  if (field.type === "date" && typeof raw === "string") return raw.slice(0, 10);
  if (typeof raw === "number") return String(raw);
  if (typeof raw === "string") return raw;
  return String(raw);
}

/**
 * Builds the `values` object for `splitProfileForm(userType, values)`:
 * every field of `fields` that has a raw entry in `formValues`, shaped by
 * `shapeFieldValue` — `undefined` results (read-only fields, blank
 * omit-on-empty fields, unparsable numbers) are dropped, not sent as
 * `undefined`.
 *
 * `loadedValues` (optional) makes this DIFF-AWARE: a field whose raw string
 * is identical to what was loaded from the server is skipped entirely,
 * regardless of what it would shape to. This closes two problems at once:
 *
 *   1. A NOT-NULL-but-nullable column that isn't on the schema yet (e.g. a
 *      migration not yet run on production) is never sent unless the caller
 *      actually typed into it — an untouched field can no longer 400/500 the
 *      whole PATCH just because ProfileTab always seeds every field, blank
 *      or not, into `formValues` on load.
 *   2. A field that rendered blank because the LOAD failed for its source
 *      table (not because the stored value is actually blank) is, by
 *      definition, untouched too — so it is never sent, and can never
 *      shallow-merge a blank over a real stored value. This is a second,
 *      independent line of defense behind the `loadFailed`/Save-disable gate
 *      the tab itself keeps for that same failure.
 *
 * A key ABSENT from `loadedValues` (the default `{}`, or a caller — such as
 * this module's own tests — that never loaded a baseline) is treated as
 * "unknown baseline" and always considered changed, so every existing
 * two-argument call keeps its pre-diff behavior: every field present in
 * `formValues` is still shaped and included exactly as before.
 */
export function buildProfileSubmitValues(
  fields: ProfileFieldLike[],
  formValues: Record<string, string>,
  loadedValues: Record<string, string> = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (!(field.key in formValues)) continue;
    if (field.key in loadedValues && formValues[field.key] === loadedValues[field.key]) continue;
    const shaped = shapeFieldValue(field, formValues[field.key]);
    if (shaped !== undefined) out[field.key] = shaped;
  }
  return out;
}

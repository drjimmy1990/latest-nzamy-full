/**
 * testRow.ts — is this row TEST data? (batch l7, decision 3: rows a test
 * account creates are tagged and shown «تجريبي».)
 *
 * The database tags them (20261127_80): every service_requests /
 * consultations / lawyer_clients row that touches a test account carries
 * metadata.test_account = true, and a test account's payment_orders row too.
 * A list may pass the whole metadata, the row itself (`row.metadata`), or a
 * PostgREST alias `test_account:metadata->test_account` (`row.test_account`).
 * Anything else — untagged rows, rows read before the migration — is not test.
 *
 * Pure: no imports, so `node --test` loads it (testRow.test.ts).
 */

export const TEST_ROW_LABEL_AR = "تجريبي";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** metadata.test_account === true (the boolean, or the JSON text 'true'). */
export function isTestMetadata(metadata: unknown): boolean {
  if (!isRecord(metadata)) return false;
  const v = metadata.test_account;
  return v === true || v === "true";
}

/** A row: its own `test_account` alias, or its `metadata`. */
export function isTestRow(row: unknown): boolean {
  if (!isRecord(row)) return false;
  if (row.test_account === true || row.test_account === "true") return true;
  return isTestMetadata(row.metadata);
}

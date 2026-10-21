const ARTICLE_DETAIL_STATUSES = new Set([
  'active', 'amended', 'repealed', 'suspended', 'added', 'merged', 'status_undeclared',
]);

/** Detail API boundary: absence is unknown, and a malformed stored token fails closed. */
export function articleStatusForDetail(rawValue: unknown): string {
  const status = rawValue == null ? '' : String(rawValue).trim();
  if (status === '') return 'status_undeclared';
  if (!ARTICLE_DETAIL_STATUSES.has(status)) {
    throw new Error(`unknown article status "${status}" in law detail response`);
  }
  return status;
}


/**
 * metadata.internalNotes is a private note admins write for the team (see
 * the admin service-orders PATCH route's deliver/cancel branches, which are
 * the only place it is ever written). It must never cross a trust boundary:
 * not into a non-admin caller's response from either service-requests route
 * (the [id] detail route or the list route), and not into an n8n webhook
 * payload — n8n is a third-party automation platform outside the
 * application entirely, so it is stripped there unconditionally, regardless
 * of who triggered the event.
 *
 * One helper, reused at every one of those boundaries, so the strip is
 * structural: a new caller has to go out of its way to reintroduce the leak
 * (spread the raw row instead of calling this), rather than each call site
 * carrying its own copy of the `delete` that can silently drift or get
 * skipped.
 */
export function stripInternalNotes(
  metadata: Record<string, unknown> | null | undefined,
  isAdmin: boolean,
): Record<string, unknown> | null | undefined {
  if (isAdmin) return metadata;
  if (!metadata || typeof metadata !== "object" || !("internalNotes" in metadata)) {
    return metadata;
  }
  const sanitized = { ...metadata };
  delete sanitized.internalNotes;
  return sanitized;
}

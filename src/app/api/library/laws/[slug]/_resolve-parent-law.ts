export interface ParentLawCandidate {
  slug: string | null;
  title: string | null;
  status: string | null;
  type: string | null;
  instrument_id: string | null;
}

export interface ParentLawLink {
  slug: string;
  title: string;
}

// These are the exact lifecycle values permitted by the current DB contract.
// Archival registry-only states such as superseded_duplicate and
// merged_into_parent are intentionally absent.
const LINKABLE_PARENT_STATUSES = new Set([
  "active",
  "partially_active",
  "deferred_effective",
  "issued_publication_unverified",
  "suspended",
  "repealed",
  "status_undeclared",
]);

// A secondary instrument cannot itself be selected as the system/decision
// parent. A Decision or Royal Order may legitimately be a parent, so the
// deny-list is deliberately narrower than "anything other than نظام".
const SECONDARY_INSTRUMENT_TYPES = new Set([
  "لائحة",
  "لائحة تنفيذية",
  "لائحة تنظيمية",
  "قواعد",
  "ضوابط",
  "تعليمات",
  "آلية",
  "إجراءات",
  "متطلبات",
  "مواصفة",
  "regulation",
]);

/**
 * Resolve only an unambiguous, non-self, non-secondary parent candidate.
 * Ambiguity fails closed: callers still display the source parent_law text,
 * but must not create a potentially misleading hyperlink.
 */
export function resolveParentLawLink(
  childSlug: string,
  parentInstrumentId: string,
  candidates: ParentLawCandidate[] | null | undefined,
): ParentLawLink | null {
  const expectedId = parentInstrumentId.trim();
  if (!expectedId) return null;

  const eligible = (candidates || []).filter((candidate) => {
    const slug = String(candidate.slug || "").trim();
    const title = String(candidate.title || "").trim();
    const instrumentId = String(candidate.instrument_id || "").trim();
    const status = String(candidate.status || "").trim();
    const type = String(candidate.type || "").trim();
    return Boolean(slug && title)
      && slug !== childSlug
      && instrumentId === expectedId
      && LINKABLE_PARENT_STATUSES.has(status)
      && !SECONDARY_INSTRUMENT_TYPES.has(type);
  });

  if (eligible.length !== 1) return null;
  return {
    slug: String(eligible[0].slug).trim(),
    title: String(eligible[0].title).trim(),
  };
}

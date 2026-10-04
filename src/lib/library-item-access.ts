/**
 * Pure entitlement checks for a specific library item.
 *
 * `library_whitelisted_laws` is deliberately law-slug-only.  A matching value
 * must never unlock a differently typed item whose id happens to collide.
 * `principles` is the canonical free-items key for judicial principles.
 */
export type LibraryFreeItemType = "laws" | "decrees" | "principles" | "feqh" | "books";

export interface LibraryItemAccessInput {
  contentType: LibraryFreeItemType;
  itemId: string;
  hasFullAccess: boolean;
  freeItemsByType: Record<string, string[]>;
  whitelistedLawSlugs: string[];
}

export function isExplicitlyFreeLibraryItem({
  contentType,
  itemId,
  freeItemsByType,
  whitelistedLawSlugs,
}: Omit<LibraryItemAccessInput, "hasFullAccess">): boolean {
  const typedItems = freeItemsByType[contentType];
  return (
    (contentType === "laws" && whitelistedLawSlugs.includes(itemId)) ||
    (Array.isArray(typedItems) && typedItems.includes(itemId))
  );
}

export function isFreeLibraryItem(input: LibraryItemAccessInput): boolean {
  return input.hasFullAccess || isExplicitlyFreeLibraryItem(input);
}

/**
 * navigation.comingSoon.ts — the menus' unbuilt rows.
 *
 * Owner ق٢٦-١ (package 2026-11-26) supersedes owner UX08 (2026-10-30): a tool
 * that is not built yet («قريباً») or built but not switched on («قيد
 * التفعيل») is HIDDEN from every account's sidebar, not gathered in a last
 * «قريباً» section. The static menus keep their rows and badges (the pages
 * and other tests read them); withoutUnbuiltItems() takes them out of the
 * menu a user is drawn. A row backed by a registry tool (`liveToolId`) comes
 * back, without its badge, once tool-status confirms the tool runs for this
 * user (withLiveToolBadges, applied first).
 *
 * Pure so node --test can load it.
 */
import type { SidebarGroup, SidebarItem } from "./navigation.types";

export const COMING_SOON_BADGE = "قريباً";

export function isComingSoonItem(item: SidebarItem): boolean {
  return item.badge === COMING_SOON_BADGE;
}

/**
 * Batch l12 (owner ١٢٣): a built tool waiting for its live switch (n8n import,
 * admin mode) says «قيد التفعيل», not «قريباً». Like a «قريباً» row it is
 * hidden from the menu (ق٢٦-١) until tool-status confirms the tool runs for
 * this user; then it shows without the badge.
 */
export const PENDING_ACTIVATION_BADGE = "قيد التفعيل";

/** A row whose badge drops when its `liveToolId` is confirmed live. */
function awaitsLiveTool(item: SidebarItem): boolean {
  return !!item.liveToolId && (isComingSoonItem(item) || item.badge === PENDING_ACTIVATION_BADGE);
}

/**
 * BUG-12 (owner package 2026-11-06): a «قريباً» row backed by an AI registry
 * tool (`liveToolId`) loses the badge once tool-status confirmed the tool is
 * open for this user. Applied BEFORE withoutUnbuiltItems, so a live tool stays
 * in the menu (in its own group). Without a confirmation
 * (loading, refused, failed read) nothing changes.
 */
export function withLiveToolBadges(groups: SidebarGroup[], liveTools: ReadonlySet<string> | null | undefined): SidebarGroup[] {
  if (!liveTools || liveTools.size === 0) return groups;
  const isLive = (item: SidebarItem) => awaitsLiveTool(item) && liveTools.has(item.liveToolId!);
  return groups.map((group) => {
    if (!group.items.some(isLive)) return group;
    return {
      ...group,
      items: group.items.map((item) => {
        if (!isLive(item)) return item;
        const { badge: _badge, ...rest } = item; // eslint-disable-line @typescript-eslint/no-unused-vars
        return rest;
      }),
    };
  });
}

/** The registry tools whose status the sidebar should ask about: «قريباً» rows with a liveToolId. */
export function comingSoonToolIds(groups: SidebarGroup[]): string[] {
  const ids = new Set<string>();
  for (const group of groups) {
    for (const item of group.items) {
      if (awaitsLiveTool(item)) ids.add(item.liveToolId!);
    }
  }
  return [...ids].sort();
}

/** A row of a tool that is not built («قريباً») or not switched on («قيد التفعيل»). */
export function isUnbuiltItem(item: SidebarItem): boolean {
  return isComingSoonItem(item) || item.badge === PENDING_ACTIVATION_BADGE;
}

/**
 * A dashboard's own home row (/dashboard/<type>) is never hidden, even when
 * its page is a «قريباً» notice (the provider's): without it the menu has no
 * way back to the account's dashboard. Its badge stays, so it promises nothing.
 */
export function isDashboardHomeHref(href: string): boolean {
  return /^\/dashboard\/[a-z]+$/.test(href);
}

/**
 * Removes rows a filter rejects, recursively through `children`. A removed row
 * that carried a divider hands it to the next row kept in its group, so the
 * visual breaks between sub-sections survive. A group this empties is dropped
 * (a group that was already empty is left alone). Returns the same array when
 * nothing is removed.
 */
export function withoutItems(groups: SidebarGroup[], drop: (item: SidebarItem) => boolean): SidebarGroup[] {
  let changed = false;
  const keep = (items: SidebarItem[]): SidebarItem[] => {
    const out: SidebarItem[] = [];
    let pendingDivider = false;
    for (const item of items) {
      if (drop(item)) {
        changed = true;
        if (item.divider) pendingDivider = true;
        continue;
      }
      let next = item;
      if (item.children) {
        const children = keep(item.children);
        if (children !== item.children) next = { ...next, children };
      }
      if (pendingDivider && out.length > 0 && !next.divider) next = { ...next, divider: true };
      pendingDivider = false;
      out.push(next);
    }
    return out.length === items.length && out.every((x, i) => x === items[i]) ? items : out;
  };
  const result = groups.flatMap((group) => {
    const items = keep(group.items);
    if (items === group.items) return [group];
    return items.length === 0 && group.items.length > 0 ? [] : [{ ...group, items }];
  });
  return changed ? result : groups;
}

/**
 * Owner ق٢٦-١: the menu a user is drawn shows no «قريباً» / «قيد التفعيل» row.
 * Run AFTER withLiveToolBadges: a registry tool confirmed open has already lost
 * its badge and stays. The dashboard home row is kept (isDashboardHomeHref).
 */
export function withoutUnbuiltItems(groups: SidebarGroup[]): SidebarGroup[] {
  return withoutItems(groups, (item) => isUnbuiltItem(item) && !isDashboardHomeHref(item.href));
}

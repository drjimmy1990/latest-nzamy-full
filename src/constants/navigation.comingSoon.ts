/**
 * navigation.comingSoon.ts — the lawyer menu's «قريباً» section (owner UX08,
 * package 2026-10-30).
 *
 * The lawyer sidebar mixed tools that work with tools badged «قريباً» inside
 * the same groups (the AI group alone carried three), so a lawyer had to scan
 * past promises to reach the daily work. This moves every «قريباً» row out of
 * its group, in order, into ONE last group titled «قريباً», closed by
 * default. Nothing is added or removed — the same hrefs, the same badges —
 * only where they sit. A group left empty is dropped. A row that carried a
 * divider hands it to the next row left in its group, so the visual breaks
 * between sub-sections survive.
 *
 * Pure so node --test can load it.
 */
import type { SidebarGroup, SidebarItem } from "./navigation.types";

export const COMING_SOON_BADGE = "قريباً";

export const COMING_SOON_GROUP_TITLE = "قريباً";

export function isComingSoonItem(item: SidebarItem): boolean {
  return item.badge === COMING_SOON_BADGE;
}

/**
 * BUG-12 (owner package 2026-11-06): a «قريباً» row backed by an AI registry
 * tool (`liveToolId`) loses the badge once tool-status confirmed the tool is
 * open for this user. Applied BEFORE withComingSoonLast, so a live tool stays
 * in its own group instead of the «قريباً» section. Without a confirmation
 * (loading, refused, failed read) nothing changes.
 */
export function withLiveToolBadges(groups: SidebarGroup[], liveTools: ReadonlySet<string> | null | undefined): SidebarGroup[] {
  if (!liveTools || liveTools.size === 0) return groups;
  const isLive = (item: SidebarItem) => !!item.liveToolId && liveTools.has(item.liveToolId) && isComingSoonItem(item);
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
      if (item.liveToolId && isComingSoonItem(item)) ids.add(item.liveToolId);
    }
  }
  return [...ids].sort();
}

export function withComingSoonLast(groups: SidebarGroup[]): SidebarGroup[] {
  const soon: SidebarItem[] = [];
  const kept: SidebarGroup[] = [];

  for (const group of groups) {
    if (!group.items.some(isComingSoonItem)) {
      kept.push(group);
      continue;
    }
    const items: SidebarItem[] = [];
    let pendingDivider = false;
    for (const item of group.items) {
      if (isComingSoonItem(item)) {
        if (item.divider) pendingDivider = true;
        const { divider: _divider, ...rest } = item; // eslint-disable-line @typescript-eslint/no-unused-vars
        soon.push(rest);
        continue;
      }
      if (pendingDivider && items.length > 0 && !item.divider) {
        items.push({ ...item, divider: true });
      } else {
        items.push(item);
      }
      pendingDivider = false;
    }
    if (items.length > 0) kept.push({ ...group, items });
  }

  if (soon.length === 0) return groups;
  return [
    ...kept,
    {
      title: COMING_SOON_GROUP_TITLE,
      titleEn: "Coming soon",
      collapsible: true,
      defaultOpen: false,
      items: soon,
    },
  ];
}

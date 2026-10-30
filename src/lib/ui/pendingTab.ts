/**
 * pendingTab.ts — open a document in a new tab when its URL is only known
 * after an `await` (CODE-F38, owner package 2026-10-30).
 *
 * `window.open(url)` called after an await is no longer inside the click, so
 * a popup blocker may stop it — and the old code ignored the `null` it then
 * returns, so «عرض» did nothing at all. The fix:
 *
 *   1. During the click, before any await: `openPendingTab()` opens an empty
 *      tab. A click handler's synchronous part is a user gesture, so this is
 *      not blocked in practice.
 *   2. When the signed URL arrives: `tab.navigate(url)` points that tab at it
 *      (after cutting `opener`, so the document cannot reach back into this
 *      page — what "noopener" used to give).
 *   3. If the URL could not be made: `tab.close()` closes the empty tab.
 *   4. If the tab could not be opened at all (`navigate` returns false), the
 *      caller shows a visible link or message instead of failing silently.
 *
 * Note: `noopener` must NOT be passed to the first open — with it, the
 * browser returns null by design and step 2 has nothing to point.
 *
 * Pure: the window is passed in, so `node --test` can use a fake.
 */

export interface PendingTab {
  /** Point the tab at `url`. false when no tab could be opened — show a fallback. */
  navigate(url: string): boolean;
  /** Close the empty tab (the URL could not be made). Safe to call twice. */
  close(): void;
  /** Whether a tab exists to navigate. */
  readonly opened: boolean;
}

interface TabLike {
  opener: unknown;
  closed?: boolean;
  location: { href: string };
  close(): void;
}

export interface OpenerLike {
  open(url?: string, target?: string, features?: string): TabLike | null;
}

export function openPendingTab(win: OpenerLike): PendingTab {
  let tab: TabLike | null = null;
  try {
    tab = win.open("about:blank", "_blank");
  } catch {
    tab = null;
  }
  return {
    get opened() {
      return tab !== null && tab.closed !== true;
    },
    navigate(url: string): boolean {
      if (!tab || tab.closed === true) return false;
      try {
        tab.opener = null;
        tab.location.href = url;
        return true;
      } catch {
        return false;
      }
    },
    close() {
      if (tab && tab.closed !== true) {
        try { tab.close(); } catch { /* already gone */ }
      }
    },
  };
}

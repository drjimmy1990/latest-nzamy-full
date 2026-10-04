/**
 * Which settings tab is open — T28-34 («no tab reset»).
 *
 * THE BUG THIS REPLACES. /settings used to start on `tabs[0]` of whatever
 * policy the FIRST render produced. `useUser()` starts every mount on
 * GUEST_SESSION (userType null), and a null type maps to the individual-client
 * policy — eight tabs — so a lawyer's page first drew the client's tab list
 * and ProfileTab, then swapped to the lawyer's list a round trip later. And an
 * effect reset the open tab to `tabs[0]` whenever the list stopped containing
 * it — including every time the session was merely re-read (a guest fallback,
 * a degraded membership read, a sign-out already navigating away). The tab
 * content is keyed by the open tab, so each reset remounted it and threw away
 * whatever the user had typed.
 *
 * THE RULES, in order:
 *   1. Nothing is chosen until the session has resolved once (`loading`
 *      false). Until then the page draws a skeleton, not somebody's tabs.
 *   2. At that first resolution the `?tab=` deep link wins if the resolved
 *      role actually has that tab; otherwise the role's first tab.
 *   3. After that, the open tab is only ever changed by the user, or when the
 *      resolved role genuinely does not have it. It is NEVER reset while the
 *      session is reloading (`loading` true again: an account switch in
 *      flight), while it is signed out (the page is leaving), or while the
 *      role read itself was incomplete (`uncertain`: a degraded or failed
 *      profile/membership read says nothing about the role, the same reason
 *      useUser carries the previous type forward on `unavailable`).
 *   4. A deep link is consumed by the first SIGNED-IN resolution. A first
 *      resolution as a guest (the browser could not read a session the server
 *      gate did see) does not consume it, so the real sign-in that follows
 *      still lands on the requested tab.
 *
 * Pure, no `@/` imports: `npm run test:unit` loads it straight through Node's
 * type stripping. The hook that feeds it is useSettingsTabs.ts.
 */

export interface SettingsTabState {
  /** null until the session has resolved once — the page shows a skeleton. */
  activeTab: string | null;
  /** True once a signed-in resolution has looked at `?tab=`. */
  deepLinkConsumed: boolean;
}

export interface SettingsTabInput {
  /** useUser().loading */
  loading: boolean;
  /** useUser().isLoggedIn */
  isLoggedIn: boolean;
  /** The role read behind `allowed` was degraded or failed. */
  uncertain: boolean;
  /** The tab ids the resolved policy shows, in display order. */
  allowed: readonly string[];
  /** `?tab=` from the URL, or null. */
  requested: string | null;
}

export const INITIAL_SETTINGS_TAB_STATE: SettingsTabState = {
  activeTab: null,
  deepLinkConsumed: false,
};

const FALLBACK_TAB = "profile";

function firstAllowed(allowed: readonly string[]): string {
  return allowed[0] ?? FALLBACK_TAB;
}

/**
 * The next state. Returns `state` itself (same reference) when nothing
 * changes, so a React `setState(prev => nextSettingsTab(prev, …))` bails out
 * without re-rendering.
 */
export function nextSettingsTab(
  state: SettingsTabState,
  input: SettingsTabInput,
): SettingsTabState {
  const { loading, isLoggedIn, uncertain, allowed, requested } = input;
  const requestedAllowed = requested !== null && allowed.includes(requested);

  // Rule 1 — not resolved yet.
  if (state.activeTab === null) {
    if (loading) return state;
    // Rule 2 — the first resolution.
    return {
      activeTab: requestedAllowed ? requested : firstAllowed(allowed),
      deepLinkConsumed: isLoggedIn,
    };
  }

  // Rule 3 — transient states never move the open tab.
  if (loading || !isLoggedIn || uncertain) return state;

  // Rule 4 — a deep link that arrived while the page had only a guest session.
  if (!state.deepLinkConsumed) {
    if (requestedAllowed && requested !== state.activeTab) {
      return { activeTab: requested, deepLinkConsumed: true };
    }
    if (allowed.includes(state.activeTab)) {
      return { activeTab: state.activeTab, deepLinkConsumed: true };
    }
    return { activeTab: firstAllowed(allowed), deepLinkConsumed: true };
  }

  // Rule 3 — reset only when the resolved role genuinely lacks the tab.
  if (allowed.length === 0 || allowed.includes(state.activeTab)) return state;
  return { activeTab: firstAllowed(allowed), deepLinkConsumed: true };
}

/** A click on a tab button. Ignored for an id the role does not show. */
export function selectSettingsTab(
  state: SettingsTabState,
  tabId: string,
  allowed: readonly string[],
): SettingsTabState {
  if (state.activeTab === tabId || !allowed.includes(tabId)) return state;
  return { ...state, activeTab: tabId };
}

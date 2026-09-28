import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INITIAL_SETTINGS_TAB_STATE,
  nextSettingsTab,
  selectSettingsTab,
  type SettingsTabInput,
  type SettingsTabState,
} from "./settingsActiveTab.ts";

// The tab lists getSettingsRolePolicy() produces (settingsReadiness.ts).
const CLIENT = ["profile", "security", "notifications", "privacy", "payments", "subscription", "referral", "help"];
const LAWYER_PRO = ["profile", "profession", "signature", "delegation", "team", "security", "notifications", "privacy", "payments", "subscription", "referral", "help"];
const LAWYER_FREE = LAWYER_PRO.filter((id) => id !== "team");
const CORPORATE_OWNER = ["profile", "role-scope", "entity", "team", "delegation", "invoice", "payments", "subscription", "compliance", "security", "notifications", "privacy", "help"];
const CORPORATE_UNREAD = ["profile", "role-scope", "security", "notifications", "privacy", "help"];

function input(overrides: Partial<SettingsTabInput>): SettingsTabInput {
  return {
    loading: false,
    isLoggedIn: true,
    uncertain: false,
    allowed: LAWYER_PRO,
    requested: null,
    ...overrides,
  };
}

/** Feeds a sequence of session snapshots through the reducer, like the hook's effect does. */
function run(steps: SettingsTabInput[], start: SettingsTabState = INITIAL_SETTINGS_TAB_STATE): SettingsTabState[] {
  const states: SettingsTabState[] = [];
  let state = start;
  for (const step of steps) {
    state = nextSettingsTab(state, step);
    states.push(state);
  }
  return states;
}

test("nothing is chosen while the session is still loading — the page shows a skeleton", () => {
  // The first render: useUser() is GUEST_SESSION + loading, whose null type maps
  // to the client policy. That list must never reach the screen.
  const state = nextSettingsTab(INITIAL_SETTINGS_TAB_STATE, input({ loading: true, isLoggedIn: false, allowed: CLIENT }));
  assert.equal(state.activeTab, null);
  assert.equal(state, INITIAL_SETTINGS_TAB_STATE, "unchanged state keeps its reference");
});

test("a lawyer page load lands on the lawyer's first tab, never on the client list", () => {
  const [loadingState, resolved] = run([
    input({ loading: true, isLoggedIn: false, allowed: CLIENT }),
    input({ allowed: LAWYER_PRO }),
  ]);
  assert.equal(loadingState.activeTab, null);
  assert.deepEqual(resolved, { activeTab: "profile", deepLinkConsumed: true });
});

test("?tab= is honoured once the real role is known", () => {
  const [, resolved] = run([
    input({ loading: true, isLoggedIn: false, allowed: CLIENT, requested: "profession" }),
    input({ allowed: LAWYER_PRO, requested: "profession" }),
  ]);
  assert.equal(resolved.activeTab, "profession");
});

test("?tab= for a tab the role does not have falls back to the first tab and stays consumed", () => {
  const [resolved, later] = run([
    input({ allowed: CLIENT, requested: "entity" }),
    input({ allowed: CLIENT, requested: "entity" }),
  ]);
  assert.deepEqual(resolved, { activeTab: "profile", deepLinkConsumed: true });
  assert.equal(later, resolved);
});

test("?tab= is not re-applied after the user has moved on", () => {
  let state = nextSettingsTab(INITIAL_SETTINGS_TAB_STATE, input({ requested: "profession" }));
  state = selectSettingsTab(state, "security", LAWYER_PRO);
  state = nextSettingsTab(state, input({ requested: "profession" }));
  assert.equal(state.activeTab, "security");
});

test("a silent re-read of the same role keeps the open tab and its reference", () => {
  const first = nextSettingsTab(INITIAL_SETTINGS_TAB_STATE, input({ requested: "signature" }));
  const again = nextSettingsTab(first, input({ requested: "signature" }));
  assert.equal(again, first);
});

test("an account switch in flight (loading again) never resets the tab", () => {
  let state = nextSettingsTab(INITIAL_SETTINGS_TAB_STATE, input({ requested: "team" }));
  state = nextSettingsTab(state, input({ loading: true, allowed: CLIENT }));
  assert.equal(state.activeTab, "team");
});

test("a sign-out (guest session) never resets the tab — the page is navigating away", () => {
  let state = nextSettingsTab(INITIAL_SETTINGS_TAB_STATE, input({ requested: "profession" }));
  state = nextSettingsTab(state, input({ isLoggedIn: false, allowed: CLIENT }));
  assert.equal(state.activeTab, "profession");
});

test("a degraded membership re-read never resets the tab", () => {
  let state = nextSettingsTab(INITIAL_SETTINGS_TAB_STATE, input({ allowed: CORPORATE_OWNER, requested: "entity" }));
  assert.equal(state.activeTab, "entity");
  state = nextSettingsTab(state, input({ allowed: CORPORATE_UNREAD, uncertain: true }));
  assert.equal(state.activeTab, "entity");
  // …and once the read recovers the tab is still there, never having moved.
  state = nextSettingsTab(state, input({ allowed: CORPORATE_OWNER }));
  assert.equal(state.activeTab, "entity");
});

test("a tab the resolved role genuinely lost is reset to the first tab", () => {
  // e.g. the plan dropped below the tiers that carry «الفريق والدعوات».
  let state = nextSettingsTab(INITIAL_SETTINGS_TAB_STATE, input({ requested: "team" }));
  state = nextSettingsTab(state, input({ allowed: LAWYER_FREE }));
  assert.deepEqual(state, { activeTab: "profile", deepLinkConsumed: true });
});

test("a first resolution as a guest does not consume the deep link; the real sign-in does", () => {
  const states = run([
    input({ loading: true, isLoggedIn: false, allowed: CLIENT, requested: "profession" }),
    // The browser could not read the session: guest, client policy.
    input({ isLoggedIn: false, allowed: CLIENT, requested: "profession" }),
    // The sign-in event raises `loading` again…
    input({ loading: true, isLoggedIn: false, allowed: CLIENT, requested: "profession" }),
    // …and resolves as the lawyer.
    input({ allowed: LAWYER_PRO, requested: "profession" }),
  ]);
  assert.deepEqual(states[1], { activeTab: "profile", deepLinkConsumed: false });
  assert.equal(states[2], states[1]);
  assert.deepEqual(states[3], { activeTab: "profession", deepLinkConsumed: true });
});

test("a guest-then-sign-in without a deep link keeps an allowed tab and replaces a lost one", () => {
  const kept = run([
    input({ isLoggedIn: false, allowed: CLIENT }),
    input({ allowed: LAWYER_PRO }),
  ]);
  assert.deepEqual(kept[1], { activeTab: "profile", deepLinkConsumed: true });

  let state = nextSettingsTab(INITIAL_SETTINGS_TAB_STATE, input({ isLoggedIn: false, allowed: CLIENT }));
  state = selectSettingsTab(state, "referral", CLIENT);
  state = nextSettingsTab(state, input({ allowed: CORPORATE_UNREAD }));
  assert.deepEqual(state, { activeTab: "profile", deepLinkConsumed: true });
});

test("selectSettingsTab ignores a tab the role does not show and repeated clicks", () => {
  const state = nextSettingsTab(INITIAL_SETTINGS_TAB_STATE, input({}));
  assert.equal(selectSettingsTab(state, "entity", LAWYER_PRO), state);
  assert.equal(selectSettingsTab(state, "profile", LAWYER_PRO), state);
  assert.equal(selectSettingsTab(state, "privacy", LAWYER_PRO).activeTab, "privacy");
});

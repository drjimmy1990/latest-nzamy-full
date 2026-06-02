"use client";

export type ClientGroupMembershipStatus = "none" | "subscribed" | "joined";

export type ClientGroupState = {
  status: ClientGroupMembershipStatus;
  groupId?: string;
  groupName?: string;
  joinedAt?: string;
};

export const CLIENT_GROUP_STORAGE_KEY = "nzamy_client_group_state_v1";
export const CLIENT_GROUP_UPDATED_EVENT = "nzamy-client-group-updated";

const EMPTY_GROUP_STATE: ClientGroupState = { status: "none" };

export function readClientGroupState(): ClientGroupState {
  if (typeof window === "undefined") return EMPTY_GROUP_STATE;
  try {
    const raw = window.localStorage.getItem(CLIENT_GROUP_STORAGE_KEY);
    if (!raw) return EMPTY_GROUP_STATE;
    const parsed = JSON.parse(raw) as ClientGroupState;
    if (parsed.status === "joined" || parsed.status === "subscribed") return parsed;
    return EMPTY_GROUP_STATE;
  } catch {
    return EMPTY_GROUP_STATE;
  }
}

export function hasActiveClientGroup(state = readClientGroupState()) {
  return state.status === "joined" || state.status === "subscribed";
}

export function saveClientGroupState(state: ClientGroupState) {
  if (typeof window === "undefined") return state;
  window.localStorage.setItem(CLIENT_GROUP_STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(CLIENT_GROUP_UPDATED_EVENT, { detail: state }));
  return state;
}

export function activateClientGroup(
  status: Exclude<ClientGroupMembershipStatus, "none">,
  groupName = "الرهبان القانونيين",
) {
  return saveClientGroupState({
    status,
    groupId: "grp-001",
    groupName,
    joinedAt: new Date().toISOString(),
  });
}

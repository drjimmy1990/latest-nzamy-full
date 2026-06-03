/**
 * groupService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode group service.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import {
  readClientGroupState,
  saveClientGroupState,
  activateClientGroup,
  hasActiveClientGroup,
  CLIENT_GROUP_STORAGE_KEY,
  CLIENT_GROUP_UPDATED_EVENT,
} from "@/lib/clientGroupStore";
import type { ClientGroupState, ClientGroupMembershipStatus } from "@/lib/clientGroupStore";

// Re-export
export type { ClientGroupState, ClientGroupMembershipStatus };
export { CLIENT_GROUP_STORAGE_KEY, CLIENT_GROUP_UPDATED_EVENT, hasActiveClientGroup };

// ─── API types ────────────────────────────────────────────────────────────────

export interface GroupDetail {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  max_members: number;
  member_count: number;
  is_active: boolean;
  created_at: string;
}

export interface GroupMember {
  id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
  status: "active" | "invited" | "removed";
  profile?: { display_name: string; avatar_url?: string };
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function getGroupState(): Promise<ClientGroupState> {
  if (!isSupabaseMode) return readClientGroupState();
  try {
    const groups = await apiGet<{ data: GroupDetail[] }>("/api/v1/groups");
    if (groups.data.length === 0) return { status: "none" };
    const group = groups.data[0];
    return {
      status: "joined",
      groupId: group.id,
      groupName: group.name,
      joinedAt: group.created_at,
    };
  } catch {
    return readClientGroupState();
  }
}

export async function getGroups(): Promise<GroupDetail[]> {
  if (!isSupabaseMode) {
    const state = readClientGroupState();
    if (!hasActiveClientGroup(state)) return [];
    return [{
      id: state.groupId || "grp-001",
      name: state.groupName || "الرهبان القانونيين",
      owner_id: "",
      max_members: 10,
      member_count: 1,
      is_active: true,
      created_at: state.joinedAt || new Date().toISOString(),
    }];
  }
  try {
    const response = await apiGet<{ data: GroupDetail[] }>("/api/v1/groups");
    return response.data;
  } catch {
    return [];
  }
}

export async function createGroup(data: { name: string; description?: string; max_members?: number }): Promise<GroupDetail> {
  if (!isSupabaseMode) {
    activateClientGroup("joined", data.name);
    return {
      id: `grp-${Date.now()}`,
      name: data.name,
      description: data.description,
      owner_id: "",
      max_members: data.max_members || 10,
      member_count: 1,
      is_active: true,
      created_at: new Date().toISOString(),
    };
  }
  return apiMutate<GroupDetail>("/api/v1/groups", "POST", data);
}

export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  if (!isSupabaseMode) return [];
  return (await apiGet<{ data: GroupMember[] }>(`/api/v1/groups/${groupId}/members`)).data;
}

export async function inviteToGroup(groupId: string, email: string): Promise<void> {
  if (!isSupabaseMode) return;
  await apiMutate(`/api/v1/groups/${groupId}/invite`, "POST", { email });
}

export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  if (!isSupabaseMode) return;
  await apiMutate(`/api/v1/groups/${groupId}/members`, "DELETE", { user_id: userId });
}

export async function leaveGroup(): Promise<void> {
  if (!isSupabaseMode) {
    saveClientGroupState({ status: "none" });
    return;
  }
  // In supabase mode, the user would remove themselves from the group
}

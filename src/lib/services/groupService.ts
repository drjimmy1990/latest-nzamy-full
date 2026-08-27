/**
 * groupService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode group service.
 *
 * The `!isSupabaseMode` guards in this file were already correct and are left
 * exactly as they were: in demo mode `clientGroupStore` IS the backend, and
 * reading it back is a real round-trip, not a fallback. What was wrong was the
 * supabase path — `getGroups` ended in `catch { return [] }` and `getGroupState`
 * answered a failed API call by reading the browser's group store, which hands
 * back whatever this browser last wrote (possibly under another account) as
 * though the server had said it.
 *
 * ── ONE THING THE SERVICE LAYER CANNOT FIX FROM HERE ────────────────────────
 * GET /api/v1/groups answers a Supabase error with `200 { data: [], total: 0 }`
 * and no `degraded` flag (route.ts lines 32, 51 and 57). Those three are
 * indistinguishable from a real empty result on the wire, so `getGroups()` will
 * still report `ok: true, items: []` for a broken query until the route sets
 * `degraded: true`. Line 38 is a genuine "this user has no memberships" and is
 * correct as it stands.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, type ListRead } from "@/lib/services/listRead";
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
  join_code?: string;
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

/**
 * The caller's group membership.
 *
 * THROWS in supabase mode rather than returning a `ListRead`: this is a single
 * value, not a list, and there is no room in `ClientGroupState` (owned by
 * clientGroupStore, not this file) for a fourth "unreadable" status. It is
 * awaited on its own at src/app/dashboard/client/my-group/page.tsx:168, not
 * inside a Promise.all, so a rejection costs nothing else on the page.
 *
 * The old `catch { return readClientGroupState() }` was the specific lie: a
 * failed call returned this browser's last known group — so a user whose
 * membership had been revoked, or who had signed in as somebody else, was shown
 * a group they are not in, with its name, as fact.
 */
export async function getGroupState(): Promise<ClientGroupState> {
  if (!isSupabaseMode) return readClientGroupState();
  const groups = await apiGet<{ data: GroupDetail[] }>("/api/v1/groups");
  if (!Array.isArray(groups?.data)) {
    throw new Error("تعذّرت قراءة بيانات المجموعة");
  }
  if (groups.data.length === 0) return { status: "none" };
  const group = groups.data[0];
  return {
    status: "joined",
    groupId: group.id,
    groupName: group.name,
    joinedAt: group.created_at,
  };
}

export async function getGroups(): Promise<ListRead<GroupDetail>> {
  // Demo path unchanged: clientGroupStore is the backend in that mode.
  if (!isSupabaseMode) {
    const state = readClientGroupState();
    if (!hasActiveClientGroup(state)) return listOk([]);
    return listOk([{
      id: state.groupId || "grp-001",
      name: state.groupName || "الرهبان القانونيين",
      owner_id: "",
      max_members: 10,
      member_count: 1,
      is_active: true,
      created_at: state.joinedAt || new Date().toISOString(),
    }]);
  }
  try {
    const response = await apiGet<{ data: GroupDetail[]; total?: number }>("/api/v1/groups");
    if (!Array.isArray(response?.data)) return listFailed<GroupDetail>();
    return listOk(response.data, response.total);
  } catch (error) {
    console.error("[groupService] getGroups failed:", error);
    return listFailed<GroupDetail>();
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
  // POST /api/v1/groups answers `{ data: group }` (route.ts:110). This was typed
  // as the bare row, so the caller got `{ data: … }` and every field it read off
  // the new group — id, name, join_code — was undefined.
  const res = await apiMutate<{ data: GroupDetail }>("/api/v1/groups", "POST", data);
  if (!res?.data) throw new Error("لم يصل تأكيد إنشاء المجموعة من الخادم");
  return res.data;
}

export async function getGroupMembers(groupId: string): Promise<ListRead<GroupMember>> {
  // Demo mode: the local group store keeps no member roster, so there is
  // genuinely nobody to list. Not a failure.
  if (!isSupabaseMode) return listOk([]);
  try {
    // Previously unguarded: this threw straight into the page's
    // `catch { /* keep empty */ }` (my-group/page.tsx:195), which rendered a
    // failed roster as a group with no members.
    const res = await apiGet<{ data: GroupMember[] }>(`/api/v1/groups/${groupId}/members`);
    if (!Array.isArray(res?.data)) return listFailed<GroupMember>();
    return listOk(res.data);
  } catch (error) {
    console.error("[groupService] getGroupMembers failed:", error);
    return listFailed<GroupMember>();
  }
}

export async function inviteToGroup(
  groupId: string,
  email?: string,
): Promise<{ inviteCode: string }> {
  if (!isSupabaseMode) return { inviteCode: "" };
  const res = await apiMutate<{ data: { invite_code: string } }>(
    `/api/v1/groups/${groupId}/invite`,
    "POST",
    email ? { email } : {},
  );
  return { inviteCode: res.data.invite_code };
}

export async function joinGroup(code: string): Promise<{ groupId: string }> {
  if (!isSupabaseMode) {
    activateClientGroup("joined", `مجموعة ${code}`);
    return { groupId: "grp-001" };
  }
  const res = await apiMutate<{ data: { groupId: string } }>(
    "/api/v1/groups/join",
    "POST",
    { code },
  );
  return { groupId: res.data.groupId };
}

export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  if (!isSupabaseMode) return;
  await apiMutate(`/api/v1/groups/${groupId}/members`, "DELETE", { user_id: userId });
}

/**
 * Leave the caller's group.
 *
 * In supabase mode this did NOTHING and resolved — the comment said "the user
 * would remove themselves", in the conditional. A `Promise<void>` that resolves
 * is indistinguishable from a completed action, so any screen wired to it would
 * report «تمت المغادرة» over a membership that is still live. There is no
 * endpoint to call (DELETE /api/v1/groups/[id]/members exists but removes
 * *another* member and is owner-gated), so the honest outcome is the second
 * one: stop promising it. It rejects with the Arabic the caller can show.
 *
 * There is no call site today outside the barrel export — this rejects so it
 * cannot quietly acquire one.
 */
export async function leaveGroup(): Promise<void> {
  if (!isSupabaseMode) {
    saveClientGroupState({ status: "none" });
    return;
  }
  throw new Error("مغادرة المجموعة غير متاحة حالياً");
}

/**
 * monitorAdminServer.ts — the two lookups the «نشاط المكتبة» admin routes
 * share: names / e-mails for a set of user ids, and one user id by e-mail.
 * Service client, after the route's staff check. Never throws.
 */
import { createServiceClient } from "@/lib/supabase/server";
import type { PersonRef } from "@/lib/library/monitorAdmin";

const LOG = "[admin/library-monitor]";

export async function peopleFor(ids: string[]): Promise<Map<string, PersonRef & { userType: string | null }>> {
  const out = new Map<string, PersonRef & { userType: string | null }>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return out;
  try {
    const service = await createServiceClient();
    const { data, error } = await service.from("profiles").select("id, display_name, email, user_type").in("id", unique);
    if (error) {
      console.error(`${LOG} profile lookup failed:`, error.code);
      return out;
    }
    for (const p of (data ?? []) as Array<{ id: string; display_name: string | null; email: string | null; user_type: string | null }>) {
      out.set(p.id, { name: p.display_name ?? null, email: p.email ?? null, userType: p.user_type ?? null });
    }
  } catch (err) {
    console.error(`${LOG} profile lookup threw:`, err instanceof Error ? err.name : "error");
  }
  return out;
}

export type UserLookup = { ok: true; userId: string } | { ok: false; status: number; error: string };

/** One account by e-mail (case-insensitive, exact). */
export async function userIdByEmail(email: string): Promise<UserLookup> {
  try {
    const service = await createServiceClient();
    const { data, error } = await service
      .from("profiles")
      .select("id")
      .ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`))
      .limit(2);
    if (error) {
      console.error(`${LOG} user lookup failed:`, error.code);
      return { ok: false, status: 500, error: "تعذّر البحث عن المستخدم." };
    }
    if (!data || data.length === 0) return { ok: false, status: 404, error: "لا يوجد مستخدم بهذا البريد." };
    if (data.length > 1) return { ok: false, status: 409, error: "أكثر من حساب بهذا البريد؛ استخدم المعرّف." };
    return { ok: true, userId: (data[0] as { id: string }).id };
  } catch (err) {
    console.error(`${LOG} user lookup threw:`, err instanceof Error ? err.name : "error");
    return { ok: false, status: 500, error: "تعذّر البحث عن المستخدم." };
  }
}

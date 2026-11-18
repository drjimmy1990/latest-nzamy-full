/**
 * Reads the signup verification rows for the admin verification queue
 * (GET /api/v1/admin/verifications). Server-only, service client.
 *
 * Never throws and never fails the queue: before 20261124_70 runs, or on any
 * error, it returns an empty map and the queue simply has no signup line.
 * The licence photo is signed from the PRIVATE bucket lawyer-licences for 5
 * minutes, and only a key inside that lawyer's own `<user_id>/` folder.
 */

import type { createServiceClient } from "@/lib/supabase/server";
import { shapeSignupView, type SignupVerificationView } from "./adminView.ts";

type Svc = Awaited<ReturnType<typeof createServiceClient>>;

export const SIGNUP_IMAGE_TTL_SEC = 300;

export async function readSignupViews(svc: Svc, userIds: string[]): Promise<Map<string, SignupVerificationView>> {
  const out = new Map<string, SignupVerificationView>();
  if (userIds.length === 0) return out;
  try {
    const { data: rows, error } = await svc.from("lawyer_signup_verifications").select("*").in("user_id", userIds);
    if (error || !rows || rows.length === 0) {
      if (error) console.error("[admin/verifications GET] signup verification unavailable:", error.code);
      return out;
    }
    const ids = rows.map((r) => (r as { user_id: string }).user_id);
    const [{ data: images }, { data: challenges }] = await Promise.all([
      svc
        .from("lawyer_licence_images")
        .select("user_id, storage_path, purpose, ai_status, ai_result, created_at")
        .in("user_id", ids)
        .order("created_at", { ascending: false }),
      svc
        .from("lawyer_otp_challenges")
        .select("user_id, created_at, delivery")
        .in("user_id", ids)
        .eq("purpose", "email")
        .order("created_at", { ascending: false }),
    ]);
    const latestImage = new Map<string, Record<string, unknown>>();
    for (const img of (images ?? []) as Record<string, unknown>[]) {
      const id = img.user_id as string;
      if (!latestImage.has(id)) latestImage.set(id, img);
    }
    const latestChallenge = new Map<string, Record<string, unknown>>();
    for (const c of (challenges ?? []) as Record<string, unknown>[]) {
      const id = c.user_id as string;
      if (!latestChallenge.has(id)) latestChallenge.set(id, c);
    }
    await Promise.all(
      (rows as Record<string, unknown>[]).map(async (row) => {
        const id = row.user_id as string;
        const img = latestImage.get(id) ?? null;
        const url = img ? await signOwnImage(svc, img.storage_path, id) : null;
        out.set(id, shapeSignupView(row, img, url, latestChallenge.get(id) ?? null));
      }),
    );
  } catch (err) {
    console.error("[admin/verifications GET] signup verification threw:", err instanceof Error ? err.message : err);
  }
  return out;
}

async function signOwnImage(svc: Svc, path: unknown, userId: string): Promise<string | null> {
  if (typeof path !== "string" || !path.startsWith(`${userId}/`) || path.includes("..")) return null;
  try {
    const { data, error } = await svc.storage.from("lawyer-licences").createSignedUrl(path, SIGNUP_IMAGE_TTL_SEC);
    return error || !data?.signedUrl ? null : data.signedUrl;
  } catch {
    return null;
  }
}

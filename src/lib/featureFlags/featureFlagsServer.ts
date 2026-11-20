/**
 * featureFlagsServer.ts — reads platform_settings.feature_flags on the server
 * (O22, batch l11-misc). See ./featureFlags.ts for the list and the rules.
 *
 * Service-role read (the row is readable by anyone anyway, but the server
 * reader must not depend on a visitor's session). One read per minute per
 * process; PATCH /api/v1/admin/settings clears the cache on every
 * feature_flags write, so the admin's own process sees the change at once and
 * any other process within a minute.
 */
import { createServiceClient } from "@/lib/supabase/server";
import {
  FEATURE_FLAGS_SETTING,
  createFeatureFlagCache,
  type FeatureFlagKey,
  type FeatureFlagValues,
} from "./featureFlags";

async function loadFeatureFlagsRow(): Promise<unknown> {
  const db = await createServiceClient();
  const { data, error } = await db.from("platform_settings").select("value").eq("key", FEATURE_FLAGS_SETTING).maybeSingle();
  if (error) throw new Error(`feature_flags read failed: ${error.code ?? error.message}`);
  return (data as { value?: unknown } | null)?.value ?? null;
}

const cache = createFeatureFlagCache(loadFeatureFlagsRow);

/** Every flag's current state (defaults on a missing row or a failed read). */
export function getFeatureFlags(): Promise<FeatureFlagValues> {
  return cache.get();
}

/** One flag's current state. */
export async function isFeatureOn(key: FeatureFlagKey): Promise<boolean> {
  return (await cache.get())[key];
}

/** Called after an admin writes feature_flags. */
export function clearFeatureFlagsCache(): void {
  cache.clear();
}

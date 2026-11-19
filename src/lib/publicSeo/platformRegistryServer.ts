/**
 * platformRegistryServer.ts — reads the licence / commercial-registration
 * settings (./platformRegistry.ts) for the public server pages: /faq, the
 * home page's badge and Organization JSON-LD, /llms.txt and the footer's
 * /api/v1/public/platform-licence.
 *
 * A plain fetch to PostgREST as the service role (as
 * src/lib/library/publicGuardServer.ts). It is cached by Next for 5 minutes
 * (`next.revalidate`), NOT `no-store`: no-store would turn the home page and
 * /faq into per-request renders. An admin's new value therefore shows within
 * about five minutes.
 *
 * FAILS TO EMPTY: no env, a timeout, a missing row or any error answers
 * EMPTY_REGISTRY, which hides the licence line — nothing unproven is printed.
 * Server-only (reads the service-role key).
 */
import { EMPTY_REGISTRY, PLATFORM_REGISTRY_KEYS, registryFromRows, type PlatformRegistry } from "./platformRegistry";

export const PLATFORM_REGISTRY_REVALIDATE_SECONDS = 300;
const TIMEOUT_MS = 1_500;

export async function loadPlatformRegistry(): Promise<PlatformRegistry> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return EMPTY_REGISTRY;
  try {
    const res = await fetch(
      `${url.replace(/\/+$/, "")}/rest/v1/platform_settings?select=key,value&key=in.(${PLATFORM_REGISTRY_KEYS.join(",")})`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        next: { revalidate: PLATFORM_REGISTRY_REVALIDATE_SECONDS, tags: ["platform-registry"] },
      },
    );
    if (!res.ok) return EMPTY_REGISTRY;
    return registryFromRows(await res.json());
  } catch {
    return EMPTY_REGISTRY;
  }
}

/**
 * marketSettingsServer.ts — server reads/writes of the open-market settings
 * (l12 Q130a/Q151) and the commission rates (platform_settings rows of
 * 20261202_70), plus the staff who are alerted about lawyers' asks.
 *
 * Every read falls back honestly: no row → the market reads CLOSED (the
 * database still lists staff-published rows only) and the commission rates
 * are the defaults of src/lib/pricing/commission.ts. Nothing here throws.
 */
import "server-only";
import type { createServiceClient } from "@/lib/supabase/server";
import { recordNotification } from "@/lib/notify";
import { readStaffRolesOf } from "@/lib/auth/platformStaffServer";
import {
  COMMISSION_SETTING_KEY,
  MARKET_SETTING_KEY,
  parseMarketSettings,
  type MarketSettings,
} from "@/lib/marketplace/marketSettings";
import { COMMISSION_PCT, parseCommissionRates, type CommissionRates } from "@/lib/pricing/commission";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

export interface MarketSettingsRead {
  settings: MarketSettings;
  rates: CommissionRates;
  /** False until 20261202_70 has run (the market row is missing). */
  installed: boolean;
}

export async function readMarketSettings(admin: ServiceClient): Promise<MarketSettingsRead> {
  try {
    const { data, error } = await admin
      .from("platform_settings")
      .select("key, value")
      .in("key", [MARKET_SETTING_KEY, COMMISSION_SETTING_KEY]);
    if (error) {
      console.error("[market settings] read failed:", error.code);
      return { settings: parseMarketSettings(null, false), rates: { ...COMMISSION_PCT }, installed: false };
    }
    const rows = (data ?? []) as Array<{ key?: string; value?: unknown }>;
    const market = rows.find((r) => r.key === MARKET_SETTING_KEY);
    const commission = rows.find((r) => r.key === COMMISSION_SETTING_KEY);
    return {
      settings: parseMarketSettings(market?.value, Boolean(market)),
      rates: parseCommissionRates(commission?.value),
      installed: Boolean(market),
    };
  } catch (err) {
    console.error("[market settings] read threw:", err instanceof Error ? err.message : err);
    return { settings: parseMarketSettings(null, false), rates: { ...COMMISSION_PCT }, installed: false };
  }
}

/**
 * The staff who handle the market's asks: admins whose staff role may manage
 * orders (super_admin, operations). Before platform_staff exists every admin
 * is alerted; an auditor never is. At most 50.
 */
export async function marketStaffRecipients(admin: ServiceClient): Promise<string[]> {
  try {
    const { data, error } = await admin.from("profiles").select("id").eq("user_type", "admin").limit(50);
    if (error || !data) return [];
    const ids = (data as Array<{ id?: unknown }>).map((r) => r.id).filter((id): id is string => typeof id === "string");
    const roles = await readStaffRolesOf(admin, ids);
    if (roles.status !== "ok") return roles.status === "table_missing" ? ids : [];
    return ids.filter((id) => {
      const role = roles.roles.get(id);
      return role === "super_admin" || role === "operations";
    });
  } catch {
    return [];
  }
}

/** In-app notice to every market staff member (best effort). */
export async function notifyMarketStaff(admin: ServiceClient, title: string, body: string): Promise<number> {
  const ids = await marketStaffRecipients(admin);
  await Promise.all(ids.map((userId) => recordNotification({ userId, title, body, href: "/dashboard/admin/marketplace/orders" })));
  return ids.length;
}

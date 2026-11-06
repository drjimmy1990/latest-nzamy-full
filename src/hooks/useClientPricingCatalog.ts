"use client";

import { useEffect, useState } from "react";
import {
  CLIENT_SERVICE_CATALOG,
  type ClientServiceCatalogItem,
} from "@/constants/clientServiceCatalog";
import {
  fetchClientPricingCatalog,
  type PricingCatalogSource,
} from "@/lib/pricingRepository";
import { clientPricingAudience } from "@/lib/pricing/clientPricingAudience";
import { useUser } from "@/hooks/useUser";

/**
 * The client-service catalogue (code catalogue merged with
 * admin_pricing_catalog by GET /api/client-pricing) and the viewer's pricing
 * audience (S6, q327): "corporate" for a company account or a company member,
 * else "individual". Pass both to resolveClientService for a price; the
 * server re-prices the stored estimate on its own (S6-T5), so this is display.
 *
 * `audienceLoading` (fix round 1, M4): true while the session is still
 * resolving — the audience then reads "individual" for everyone, so a screen
 * that shows an audience price shows PRICE_PENDING_AR instead, rather than
 * flashing the individuals' 600 to a company before its 800.
 */
export const PRICE_PENDING_AR = "…";

export function useClientPricingCatalog() {
  const user = useUser();
  const audience = clientPricingAudience({
    userType: user.userType,
    hasBusinessScope: Boolean(user.businessMembership),
  });
  const [catalog, setCatalog] = useState<ClientServiceCatalogItem[]>(CLIENT_SERVICE_CATALOG);
  const [source, setSource] = useState<PricingCatalogSource>("admin-seed");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchClientPricingCatalog()
      .then((payload) => {
        if (cancelled) return;
        setCatalog(payload.catalog);
        setSource(payload.source);
      })
      .catch(() => {
        if (cancelled) return;
        setCatalog(CLIENT_SERVICE_CATALOG);
        setSource("admin-seed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { catalog, source, loading, audience, audienceLoading: user.loading };
}

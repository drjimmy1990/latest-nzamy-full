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

export function useClientPricingCatalog() {
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

  return { catalog, source, loading };
}

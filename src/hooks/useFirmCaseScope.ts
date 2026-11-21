"use client";

import { useEffect, useState } from "react";
import { DEFAULT_FIRM_CASE_SCOPE, parseFirmCaseScope, type FirmCaseScope } from "@/lib/firm/firmCaseScope";

/**
 * Q112: the platform's firm_case_scope setting for the firm roles screens.
 * Until it is read (or when the read fails) the owner's default is shown —
 * the same value the database applies when the setting is missing.
 */
export function useFirmCaseScope(): FirmCaseScope {
  const [scope, setScope] = useState<FirmCaseScope>(DEFAULT_FIRM_CASE_SCOPE);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/firm/case-scope", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { data?: unknown } | null) => {
        if (!cancelled && body?.data) {
          const d = body.data as { assignedOnlyRoles?: unknown; financeManagerNoCases?: unknown };
          setScope(parseFirmCaseScope({ assigned_only_roles: d.assignedOnlyRoles, finance_manager_no_cases: d.financeManagerNoCases }));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return scope;
}

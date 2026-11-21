"use client";

import { usePathname } from "next/navigation";
import { useUser } from "@/hooks/useUser";
import { useAdminSimulation } from "@/hooks/useAdminSimulation";
import { useAdminView } from "@/hooks/useAdminView";
import { adminBypassesUiGates, adminSimulatesConsultant } from "@/lib/nav/adminSimulation";
import { resolveAdminView } from "@/lib/nav/shellContext";
import { adminToolsShown } from "@/lib/ai/adminAiTools";

/**
 * useAdminToolsView — N2 (batch l12), UI only (R27): two booleans for the /ai
 * screens.
 *   showAll — the admin display applies: every tool's screen open, the drafter
 *     then محترف العقود first, no «قريباً» / price badge (adminAiTools.ts).
 *     False while the admin previews a role's limits («محاكاة القيود») or works
 *     in another account type's dashboard: he then sees what that account sees.
 *   simulatesConsultant — the admin previews «مستشار (م ١٨)» with limits on in
 *     the lawyer workspace: the consultant's locks apply to him, as in
 *     ConsultantGate.
 * Nothing here reaches a request, a guard or the server; the run path keeps
 * its own rule (a tool in mode «off» refuses the admin before any charge).
 */
export function useAdminToolsView(): { showAll: boolean; simulatesConsultant: boolean } {
  const { userType, loading } = useUser();
  const pathname = usePathname() ?? "/";
  const isRealAdmin = !loading && userType === "admin";
  const adminSim = useAdminSimulation(isRealAdmin);
  const { storedView } = useAdminView(pathname, isRealAdmin);
  const drawnView = isRealAdmin ? resolveAdminView(pathname, storedView) : null;
  const bypass = isRealAdmin && adminBypassesUiGates(userType, adminSim);
  const simulatesConsultant = isRealAdmin && drawnView !== null && adminSimulatesConsultant(userType, adminSim, drawnView);
  return { showAll: adminToolsShown(isRealAdmin, bypass, drawnView), simulatesConsultant };
}

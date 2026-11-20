/**
 * aiVaultRedirect.ts — where /ai/vault sends a signed-in user (N03-43/44,
 * batch l11-misc).
 *
 * /ai/vault was a «قريباً» page while «الخزنة القانونية» already works in the
 * dashboards (owner note 09 §٤): /dashboard/lawyer/vault for the licensed
 * lawyer and /dashboard/firm/vault for the firm. File 12: «do what is most
 * correct, without waiting» — so the old address forwards by role:
 *
 *   - a firm account (the owner), or a firm member whose role the firm vault's
 *     route rule admits (managing partner / office manager) → the firm vault;
 *   - any other lawyer → his own vault;
 *   - everyone else (company, individual, admin, a firm member the firm vault
 *     would refuse) → null: the page keeps «قريباً», because there is no
 *     working vault for them yet (the company vault is listed but not built).
 *
 * The firm rule is read from FIRM_ROUTE_RULES (getFirmRouteDecision), so the
 * redirect never sends anyone to a page that would bounce him.
 *
 * Pure (relative imports only), so node --test loads it.
 */
import { getFirmRouteDecision } from "../../constants/entityRouteAccess.ts";

export const LAWYER_VAULT_PATH = "/dashboard/lawyer/vault";
export const FIRM_VAULT_PATH = "/dashboard/firm/vault";

export interface AiVaultViewer {
  /** profiles.user_type, or null when unread. */
  userType: string | null;
  /** The caller's firm role (resolveCallerFirm: "managing_partner" for the owner), or null. */
  firmRole: string | null;
}

/** True when the firm vault's route rule admits this firm role. */
export function firmVaultAdmits(firmRole: string | null): boolean {
  if (!firmRole) return false;
  // getFirmRouteDecision is typed on AffiliationRole; any other string is refused by the rule.
  return getFirmRouteDecision(FIRM_VAULT_PATH, firmRole as Parameters<typeof getFirmRouteDecision>[1]).allowed;
}

/** The working vault for this viewer, or null to keep the «قريباً» page. */
export function aiVaultDestination(viewer: AiVaultViewer): string | null {
  if (viewer.userType === "firm") return FIRM_VAULT_PATH;
  if (viewer.userType === "lawyer") return firmVaultAdmits(viewer.firmRole) ? FIRM_VAULT_PATH : LAWYER_VAULT_PATH;
  return null;
}

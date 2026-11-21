/**
 * Who sees what on /ai/simple-contract (owner ١٢٣): the tool for the accounts
 * the registry lets run it (and the admin, who passes every tool); a lawyer or
 * a law firm is pointed to «محترف العقود»; any other account type to ordering
 * a contract from a lawyer on the platform. The run path refuses the same
 * accounts on its own (tools.ts roles), whatever this screen shows.
 *
 * Pure, so `node --test` runs it.
 */
import { SIMPLE_CONTRACT_ROLES } from "../../../lib/ai/simpleContract.ts";

export type SimpleContractAudience = "tool" | "lawyer" | "other";

export function simpleContractAudience(userType: string | null | undefined): SimpleContractAudience {
  const t = userType ?? "";
  if (t === "admin" || (SIMPLE_CONTRACT_ROLES as readonly string[]).includes(t)) return "tool";
  if (t === "lawyer" || t === "firm") return "lawyer";
  return "other";
}

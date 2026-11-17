/**
 * The AI tools the founder membership pays for (founderPlan.ts): the drafter
 * (drafting works) and the four independent-output tools. A founder member
 * passes the library AI gate for these tools only (0.5, owner package 17 Nov);
 * every other library tool keeps the Pro rule until the owner decides
 * (question 5 of the 17-Nov list).
 *
 * Pure: relative imports only, so `node --test` loads it.
 */
import { FOUNDER_DRAFTER_TOOL, FOUNDER_OUTPUT_TOOLS } from "../../../lib/membership/founderPlan.ts";

export function isFounderPlanTool(toolId: unknown): boolean {
  return typeof toolId === "string"
    && (toolId === FOUNDER_DRAFTER_TOOL || (FOUNDER_OUTPUT_TOOLS as readonly string[]).includes(toolId));
}

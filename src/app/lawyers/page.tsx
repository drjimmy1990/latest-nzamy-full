import { redirect } from "next/navigation";
import { BETA_MONOPOLY_MODE } from "@/lib/betaConfig";

// The directory index. Closed during the single-firm beta (owner, Q151): it
// goes to the firm's intake, as /lawyers/browse does (browse/layout.tsx).
// Single lawyers' published profiles, /lawyers/[slug], stay reachable by link.
export default function LawyersIndex() {
  redirect(BETA_MONOPOLY_MODE ? "/services/lawyers" : "/lawyers/browse");
}

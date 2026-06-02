import { redirect } from "next/navigation";

/**
 * /ai/tracker → redirect to the new CorpMind page
 * This page is kept for backward compatibility with any old links.
 */
export default function TrackerRedirectPage() {
  redirect("/ai/corp/corpmind");
}

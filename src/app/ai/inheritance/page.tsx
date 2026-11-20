import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { viewerIsAdmin } from "@/lib/ai/runVisibility";
import { inheritanceCalcEnabled } from "@/lib/inheritance/inheritanceSwitch";
import InheritanceCalculator from "./InheritanceCalculator";

/**
 * /ai/inheritance — T18-P1-39 (batch l11): حاسبة المواريث. Behind
 * NZAMY_INHERITANCE_CALC (off by default): off, the page exists for an admin
 * only (a preview for the owner's review) and is a 404 for everyone else.
 * The calculation runs in the browser (src/lib/inheritance/faraid.ts): no
 * points, nothing stored, nothing sent.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "حاسبة المواريث", robots: { index: false, follow: false } };

export default async function InheritancePage() {
  const live = inheritanceCalcEnabled();
  if (!live) {
    let admin = false;
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      admin = !!data.user && (await viewerIsAdmin(supabase, data.user.id));
    } catch {
      admin = false;
    }
    if (!admin) notFound();
  }
  return <InheritanceCalculator preview={!live} />;
}

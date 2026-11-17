import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/server";
import { hasFullLibraryAccess } from "@/lib/access-control";
import MyLibraryClient from "./MyLibraryClient";

/**
 * /laws/my — «مكتبتي» (owner TODO P1-11 / N02-9 / N05-L3; it was a 404).
 * The signed-in reader's own library: folders, notes, reading history, his
 * library subscription and points, and the devices the library is open on.
 *
 * Guarded HERE, not in src/proxy.ts: a signed-out visitor is sent to
 * /login?from=/laws/my. Per viewer and never cached. The static `my` segment
 * wins over /laws/[slug], so no law reader route is touched.
 *
 * The full-library flag is read once on the server (the same rule as
 * GET /api/v1/library/access); a failed read is passed as null so the page
 * says nothing about the plan rather than «no subscription».
 */

export const dynamic = "force-dynamic";
export const metadata = {
  title: "مكتبتي | نظامي",
  robots: { index: false, follow: false },
};

export default async function MyLibraryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?from=%2Flaws%2Fmy");

  let fullAccess: boolean | null = null;
  try {
    fullAccess = await hasFullLibraryAccess(user.id);
  } catch (err) {
    console.error("[laws/my] full-access read failed:", err instanceof Error ? err.message : err);
  }

  return (
    <>
      <Navbar />
      <MyLibraryClient fullAccess={fullAccess} />
      <Footer />
    </>
  );
}

import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { OffersList } from "@/components/offers/OffersList";
import { createClient } from "@/lib/supabase/server";

/**
 * «العروض» (owner item 5): every offer meant for the signed-in user now, as
 * cards — the popup's offer stays here after it is closed. Shared by every
 * account type, like /dashboard/billing; the sidebar item carries the count.
 */
export const dynamic = "force-dynamic";
export const metadata = { title: "العروض | نظامي", robots: { index: false, follow: false } };

export default async function OffersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fdashboard%2Foffers");
  return (
    <>
      <Navbar />
      <main dir="rtl" className="min-h-[75dvh] bg-zinc-50 px-4 pb-20 pt-32 text-zinc-900 dark:bg-[#0A0A0A] dark:text-zinc-100">
        <div className="mx-auto max-w-5xl space-y-6">
          <div>
            <p className="mb-2 text-sm text-zinc-500">حسابك في نظامي</p>
            <h1 className="text-3xl font-extrabold">العروض</h1>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">العروض المتاحة لحسابك الآن. ينتهي كل عرض تلقائيًا بانتهاء مدته أو اكتمال مقاعده أو شرائك له.</p>
          </div>
          <OffersList />
        </div>
      </main>
      <Footer />
    </>
  );
}

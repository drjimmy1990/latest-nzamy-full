import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ACCOUNT_FROZEN_PATH, freezeStateFromUser } from "@/lib/auth/accountFreeze";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MoyasarCheckout from "@/components/payments/MoyasarCheckout";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPaymentGatewayStatus } from "@/lib/access-control";
import { viewerGatewayState } from "@/lib/payments/testModeAccess";
import { MOYASAR_DISABLED_MESSAGE_AR } from "@/lib/payments/moyasarConfig";
import { AUDIENCE_REFUSED_AR, NOT_FOR_SALE_AR, UNKNOWN_ITEM_AR } from "@/lib/payments/checkoutCore";
import { buyerAllowed, formatHalalas, sellableItem } from "@/lib/payments/catalog";
import { couponsAvailable } from "@/lib/payments/couponServer";
import {
  billingLabelAr,
  checkoutItemNotes,
  couponFieldShown,
  gatewayAllowsCheckout,
  listedVatNotice,
  parseCheckoutQuery,
} from "@/lib/payments/checkoutView";

/**
 * /checkout?item=<id>&billing=<b> — pay for one item on sale (the price book) online
 * (Moyasar payments B1, Task 7). Arabic only. A server component, per request:
 *   - an unknown item, or a billing it does not offer → «هذا المنتج غير متاح
 *     للدفع الإلكتروني» and a link to /pricing;
 *   - signed out → /login?next=<this page>;
 *   - the gateway off (or not Moyasar), or in test mode for anyone but staff
 *     and test accounts → «الدفع الإلكتروني غير متاح حالياً»;
 *   - an account type the item is not sold to → «هذه الباقة غير متاحة لنوع
 *     حسابك» and a link to /pricing (the checkout POST refuses it too);
 *   - otherwise the item, its listed price and the VAT sentence, the notes
 *     the catalog backs (top-up points and validity, library access length,
 *     the ind-litigation coverage — firm plans promise no seats), and
 *     MoyasarCheckout, which starts the payment and shows the server's quote;
 *   - the coupon field (P7) only once 20261026_20 has run (couponsAvailable,
 *     a service-role probe) and never for a point top-up.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "إتمام الدفع | نظامي",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PRIMARY =
  "inline-flex items-center justify-center rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#0E4D3A]";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main dir="rtl" lang="ar" className="min-h-[70dvh] bg-zinc-50 px-4 pb-20 pt-32 dark:bg-[#0A0A0A]">
        <div className="mx-auto max-w-xl">{children}</div>
      </main>
      <Footer />
    </>
  );
}

function Notice({ title }: { title: string }) {
  return (
    <Shell>
      <section className="rounded-2xl border border-zinc-300 bg-white p-6 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 sm:p-8">
        <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/pricing" className={PRIMARY}>
            العودة إلى الباقات
          </Link>
        </div>
      </section>
    </Shell>
  );
}

export default async function CheckoutPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const parsed = parseCheckoutQuery(sp.item, sp.billing);
  if (!parsed.ok) return <Notice title={parsed.notForSale ? NOT_FOR_SALE_AR : UNKNOWN_ITEM_AR} />;

  const item = sellableItem(parsed.itemId)!; // parseCheckoutQuery accepted only an item on sale
  const selfHref = `/checkout?item=${encodeURIComponent(parsed.itemId)}&billing=${parsed.billing}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(selfHref)}`);
  // D6 (owner ٢٩٨): a frozen account (a pending deletion) buys nothing; it
  // opens only /account-frozen. /checkout is not a PROTECTED proxy prefix.
  if (freezeStateFromUser(user).frozen) redirect(ACCOUNT_FROZEN_PATH);

  // Test mode is for platform staff and test accounts only (B1 final review):
  // anyone else sees the gateway as off, exactly as GET /api/v1/payments/status.
  let gatewayOn = false;
  try {
    gatewayOn = gatewayAllowsCheckout(
      await viewerGatewayState(await getPaymentGatewayStatus(), {
        userId: async () => user.id,
        admin: () => createServiceClient(),
      }),
    );
  } catch {
    console.error("[checkout] reading the gateway status threw");
  }
  if (!gatewayOn) return <Notice title={MOYASAR_DISABLED_MESSAGE_AR} />;

  // The buyer's own row (RLS lets a user read it). A failed read decides
  // nothing here: the checkout POST reads it again and refuses or prices.
  let userType: string | null = null;
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("user_type")
    .eq("id", user.id)
    .maybeSingle();
  if (profileErr) console.warn("[checkout] reading the buyer's account type failed:", profileErr.code);
  const rawType = (profile as { user_type?: unknown } | null)?.user_type;
  if (typeof rawType === "string") userType = rawType;
  if (profile && !buyerAllowed(item, userType)) return <Notice title={AUDIENCE_REFUSED_AR} />;

  const listed = item.prices[parsed.billing];
  const notes = checkoutItemNotes(item);

  let couponsReady = false;
  if (item.kind !== "topup") {
    try {
      couponsReady = await couponsAvailable(await createServiceClient());
    } catch {
      couponsReady = false;
    }
  }

  return (
    <Shell>
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 sm:p-8">
        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">إتمام الدفع</p>
        <h1 className="mt-1 text-xl font-bold sm:text-2xl">{item.labelAr}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{billingLabelAr(parsed.billing)}</p>

        {listed !== undefined ? (
          <p className="mt-5 text-2xl font-extrabold text-[#0B3D2E] dark:text-[#C8A762]">{formatHalalas(listed)}</p>
        ) : null}
        <p className="mt-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">{listedVatNotice(item)}</p>

        {notes.length > 0 ? (
          <ul className="mt-5 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
            {notes.map((note) => (
              <li key={note} className="flex items-start gap-2">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C8A762]" />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-7">
          <MoyasarCheckout
            itemId={parsed.itemId}
            billing={parsed.billing}
            couponsEnabled={couponFieldShown(item, couponsReady)}
          />
        </div>

        {/* Controller ruling (Task 7 fix round 1): one line, no checkbox. */}
        <p className="mt-5 text-xs leading-6 text-zinc-600 dark:text-zinc-400">
          بإتمام الدفع فإنك توافق على{" "}
          <Link href="/terms" className="font-semibold underline underline-offset-2">
            الشروط والأحكام
          </Link>{" "}
          و
          <Link href="/refund-policy" className="font-semibold underline underline-offset-2">
            سياسة الاسترداد
          </Link>
        </p>
      </section>
    </Shell>
  );
}

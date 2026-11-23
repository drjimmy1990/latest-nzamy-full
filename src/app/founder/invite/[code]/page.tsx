import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPaymentGatewayStatus } from "@/lib/access-control";
import {
  INVITES_GATEWAY_OFF_AR,
  REDEEM_REFUSAL_AR,
  formatInviteCode,
  inviteGiftAr,
  inviteLinkPath,
  normalizeInviteCode,
  parseFounderInvites,
} from "@/lib/founder/founderInvites";
import { invitesGatewayOn, readFounderInvitesSettings } from "@/lib/founder/founderInvitesServer";
import RedeemInvite from "./RedeemInvite";

/**
 * /founder/invite/[code] — the page a founder's invite link opens (owner Q144
 * أ, batch l13). It tells a new lawyer what the invite gives (from the live
 * founder_invites setting) and redeems it with one button (POST
 * /api/v1/membership/founder/invites/redeem); every eligibility rule is the
 * database's (founder_invite_redeem) and its answer is shown as it comes.
 *
 * The page never looks the code up (no oracle for guessing codes): a
 * malformed code is said so at once, a well-formed one is judged on redeem.
 * «لا تعمل الدعوات إلا بعد تفعيل الدفع»: while online payment is off for the
 * viewer (live for everyone, test for staff / test accounts only), the page
 * says so and offers no button. noindex; per viewer, never cached.
 */

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  titleAr: "دعوة عضو مؤسس",
  titleEn: "Founder invitation",
  descriptionAr: "دعوة من عضو مؤسس في منصة نظامي لمحامٍ مرخّص جديد.",
  path: "/founder",
  noIndex: true,
});

const linkClass = "font-bold text-[#0B3D2E] underline dark:text-[#E6CD8E]";

async function viewerState(): Promise<{ signedIn: boolean; gatewayOn: boolean; gift: string }> {
  let gift = inviteGiftAr(parseFounderInvites(null));
  try {
    const admin = await createServiceClient();
    gift = inviteGiftAr(await readFounderInvitesSettings(admin));
  } catch {
    // the defaults' line stays
  }
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return { signedIn: true, gatewayOn: await invitesGatewayOn(user.id), gift };
    // a guest: only a LIVE gateway is on for him (test mode is staff-only)
    const state = await getPaymentGatewayStatus();
    return { signedIn: false, gatewayOn: state.status === "live" && !state.disabled, gift };
  } catch {
    return { signedIn: false, gatewayOn: false, gift };
  }
}

export default async function FounderInvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = normalizeInviteCode(decodeURIComponent(raw ?? ""));
  const { signedIn, gatewayOn, gift } = await viewerState();
  const back = code ? inviteLinkPath(code) : "/founder";

  return (
    <div dir="rtl" className="min-h-[70vh] bg-[#F2F5F1] py-14 text-[#14261F] dark:bg-[#0c0f12] dark:text-zinc-200">
      <article className="mx-auto max-w-2xl px-4 sm:px-6">
        <p className="mb-4 text-sm">
          <Link href="/founder" className={linkClass}>
            باقة المحامي المؤسس
          </Link>
        </p>
        <h1 className="mb-4 font-brand text-3xl font-extrabold text-[#0B3D2E] dark:text-[#E6CD8E]">دعوة من عضو مؤسس</h1>
        <p className="mb-6 leading-loose">
          دعاك أحد الأعضاء المؤسسين في نظامي. الدعوة لمحامٍ مرخّص جديد لم يسبق له التسجيل في المنصة، وتمنحك:{" "}
          <b className="font-bold">{gift}</b>.
        </p>

        {!code ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 p-4 font-bold text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            {REDEEM_REFUSAL_AR.invalid}
          </p>
        ) : !gatewayOn ? (
          <p className="rounded-2xl border border-[#E8CF8A] bg-[#FFF3D6] p-4 font-bold leading-loose text-[#5C4200]" data-light-surface>
            {INVITES_GATEWAY_OFF_AR}
          </p>
        ) : (
          <div className="rounded-2xl border border-[#C8A762]/40 bg-white p-5 dark:border-[#C8A762]/25 dark:bg-zinc-900/60">
            <p className="mb-3 text-sm">
              رمز الدعوة: <span dir="ltr" className="font-mono font-bold">{formatInviteCode(code)}</span>
            </p>
            {signedIn ? (
              <RedeemInvite code={code} />
            ) : (
              <div className="space-y-2 leading-loose">
                <p>لتفعيل الدعوة سجّل حسابك محامياً، وبعد توثيق ترخيصك عد إلى هذا الرابط واضغط «فعّل الدعوة».</p>
                <p className="flex flex-wrap gap-4">
                  <Link href="/register/provider" className={linkClass}>
                    إنشاء حساب محامٍ
                  </Link>
                  <Link href={`/login?next=${encodeURIComponent(back)}`} className={linkClass}>
                    لدي حساب — تسجيل الدخول
                  </Link>
                </p>
              </div>
            )}
          </div>
        )}
      </article>
    </div>
  );
}

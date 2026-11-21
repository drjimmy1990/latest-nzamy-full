// «الخزنة القانونية» — honesty gate (owner decision, 28 Sep).
//
// WHAT THIS PAGE WAS: three tabs over module constants. INITIAL_ITEMS listed
// six "saved" documents (a commercial register "expiring in 45 days", a power
// of attorney, a letterhead …) that nobody had uploaded, and MOCK_LAWYER
// pre-filled a named lawyer's licence number, phone and e-mail into editable
// inputs whose «حفظ البيانات» button saved nothing. The copy already admitted
// «نموذج توضيحي» and «قريباً»; the page now says only that.
//
// WHAT THE VAULT WILL HOLD — the owner's split, recorded in the description
// below so the page states it rather than a mock of it:
//   · للمحامي والمكتب: الترويسة، الختم، التوقيع، قالب الوورد، رخصة المحاماة.
//   · للشركات: السجل التجاري، الرقم الضريبي، اللائحة الداخلية، التفويضات.
//
// The previous UI is one `git show` away when a vault store exists. The nav
// row (navigation.sidebars.legal.ts) carries the «قريباً» badge that
// src/lib/services/navComingSoon.test.ts requires of every link to a page
// rendering DashboardComingSoon. src/app/services/lawyers/vault/page.tsx is a
// separate marketing page and is unaffected.

//
// N03-43/44 (batch l11-misc): the vault works in the dashboards, so a lawyer
// or a firm is forwarded to his own working vault (src/lib/nav/aiVaultRedirect.ts);
// only the others still see «قريباً» here.

import { redirect } from "next/navigation";
import DashboardComingSoon from "@/components/ui/DashboardComingSoon";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerFirm } from "@/lib/auth/firmMembershipAccess";
import { aiVaultDestination, FIRM_VAULT_PATH, LAWYER_VAULT_PATH } from "@/lib/nav/aiVaultRedirect";
import Link from "next/link";

// Per viewer (the redirect depends on the session): never prerendered or cached.
export const dynamic = "force-dynamic";

/**
 * The working vault for the signed-in viewer, "admin" for a platform admin (N2,
 * batch l12: he is shown both vaults to choose from), or null. A failed read
 * keeps «قريباً».
 */
async function viewerVault(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase.from("profiles").select("user_type").eq("id", user.id).maybeSingle();
    const userType = typeof profile?.user_type === "string" ? profile.user_type : null;
    if (userType === "admin") return "admin";
    if (userType !== "lawyer" && userType !== "firm") return null;
    const firm = await resolveCallerFirm(supabase, user.id);
    return aiVaultDestination({ userType, firmRole: firm.data?.role ?? null });
  } catch {
    return null;
  }
}

export default async function AIVaultPage() {
  // redirect() throws by design, so it stays outside the try above.
  const destination = await viewerVault();
  if (destination === "admin") return <AdminVaultPicker />;
  if (destination) redirect(destination);
  return (
    <DashboardComingSoon
      title="الخزنة القانونية"
      description="الخزنة القانونية غير متاحة حالياً وستُفعَّل قريباً، وستضم المستندات الرسمية: للمحامي والمكتب: الترويسة والختم والتوقيع وقالب الوورد ورخصة المحاماة؛ وللشركات: السجل التجاري والرقم الضريبي واللائحة الداخلية والتفويضات. لا توجد مستندات محفوظة بعد."
      backHref="/ai"
    />
  );
}

/**
 * N2 / P0-2 (batch l12): the admin sees every tool open. The vault lives in the
 * lawyer's and the firm's dashboards, both of which admit an admin, so he picks
 * one instead of meeting «قريباً». The company vault is not built (still listed
 * as such on the page others see).
 */
function AdminVaultPicker() {
  const link = "block rounded-2xl border border-slate-200 bg-white p-5 text-start hover:border-[#0B3D2E]/30 dark:border-white/[0.08] dark:bg-white/[0.03]";
  return (
    <div dir="rtl" className="mx-auto max-w-2xl space-y-4 p-5 md:p-7">
      <h1 className="text-xl font-bold text-[#0B3D2E] dark:text-white">الخزنة القانونية</h1>
      <p className="text-[13px] text-slate-500 dark:text-zinc-400">اختر الخزنة التي تريد فتحها:</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link href={LAWYER_VAULT_PATH} className={link}>
          <p className="text-[14px] font-bold text-slate-800 dark:text-zinc-100">خزنة المحامي</p>
          <p className="mt-1 text-[12px] text-slate-500 dark:text-zinc-400">المستندات، والترويسة والختم والتوقيع</p>
        </Link>
        <Link href={FIRM_VAULT_PATH} className={link}>
          <p className="text-[14px] font-bold text-slate-800 dark:text-zinc-100">خزنة المكتب</p>
          <p className="mt-1 text-[12px] text-slate-500 dark:text-zinc-400">مستندات المكتب وهويته ومطبوعاته</p>
        </Link>
      </div>
    </div>
  );
}

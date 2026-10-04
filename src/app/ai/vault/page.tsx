"use client";

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

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function AIVaultPage() {
  return (
    <DashboardComingSoon
      title="الخزنة القانونية"
      description="الخزنة القانونية غير متاحة حالياً وستُفعَّل قريباً، وستضم المستندات الرسمية: للمحامي والمكتب: الترويسة والختم والتوقيع وقالب الوورد ورخصة المحاماة؛ وللشركات: السجل التجاري والرقم الضريبي واللائحة الداخلية والتفويضات. لا توجد مستندات محفوظة بعد."
      backHref="/ai"
    />
  );
}

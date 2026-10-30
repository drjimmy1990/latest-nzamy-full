"use client";

/**
 * LegalVaultWorkspace — «الخزنة القانونية» of a lawyer (/dashboard/lawyer/vault)
 * or a firm (/dashboard/firm/vault) — owner note 09 §٤, package 2026-10-30
 * (LIVE-F08, NOTE-09-C06). Two tabs, in the owner's order:
 *
 *   ?tab=documents  the office's documents. A lawyer's real store is
 *                   «المستندات» (/dashboard/lawyer/documents: upload, legal
 *                   hold, shares, recycle bin) — this tab leads there instead
 *                   of copying it. A firm has no shared document store yet
 *                   (/dashboard/firm/documents is «قريباً»): the tab says so.
 *   ?tab=branding   «هوية ومطبوعات المكتب»: the letterhead identity, the blank
 *                   letterhead print, and the office's uploaded stationery
 *                   (LetterheadWorkspace + BrandingAssetsPanel). The old
 *                   /dashboard/{lawyer,firm}/letterhead links land here.
 *
 * The tab is read on the server (page.tsx awaits searchParams) and passed in;
 * switching rewrites the query with router.replace so a reload keeps it.
 */
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Stamp, ArrowLeft, Info } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import LetterheadWorkspace from "./LetterheadWorkspace";
import BrandingAssetsPanel from "./BrandingAssetsPanel";
import type { BrandingScope } from "@/lib/branding/brandingVault";
import { parseVaultTab, vaultHref, type VaultTab } from "./legalVaultTabs";

export default function LegalVaultWorkspace({ scope, initialTab }: { scope: BrandingScope; initialTab?: string | null }) {
  const { isDark } = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState<VaultTab>(parseVaultTab(initialTab));

  const tp = isDark ? "text-white" : "text-slate-800";
  const ts = isDark ? "text-zinc-400" : "text-slate-500";
  const card = isDark ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60" : "rounded-2xl border border-slate-200 bg-white shadow-sm";

  const select = (next: VaultTab) => {
    setTab(next);
    router.replace(vaultHref(scope, next), { scroll: false });
  };

  const tabBtn = (id: VaultTab, label: string, Icon: typeof Stamp) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => select(id)}
      className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors ${
        tab === id
          ? "bg-[#0B3D2E] text-[#C8A762]"
          : isDark ? "text-zinc-400 hover:bg-white/[0.04] hover:text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      }`}
    >
      <Icon size={16} weight={tab === id ? "fill" : "regular"} /> {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-5 md:p-7" dir="rtl">
      <div>
        <h1 className={`text-xl font-bold ${tp}`}>الخزنة القانونية</h1>
        <p className={`mt-1 text-[13px] ${ts}`}>
          {scope === "firm" ? "مستندات المكتب وهويته ومطبوعاته الرسمية في مكان واحد." : "مستنداتك وهويتك ومطبوعاتك الرسمية في مكان واحد."}
        </p>
      </div>

      <div role="tablist" aria-label="أقسام الخزنة" className={`inline-flex flex-wrap gap-1 rounded-2xl p-1 ${isDark ? "bg-zinc-900/60" : "bg-slate-100"}`}>
        {tabBtn("documents", "المستندات", FolderOpen)}
        {tabBtn("branding", "هوية ومطبوعات المكتب", Stamp)}
      </div>

      {tab === "documents" ? (
        scope === "lawyer" ? (
          <section className={`${card} max-w-2xl space-y-3 p-6`}>
            <h2 className={`text-[15px] font-bold ${tp}`}>مستنداتك المحفوظة</h2>
            <p className={`text-[13px] leading-7 ${ts}`}>
              العقود والوكالات والصكوك ومستندات القضايا تُرفع وتُحفظ في «المستندات»: رفع متعدد، وحفظ قانوني يمنع الحذف، ومشاركة برابط، وسلة محذوفات.
            </p>
            <Link
              href="/dashboard/lawyer/documents"
              className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2 text-[13px] font-bold text-[#C8A762]"
            >
              فتح المستندات <ArrowLeft size={14} />
            </Link>
          </section>
        ) : (
          <section className={`${card} max-w-2xl space-y-2 p-6`}>
            <h2 className={`flex items-center gap-2 text-[15px] font-bold ${tp}`}><Info size={18} className="text-amber-500" /> مستندات المكتب المشتركة غير متاحة بعد</h2>
            <p className={`text-[13px] leading-7 ${ts}`}>
              لا يوجد بعدُ مخزن مستندات مشترك بين أعضاء المكتب، فلا تُعرض هنا مستندات. هوية المكتب ومطبوعاته الجاهزة متاحة الآن في تبويب «هوية ومطبوعات المكتب».
            </p>
            <button type="button" onClick={() => select("branding")} className="text-[13px] font-semibold text-[#C8A762] underline">
              الانتقال إلى هوية ومطبوعات المكتب
            </button>
          </section>
        )
      ) : (
        <LetterheadWorkspace scope={scope} embedded extra={<BrandingAssetsPanel scope={scope} />} />
      )}
    </div>
  );
}

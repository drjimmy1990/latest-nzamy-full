"use client";

/**
 * ActivityTabs — /dashboard/lawyer/activity in three tabs (N3.7, owner §٤٥
 * axis 1): «نشاطي الشخصي» (the existing personal feed), «نشاط المكتب وفريق
 * العمل» (firm members only) and «الصادر والوارد القانوني». `?tab=` makes each
 * tab linkable; an unknown value, or «office» for someone with no firm, falls
 * back to the personal feed.
 */

import { useEffect, useState, type ReactNode } from "react";
import { User, UsersThree, ArrowsDownUp } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { getOfficeActivity } from "@/lib/services/ledgerService";
import OfficeActivityTab from "@/components/dashboard/activity/OfficeActivityTab";
import LedgerTab from "@/components/dashboard/ledger/LedgerTab";

export type ActivityTabId = "personal" | "office" | "ledger";

const TABS: { id: ActivityTabId; label: string; icon: typeof User }[] = [
  { id: "personal", label: "نشاطي الشخصي", icon: User },
  { id: "office", label: "نشاط المكتب وفريق العمل", icon: UsersThree },
  { id: "ledger", label: "الصادر والوارد القانوني", icon: ArrowsDownUp },
];

export function parseActivityTab(raw: string | null | undefined): ActivityTabId {
  return raw === "office" || raw === "ledger" ? raw : "personal";
}

export default function ActivityTabs({ personal }: { personal: ReactNode }) {
  const { isDark } = useTheme();
  const [tab, setTab] = useState<ActivityTabId>("personal");
  // null = not known yet; the office tab appears only once the server says
  // the caller is an active firm member.
  const [isMember, setIsMember] = useState<boolean | null>(null);

  useEffect(() => {
    try { setTab(parseActivityTab(new URLSearchParams(window.location.search).get("tab"))); } catch {}
    getOfficeActivity().then((p) => setIsMember(p.member)).catch(() => setIsMember(false));
  }, []);

  const visible = TABS.filter((t) => t.id !== "office" || isMember === true);
  const active: ActivityTabId = tab === "office" && isMember !== true ? "personal" : tab;

  const choose = (id: ActivityTabId) => {
    setTab(id);
    try {
      const url = new URL(window.location.href);
      if (id === "personal") url.searchParams.delete("tab"); else url.searchParams.set("tab", id);
      window.history.replaceState(null, "", url.toString());
    } catch {}
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = visible.findIndex((t) => t.id === active);
    // RTL: ArrowLeft moves to the next tab.
    const step = e.key === "ArrowLeft" ? 1 : -1;
    const next = visible[(i + step + visible.length) % visible.length];
    choose(next.id);
    document.getElementById(`activity-tab-${next.id}`)?.focus();
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div
        role="tablist"
        aria-label="أقسام سجل النشاط"
        onKeyDown={onKeyDown}
        className={`flex gap-1 overflow-x-auto rounded-2xl border p-1 ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-100 bg-white"}`}
      >
        {visible.map((t) => {
          const Icon = t.icon;
          const selected = active === t.id;
          return (
            <button
              key={t.id}
              id={`activity-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`activity-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => choose(t.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-[12px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762] ${
                selected
                  ? "bg-[#0B3D2E] text-white dark:bg-[#C8A762] dark:text-[#0B3D2E]"
                  : isDark ? "text-zinc-400 hover:bg-white/[0.05]" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <Icon size={14} weight={selected ? "duotone" : "regular"} aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`activity-panel-${active}`} aria-labelledby={`activity-tab-${active}`}>
        {active === "personal" && personal}
        {active === "office" && <OfficeActivityTab isDark={isDark} />}
        {active === "ledger" && <LedgerTab isDark={isDark} />}
      </div>
    </div>
  );
}

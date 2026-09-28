"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  UserCircle,
  ShieldCheck,
  Bell,
  Lock,
  CreditCard,
  CrownSimple,
  Gift,
  Question,
  Buildings,
  UsersThree,
  IdentificationBadge,
  PenNib,
  Handshake,
  Receipt,
  ClockCounterClockwise,
  SignOut,
  Calendar,
  Scales,
  FileText,
  Warning,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
import { useSettingsTabs } from "./hooks/useSettingsTabs";
import type { TabIconKey } from "./hooks/useSettingsTabs";
import { logout } from "@/hooks/useUser";
import { useRouter } from "next/navigation";

// ── Tab content imports ──────────────────────────────────────────────
import { ProfileTab }       from "./components/tabs/ProfileTab";
import { SecurityTab }      from "./components/tabs/SecurityTab";
import { NotificationsTab } from "./components/tabs/NotificationsTab";
import { PrivacyTab }       from "./components/tabs/PrivacyTab";
import { PaymentsTab }      from "./components/tabs/PaymentsTab";
import { HelpTab }          from "./components/tabs/HelpTab";
import { SubscriptionTab }  from "./components/tabs/SubscriptionTab";
import { ReferralTab }      from "./components/tabs/ReferralTab";
import { EntitySettingsTab }  from "./components/tabs/EntitySettingsTab";
import { TeamManagementTab }  from "./components/tabs/TeamManagementTab";
import { DelegationTab }      from "./components/tabs/DelegationTab";
import { ProfessionTab }      from "./components/tabs/ProfessionTab";
import { SignatureTab }       from "./components/tabs/SignatureTab";
import { InvoiceTab }         from "./components/tabs/InvoiceTab";
import { ComplianceTab }      from "./components/tabs/ComplianceTab";
import { RoleScopeTab }       from "./components/tabs/RoleScopeTab";

// ── Icon map ─────────────────────────────────────────────────────────
const ICON_MAP: Record<TabIconKey, React.ElementType> = {
  "user-circle":           UserCircle,
  "buildings":             Buildings,
  "users-three":           UsersThree,
  "shield-check":          ShieldCheck,
  "bell":                  Bell,
  "lock":                  Lock,
  "credit-card":           CreditCard,
  "crown-simple":          CrownSimple,
  "gift":                  Gift,
  "question":              Question,
  "calendar":              Calendar,
  "handshake":             Handshake,
  "receipt":               Receipt,
  "identification-badge":  IdentificationBadge,
  "pen-nib":               PenNib,
  "clock-counter-clockwise": ClockCounterClockwise,
  "scales":                Scales,
  "file-text":             FileText,
};

// ── Tab content resolver ─────────────────────────────────────────────
function TabContent({ tabId }: { tabId: string }) {
  switch (tabId) {
    case "profile":       return <ProfileTab />;
    case "role-scope":    return <RoleScopeTab />;
    case "entity":        return <EntitySettingsTab />;
    case "team":          return <TeamManagementTab />;
    case "security":      return <SecurityTab />;
    case "notifications": return <NotificationsTab />;
    case "privacy":       return <PrivacyTab />;
    case "payments":      return <PaymentsTab />;
    case "subscription":  return <SubscriptionTab />;
    case "referral":      return <ReferralTab />;
    case "help":          return <HelpTab />;
    case "delegation":    return <DelegationTab />;
    case "profession":    return <ProfessionTab />;
    case "signature":     return <SignatureTab />;
    case "invoice":       return <InvoiceTab />;
    case "compliance":    return <ComplianceTab />;
    default:              return null;
  }
}

// ── Loading skeleton (T28-34) ────────────────────────────────────────
//
// Drawn until useUser() has resolved the session once. Before that the only
// session there is is GUEST_SESSION, whose null userType maps to the
// eight-tab client policy — which is what a lawyer used to see first, before
// the page swapped to their own tabs. Shapes only: no tab names, no count, no
// role, nothing that could turn out to be somebody else's settings.
const SKELETON_BAR = "bg-slate-200/80 dark:bg-white/[0.06]";
const SKELETON_LABEL_WIDTHS = ["62%", "48%", "70%", "55%", "44%", "66%", "52%", "58%"];

function SettingsSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex flex-col lg:flex-row gap-6 animate-pulse"
    >
      <span className="sr-only">جارٍ تحميل الإعدادات</span>

      {/* Desktop sidebar placeholder — same frame as the real rail. */}
      <div className="hidden lg:block w-56 flex-shrink-0" aria-hidden="true">
        <div className="bg-white/80 dark:bg-[#161b22]/80 rounded-[2rem] border border-slate-200/50 dark:border-white/[0.06] p-3">
          {SKELETON_LABEL_WIDTHS.map((width, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className={`h-[18px] w-[18px] flex-shrink-0 rounded-md ${SKELETON_BAR}`} />
              <div className={`h-3 rounded-full ${SKELETON_BAR}`} style={{ width }} />
            </div>
          ))}
        </div>
      </div>

      {/* Mobile pill placeholders. */}
      <div className="lg:hidden flex gap-2 overflow-hidden pb-2" aria-hidden="true">
        {[96, 80, 104, 88].map((width, i) => (
          <div key={i} className={`h-10 flex-shrink-0 rounded-full ${SKELETON_BAR}`} style={{ width }} />
        ))}
      </div>

      {/* Panel placeholder. */}
      <div className="flex-1 min-w-0" aria-hidden="true">
        <div className="bg-white/80 dark:bg-[#161b22]/80 rounded-[2rem] border border-slate-200/50 dark:border-white/[0.06] p-7 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-white/[0.06]">
            <div className={`h-10 w-10 rounded-xl ${SKELETON_BAR}`} />
            <div className="flex-1 space-y-2">
              <div className={`h-3.5 w-40 max-w-[60%] rounded-full ${SKELETON_BAR}`} />
              <div className={`h-2.5 w-64 max-w-[80%] rounded-full ${SKELETON_BAR}`} />
            </div>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className={`h-3 w-24 rounded-full ${SKELETON_BAR}`} />
                <div className={`h-11 w-full rounded-2xl ${SKELETON_BAR}`} />
              </div>
            ))}
          </div>
          <div className={`h-11 w-32 rounded-2xl ${SKELETON_BAR}`} />
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { isRTL } = useTheme();
  const router = useRouter();
  // T28-34. The open tab is owned by useSettingsTabs() now, not by two effects
  // here. It is chosen once the session has resolved (`ready`), honours ?tab=
  // at that moment, and is reset afterwards only when the resolved role
  // genuinely lacks it — never during a session reload, a sign-out or a
  // degraded role read. Rules and tests: hooks/settingsActiveTab(.test).ts.
  const { tabs, policy, ready, activeTab, selectTab } = useSettingsTabs();

  const handleLogout = () => {
    logout();
    router.push("/auth/login");
  };

  return (
    <div
      dir={isRTL ? "rtl" : "ltr"}
      className="min-h-[100dvh] bg-[#f9fafb] dark:bg-[#0c0f12] transition-colors duration-300"
      suppressHydrationWarning
    >
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 py-10">
        <motion.h1
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
          className="text-xl font-bold text-zinc-900 dark:text-white mb-8 tracking-tight"
        >
          {isRTL ? "الإعدادات" : "Settings"}
        </motion.h1>

        {/* WP-6 B-9. The corporate role predicates now DENY when the role is
            unknown (they used to default to «owner», i.e. full manager). A
            silent denial over a role we never managed to read is the mirror
            image of that fail-open, so the reason is stated instead of the
            tabs simply being absent. `roleUnavailable` is set only when the
            session's membership reads were degraded or failed — not when the
            account genuinely holds no entity role.
            Both notices wait for `ready` (T28-34): before the session has
            resolved, `policy` is the guest's, and neither notice is true of
            anyone yet. */}
        {ready && policy.roleUnavailable && (
          <div className="mb-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-6 font-semibold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
            <Warning size={15} weight="fill" className="mt-0.5 shrink-0" />
            <span>
              تعذّر قراءة دورك داخل الشركة، لذلك لا تظهر هنا إلا الإعدادات الشخصية. هذه ليست قائمة صلاحياتك
              النهائية — أعد تحميل الصفحة، وإن تكرر الأمر تواصل مع مالك حساب الشركة أو فريق نظامي.
            </span>
          </div>
        )}

        {ready && policy.personalOnlyNotice && (
          <div className="mb-5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-6 text-sky-800 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200">
            {policy.personalOnlyNotice}
          </div>
        )}

        {!ready || activeTab === null ? (
          <SettingsSkeleton />
        ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* ── Desktop sidebar ──────────────────────────────── */}
          <motion.aside
            initial={{ opacity: 0, x: isRTL ? 20 : -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
            className="hidden lg:block w-56 flex-shrink-0"
          >
            <nav className="bg-white/80 dark:bg-[#161b22]/80 backdrop-blur-xl rounded-[2rem] border border-slate-200/50 dark:border-white/[0.06] p-3 sticky top-6 shadow-[0_20px_40px_-15px_rgba(11,61,46,0.04)]">
              {tabs.map((tab) => {
                const Icon = ICON_MAP[tab.iconKey];
                const active = activeTab === tab.id;
                return (
                  <motion.button
                    key={tab.id}
                    onClick={() => selectTab(tab.id)}
                    aria-current={active ? "page" : undefined}
                    whileTap={{ scale: 0.98 }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[13.5px] font-semibold transition-all duration-150 ${
                      active
                        ? "bg-[#0B3D2E] text-white shadow-md"
                        : "text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    <Icon
                      size={18}
                      weight={active ? "fill" : "regular"}
                      className={active ? "text-white" : "text-zinc-400 dark:text-zinc-500"}
                    />
                    {isRTL ? tab.labelAr : tab.labelEn}
                  </motion.button>
                );
              })}

              <div className="mt-2 pt-2 border-t border-slate-100 dark:border-white/[0.06]">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[13.5px] font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/[0.08] transition-colors"
                >
                  <SignOut size={18} />
                  {isRTL ? "تسجيل الخروج" : "Log out"}
                </motion.button>
              </div>
            </nav>
          </motion.aside>

          {/* ── Mobile pill tabs ──────────────────────────────── */}
          <div className="lg:hidden overflow-x-auto pb-2 -mx-4 px-4">
            <div className="flex gap-2 w-max">
              {tabs.map((tab) => {
                const Icon = ICON_MAP[tab.iconKey];
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => selectTab(tab.id)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all backdrop-blur-sm ${
                      active
                        ? "bg-[#0B3D2E] text-white shadow-md"
                        : "bg-white/80 dark:bg-[#161b22]/80 text-slate-600 dark:text-zinc-400 border border-slate-200/50 dark:border-white/[0.06]"
                    }`}
                  >
                    <Icon size={16} weight={active ? "fill" : "regular"} />
                    {isRTL ? tab.labelAr : tab.labelEn}
                  </button>
                );
              })}
              <div className="h-5 w-px bg-slate-200 dark:bg-white/[0.08] self-center mx-2" />
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap text-rose-500 border border-rose-100 hover:bg-rose-50 dark:border-rose-500/20 dark:hover:bg-rose-500/[0.08] transition-colors backdrop-blur-sm bg-white/50 dark:bg-transparent"
              >
                <SignOut size={16} />
                {isRTL ? "تسجيل الخروج" : "Log out"}
              </button>
            </div>
          </div>

          {/* ── Content area ──────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.05 }}
            className="flex-1 min-w-0"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ type: "spring", stiffness: 200, damping: 25 }}
              >
                <TabContent tabId={activeTab} />
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>
        )}
      </div>

      <Footer />
          </div>
  );
}

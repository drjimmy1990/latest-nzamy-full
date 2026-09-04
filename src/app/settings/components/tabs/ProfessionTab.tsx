"use client";

/**
 * 2026-09-04 — Phase 6 (compliance/delegation/team/profession honesty pass).
 *
 * ── WHAT CHANGED ─────────────────────────────────────────────────────────
 * This tab used to hold five `useState`s (visible, proBono, instantReq,
 * selected specialties, saved) that never read from or wrote to the server —
 * `handleSave` set `saved` for 2.5s and said «تم حفظ إعدادات المهنة محلياً
 * فقط؛ ظهور السوق والأسعار ينتظران API». It also rendered a "قبول قضايا
 * مجانية (Pro Bono)" toggle, a "قبول الطلبات الفورية" toggle for providers,
 * a "مدة الاستشارة الافتراضية" input, a free-text "مناطق التغطية الجغرافية"
 * field and two work-hours time pickers — none backed by a column.
 *
 * `lawyer_profiles` (supabase/migrations/20260603_phase1_001_profiles.sql)
 * DOES back five of the old fields, and `PATCH /api/v1/profile` already
 * allowlists all five (src/app/api/v1/profile/route.ts, `lawyerFields`):
 * marketplace_visible, is_accepting_clients, show_contact, specialties,
 * hourly_rate. This tab now reads them from `GET /api/v1/profile`'s
 * `roleProfile` and writes them back through that same PATCH — nothing more.
 * Pro-bono, instant requests, service duration, coverage areas and work
 * hours have no column anywhere and are gone rather than kept as decoration
 * over a save that would silently drop them.
 *
 * `subRole`-driven branches (notary/arbitrator/bailiff copy, the
 * "isProvider" toggle) are gone with them: only a lawyer account has a
 * `lawyer_profiles` row these fields live on. Every other account type gets
 * the honest empty state.
 */

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Briefcase, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { EmptyPanel, SectionTitle, ToggleRow } from "./_shared";

// lawyer_profiles.specialties is `text[]`, free text — not an enum (see the
// same fact noted next to SPECIALTY_HUE in src/app/lawyers/browse/page.tsx).
// This is a curated set of common ones to tap instead of typing; any value
// already saved on the account that is not in this list is folded in below
// so a save from here never silently drops a specialty the account already
// had.
const SUGGESTED_SPECIALTIES = [
  "قانون تجاري", "ملكية فكرية", "قانون العمل", "منازعات إدارية",
  "عقارات", "جنائي", "أحوال شخصية", "قانون دولي",
];

interface RoleProfileFields {
  marketplace_visible?: boolean | null;
  is_accepting_clients?: boolean | null;
  show_contact?: boolean | null;
  specialties?: string[] | null;
  hourly_rate?: number | null;
}

type ProfileApiResponse = {
  roleProfile: RoleProfileFields | null;
  // Always sent by the route, including `false` — see its own GET docstring.
  roleProfileReadFailed?: boolean;
};

/**
 * Three ways this tab can end up with nothing to show, same split the
 * lawyer profile editor uses (src/app/dashboard/lawyer/profile/edit/page.tsx)
 * for the same `roleProfile: null` ambiguity:
 *   "read-failed" — the GET threw, or came back 200 with the route reporting
 *                    the lawyer_profiles read itself failed.
 *   "no-row"      — the GET succeeded and this account has no professional
 *                    row it can see.
 *   "no-server"   — demo build; there is nothing to read from or write to.
 */
type BlockedReason = "read-failed" | "no-row" | "no-server";

const GENERIC_ERROR = "تعذّر حفظ إعدادات المهنة. تحقق من اتصالك وحاول مرة أخرى.";

/** NOTE: deliberate duplicate of the same helper in NotificationsTab.tsx — see its own note on why. */
function arabicError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  if (raw) console.warn("[Nzamy] profession settings request failed:", raw);
  return /[؀-ۿ]/.test(raw) ? raw : GENERIC_ERROR;
}

export function ProfessionTab() {
  const { userType, loading: userLoading } = useUser();
  const isLawyer = userType === "lawyer";

  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState<BlockedReason | null>(null);

  const [marketplaceVisible, setMarketplaceVisible] = useState(false);
  const [acceptingClients, setAcceptingClients] = useState(true);
  const [showContact, setShowContact] = useState(false);
  const [hourlyRate, setHourlyRate] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseMode) {
      setBlocked("no-server");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiGet<ProfileApiResponse>("/api/v1/profile");
      const r = res.roleProfile;
      if (r) {
        setMarketplaceVisible(r.marketplace_visible ?? false);
        setAcceptingClients(r.is_accepting_clients ?? true);
        setShowContact(r.show_contact ?? false);
        setHourlyRate(r.hourly_rate != null ? String(r.hourly_rate) : "");
        setSelected(r.specialties ?? []);
        setBlocked(null);
      } else {
        setBlocked(res.roleProfileReadFailed === true ? "read-failed" : "no-row");
      }
    } catch {
      setBlocked("read-failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userLoading || !isLawyer) return;
    load();
  }, [userLoading, isLawyer, load]);

  const toggleSpecialty = (s: string) =>
    setSelected((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const handleSave = async () => {
    if (blocked || saving) return;
    setSaving(true);
    setError(null);
    try {
      await apiMutate("/api/v1/profile", "PATCH", {
        marketplace_visible: marketplaceVisible,
        is_accepting_clients: acceptingClients,
        show_contact: showContact,
        specialties: selected,
        hourly_rate: hourlyRate.trim() ? Number(hourlyRate) : null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(arabicError(err));
    } finally {
      setSaving(false);
    }
  };

  // The role is not known yet — do not decide between the real form and the
  // "not available for this account" panel on a `userType` that has not
  // finished loading and may still resolve to "lawyer".
  if (userLoading) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center dark:border-white/[0.06] dark:bg-dark-card">
        <p className="text-sm text-zinc-400 dark:text-zinc-500">جارٍ التحقق من نوع الحساب...</p>
      </div>
    );
  }

  if (!isLawyer) {
    return (
      <div className="space-y-8">
        <EmptyPanel
          icon={<Briefcase size={26} />}
          title="إعدادات المهنة متاحة لحسابات المحامين فقط"
          description="الظهور في السوق وقبول العملاء والتخصصات والسعر بالساعة مخزّنة في ملف المحامي المهني (lawyer_profiles)، ولا يوجد لحساب من هذا النوع سجل مهني مماثل بعد."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center dark:border-white/[0.06] dark:bg-dark-card">
        <p className="text-sm text-zinc-400 dark:text-zinc-500">جارٍ تحميل إعدادات المهنة...</p>
      </div>
    );
  }

  if (blocked) {
    const description =
      blocked === "no-server"
        ? "هذا وضع عرض تجريبي بلا خادم؛ لا يمكن قراءة إعدادات المهنة أو حفظها من هنا."
        : blocked === "no-row"
          ? "لا يوجد سجل مهني مرتبط بحسابك بعد، فلا يوجد ما يُعرض أو يُحفظ من هذه الصفحة."
          : "تعذّرت قراءة إعدادات المهنة من الخادم. أعد فتح هذه الصفحة أو حاول مرة أخرى لاحقاً.";
    return (
      <div className="space-y-8">
        <EmptyPanel icon={<Briefcase size={26} />} title="تعذّر عرض إعدادات المهنة" description={description} />
      </div>
    );
  }

  const specialtyOptions = Array.from(new Set([...SUGGESTED_SPECIALTIES, ...selected]));

  return (
    <div className="space-y-8">
      {/* Marketplace visibility */}
      <div>
        <SectionTitle>الظهور في السوق</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] px-5 divide-y divide-gray-100 dark:divide-white/[0.04]">
          <ToggleRow
            label="إظهار ملفي في سوق المحاماة"
            description="العملاء يستطيعون العثور عليك والتواصل معك"
            checked={marketplaceVisible}
            onChange={() => setMarketplaceVisible((v) => !v)}
          />
          <ToggleRow
            label="قبول عملاء جدد"
            description="يظهر ملفك كمحامٍ يستقبل طلبات جديدة حالياً"
            checked={acceptingClients}
            onChange={() => setAcceptingClients((v) => !v)}
          />
          <ToggleRow
            label="إظهار بيانات التواصل في ملفي العام"
            description="رقم الجوال والبريد يظهران للعملاء في صفحة ملفك العام"
            checked={showContact}
            onChange={() => setShowContact((v) => !v)}
          />
        </div>
      </div>

      {/* Specialties */}
      <div>
        <SectionTitle>التخصصات ({selected.length} مختار)</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] p-5">
          <div className="flex flex-wrap gap-2">
            {specialtyOptions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleSpecialty(s)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                  selected.includes(s)
                    ? "bg-royal text-white border-transparent"
                    : "bg-white dark:bg-dark-bg border-gray-200 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-400 hover:border-royal/30"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Hourly rate */}
      <div>
        <SectionTitle>السعر</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] p-5">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            السعر بالساعة (ر.س)
          </label>
          <input
            type="number"
            min="0"
            step="1"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            placeholder="مثال: 500"
            className="w-full sm:w-64 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-dark-bg text-zinc-800 dark:text-zinc-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-royal/30 transition-colors"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          <WarningCircle size={15} weight="fill" />
          {error}
        </div>
      )}

      <motion.button
        whileTap={{ scale: 0.98, y: 1 }}
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-8 py-3 bg-royal hover:bg-royal/90 text-white rounded-xl font-semibold text-sm transition-all shadow-[0_4px_14px_-4px_rgba(11,61,46,0.4)] disabled:opacity-70"
      >
        {saving ? (
          <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : saved ? (
          <CheckCircle size={18} weight="fill" />
        ) : null}
        {saving ? "جاري الحفظ..." : saved ? "تم الحفظ" : "حفظ إعدادات المهنة"}
      </motion.button>
    </div>
  );
}

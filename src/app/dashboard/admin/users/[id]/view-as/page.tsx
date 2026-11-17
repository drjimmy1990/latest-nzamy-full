"use client";

/**
 * /dashboard/admin/users/[id]/view-as — S2 «عرض كمستخدم».
 *
 * A READ-ONLY view of what one user sees: the dashboard home summary, their
 * cases and their profile. Every number comes from
 * GET /api/v1/admin/users/[id]/view-as, which reads with the service client
 * filtered to that user's id and logs each page in admin_audit_events before
 * it answers (src/lib/admin/viewAsCore.ts). Nothing here signs in as the user
 * and nothing here writes: no form, no action button — only the tabs and the
 * way out.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { apiErrorText } from "@/lib/services/apiErrorText";
import type { ViewAsCase, ViewAsHome, ViewAsPage, ViewAsProfile, ViewAsTarget } from "@/lib/admin/viewAsCore";

const TABS: Array<{ id: ViewAsPage; label: string }> = [
  { id: "home", label: "الرئيسية" },
  { id: "cases", label: "القضايا والطلبات" },
  { id: "profile", label: "الملف الشخصي" },
];

const USER_TYPE_AR: Record<string, string> = {
  individual: "عميل فرد",
  client: "عميل",
  lawyer: "محامي",
  firm: "مكتب محاماة",
  corporate: "شركة",
  micro: "منشأة صغيرة",
  provider: "مزود خدمة",
  government: "جهة حكومية",
  ngo: "منظمة غير ربحية",
  admin: "مسؤول",
};

const STATUS_AR: Record<string, string> = {
  draft: "مسودة",
  pending: "قيد الانتظار",
  pending_payment: "بانتظار الدفع",
  pending_assignment: "بانتظار الإسناد",
  assigned: "مُسندة",
  in_review: "قيد المراجعة",
  completed: "مكتملة",
  cancelled: "ملغاة",
};

const VERIFICATION_AR: Record<string, string> = {
  pending: "قيد التوثيق",
  verified: "موثّق",
  rejected: "مرفوض",
  suspended: "موقوف",
};

const dash = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? "—" : String(v));
const dateAr = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ar-SA-u-ca-gregory", { year: "numeric", month: "long", day: "numeric" }) : "—";

type Loaded =
  | { page: "home"; data: ViewAsHome }
  | { page: "cases"; data: ViewAsCase[] }
  | { page: "profile"; data: ViewAsProfile };

export default function ViewAsPageScreen() {
  const { isDark } = useTheme();
  const params = useParams();
  const userId = params.id as string;

  const [tab, setTab] = useState<ViewAsPage>("home");
  const [target, setTarget] = useState<ViewAsTarget | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);

  const load = useCallback(
    async (page: ViewAsPage) => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ page });
        if (sessionRef.current) qs.set("session", sessionRef.current);
        const res = await fetch(`/api/v1/admin/users/${encodeURIComponent(userId)}/view-as?${qs}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(apiErrorText(res.status, json, "تعذّر فتح العرض، حاول مرة أخرى"));
        sessionRef.current = json.sessionId;
        setTarget(json.target);
        setLoaded({ page: json.page, data: json.data } as Loaded);
      } catch (err) {
        setError(err instanceof Error ? err.message : "تعذّر فتح العرض، حاول مرة أخرى");
        setLoaded(null);
      } finally {
        setLoading(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  const card = isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-slate-200";
  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const strong = isDark ? "text-white" : "text-slate-800";
  const name = target?.name ?? target?.email ?? "هذا المستخدم";

  return (
    <div className="max-w-5xl mx-auto space-y-4" dir="rtl">
      {/* the banner: always on, never dismissible */}
      <div
        role="status"
        className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-3 text-[13px] font-bold text-amber-700 dark:text-amber-300"
      >
        <span>
          أنت تعرض حساب {name} للقراءة فقط — لا يمكن تنفيذ أي إجراء من هنا، وكل صفحة تفتحها تُسجَّل في سجل التدقيق.
        </span>
        <Link
          href={`/dashboard/admin/users/${encodeURIComponent(userId)}`}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-amber-700"
        >
          إنهاء العرض
        </Link>
      </div>

      {target && (
        <div className={`rounded-xl border px-4 py-3 ${card}`}>
          <p className={`text-[15px] font-bold ${strong}`}>{name}</p>
          <p className={`text-[12px] ${muted}`}>
            {USER_TYPE_AR[target.userType ?? ""] ?? dash(target.userType)} · {dash(target.email)}
            {target.isDemo && <span className="mr-2 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-600 dark:text-sky-300">حساب تجريبي</span>}
          </p>
        </div>
      )}

      <div className="flex gap-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-xl px-4 py-2 text-[12px] font-bold transition-colors ${
              tab === t.id
                ? "bg-blue-600 text-white"
                : isDark
                  ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className={`text-[13px] ${muted}`}>جارٍ التحميل…</p>}
      {!loading && error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-600 dark:text-red-300">{error}</p>
      )}

      {!loading && !error && loaded?.page === "home" && <HomeView data={loaded.data} card={card} muted={muted} strong={strong} />}
      {!loading && !error && loaded?.page === "cases" && <CasesView rows={loaded.data} card={card} muted={muted} strong={strong} />}
      {!loading && !error && loaded?.page === "profile" && <ProfileView p={loaded.data} card={card} muted={muted} strong={strong} />}

      <p className={`text-[11px] ${muted}`}>
        تُقرأ هذه البيانات من الجداول نفسها التي تقرأ منها لوحة المستخدم، مقصورةً على حسابه. الملاحظات الداخلية للفريق لا تظهر هنا كما لا تظهر له.
      </p>
    </div>
  );
}

type Styles = { card: string; muted: string; strong: string };

function Stat({ label, value, card, muted, strong }: { label: string; value: string } & Styles) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${card}`}>
      <p className={`text-[11px] ${muted}`}>{label}</p>
      <p className={`mt-1 text-[18px] font-bold ${strong}`}>{value}</p>
    </div>
  );
}

function HomeView({ data, ...s }: { data: ViewAsHome } & Styles) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <Stat label="طلباته المفتوحة" value={dash(data.openRequested)} {...s} />
      <Stat label="قضايا مُسندة إليه ومفتوحة" value={dash(data.openAssigned)} {...s} />
      <Stat label="الموعد القادم" value={dateAr(data.nextConsultationAt)} {...s} />
      <Stat label="موكّلوه" value={dash(data.clients)} {...s} />
      <Stat label="إشعارات غير مقروءة" value={dash(data.unreadNotifications)} {...s} />
      <Stat label="رصيد النقاط" value={dash(data.pointsBalance)} {...s} />
      <Stat
        label="الباقة الحالية"
        value={data.plan ? `${data.plan.name ?? data.plan.tier ?? "—"}${data.plan.endsAt ? ` حتى ${dateAr(data.plan.endsAt)}` : ""}` : "لا باقة مدفوعة"}
        {...s}
      />
    </div>
  );
}

function CasesView({ rows, card, muted, strong }: { rows: ViewAsCase[] } & Styles) {
  if (rows.length === 0) return <p className={`rounded-xl border px-4 py-6 text-center text-[13px] ${card} ${muted}`}>لا قضايا ولا طلبات في هذا الحساب.</p>;
  return (
    <div className={`overflow-x-auto rounded-xl border ${card}`}>
      <table className="w-full text-right text-[12px]">
        <thead className={muted}>
          <tr>
            <th className="px-3 py-2 font-bold">العنوان</th>
            <th className="px-3 py-2 font-bold">النوع</th>
            <th className="px-3 py-2 font-bold">الحالة</th>
            <th className="px-3 py-2 font-bold">صفته</th>
            <th className="px-3 py-2 font-bold">التاريخ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-500/15">
              <td className={`px-3 py-2 ${strong}`}>{dash(r.title)}</td>
              <td className={`px-3 py-2 ${muted}`}>{dash(r.type)}</td>
              <td className={`px-3 py-2 ${strong}`}>{STATUS_AR[r.status ?? ""] ?? dash(r.status)}</td>
              <td className={`px-3 py-2 ${muted}`}>{r.side === "requester" ? "مقدّم الطلب" : "مُسندة إليه"}</td>
              <td className={`px-3 py-2 ${muted}`}>{dateAr(r.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProfileView({ p, card, muted, strong }: { p: ViewAsProfile } & Styles) {
  const rows: Array<[string, string]> = [
    ["الاسم", dash(p.displayName)],
    ["البريد", dash(p.email)],
    ["الجوال", dash(p.phone)],
    ["المدينة", dash(p.city)],
    ["نوع الحساب", USER_TYPE_AR[p.userType ?? ""] ?? dash(p.userType)],
    ["تاريخ التسجيل", dateAr(p.createdAt)],
    ["حساب تجريبي", p.isDemo ? "نعم" : "لا"],
  ];
  if (p.lawyer) {
    rows.push(["التوثيق", VERIFICATION_AR[p.lawyer.verificationStatus ?? ""] ?? dash(p.lawyer.verificationStatus)]);
    rows.push(["صفة الممارسة", p.lawyer.practiceKind === "advocate" ? "محامٍ مرخّص للترافع" : p.lawyer.practiceKind === "consultant" ? "مستشار" : dash(p.lawyer.practiceKind)]);
    rows.push(["يظهر في دليل المحامين", p.lawyer.marketplaceVisible === null ? "—" : p.lawyer.marketplaceVisible ? "نعم" : "لا"]);
  }
  return (
    <dl className={`grid grid-cols-1 gap-x-6 gap-y-2 rounded-xl border px-4 py-4 sm:grid-cols-2 ${card}`}>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-slate-500/10 py-1.5">
          <dt className={`text-[12px] ${muted}`}>{k}</dt>
          <dd className={`text-[12px] font-bold ${strong}`} dir="auto">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

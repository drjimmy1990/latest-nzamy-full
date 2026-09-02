"use client";

import { useEffect, useState } from "react";
import { Bell, BellSlash, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { SectionTitle, LocalActionStatus, Toggle, ToggleRow } from "./_shared";
import { motion } from "framer-motion";

// ── Notification category definitions per user type ───────────────────
//
// This table is the ONLY definition of what a notification preference is
// called. The onboarding wizard (src/app/onboarding/page.tsx) asks about a
// subset of these same categories and writes the same keys, because two
// screens that ask the same question in two vocabularies cannot both be
// telling the truth. Everything the wizard needs is exported from here — the
// categories, the subset it shows, and the read/write helpers — so the wizard
// never restates a label or a key of its own.
//
// The copy here is Arabic only: this tab has no language switch, and the
// wizard (which does) keeps its English pairs beside its own step-4 code.
export interface NotifCategory {
  key: string;
  label: string;
  description: string;
  defaultOn: boolean;
}

/**
 * Which wording of the legislative-updates category a role reads (obs-24).
 *
 * Exported because the onboarding wizard renders the same category in English
 * and has to pick the matching English sentence; the role → audience table
 * itself must not exist twice.
 */
export type LegalUpdateAudience = "practitioner" | "individual" | "business";

export function legalUpdateAudience(userType: string | null): LegalUpdateAudience {
  switch (userType) {
    case "individual":
      return "individual";
    case "corporate":
    case "micro":
    case "ngo":
      return "business";
    // محامٍ, شركة محاماة, جهة حكومية and مقدّم خدمة all read the practitioner
    // wording. So does the unknown role: a general legislative sentence
    // promises the reader nothing about themselves, which is the only honest
    // thing to say to somebody whose role has not resolved.
    default:
      return "practitioner";
  }
}

/**
 * obs-24: «أنظمة ولوائح جديدة» means something to a محامٍ and nothing at all to
 * an عميل فرد. One category, one key — the sentence is the only part that
 * follows the role.
 */
function legalUpdateCategory(userType: string | null): NotifCategory {
  switch (legalUpdateAudience(userType)) {
    case "individual":
      return {
        key: "legal_update",
        label: "⚖️ تنبيهات حقوقك وتعديلات الأنظمة التي تمسك (العمل، الإيجار، والأحوال)",
        description: "تعديل نظامي يمسّ حقوقك مباشرة",
        defaultOn: true,
      };
    case "business":
      return {
        key: "legal_update",
        label: "🏢 التحديثات التنظيمية والامتثال التجاري والقرارات الوزارية لقطاع الأعمال",
        description: "قرار وزاري أو التزام تنظيمي جديد",
        defaultOn: true,
      };
    default:
      return {
        key: "legal_update",
        label: "📜 تحديثات الأنظمة واللوائح والقرارات التشريعية الجديدة",
        description: "صدور نظام أو لائحة أو قرار تشريعي",
        defaultOn: true,
      };
  }
}

export function getNotificationCategories(userType: string | null): NotifCategory[] {
  const shared: NotifCategory[] = [
    legalUpdateCategory(userType),
    { key: "platform_updates", label: "تحديثات المنصة",           description: "ميزات جديدة ونشرات نظامي",      defaultOn: true  },
    { key: "payment_done",     label: "المدفوعات",                description: "فاتورة مدفوعة أو رصيد محتجز", defaultOn: true  },
    { key: "reminders",        label: "التذكيرات العامة",          description: "تواريخ مهمة ومواعيد نهائية",   defaultOn: true  },
  ];

  switch (userType) {
    case "individual":
      return [
        { key: "case_update",    label: "تحديث القضية",             description: "جلسات جديدة أو ردود من المحامي",  defaultOn: true  },
        { key: "consultation",   label: "ردود الاستشارات",          description: "وصل رد على سؤالك",              defaultOn: true  },
        { key: "contract",       label: "العقود",                  description: "عقد جاهز للتوقيع أو مراجعة",     defaultOn: true  },
        ...shared,
      ];

    case "lawyer":
      return [
        { key: "new_case",       label: "قضية جديدة",              description: "تم تعيين قضية لك",               defaultOn: true  },
        { key: "hearing",        label: "مواعيد الجلسات",           description: "جلسة قادمة قبل 24 ساعة",        defaultOn: true  },
        { key: "client_msg",     label: "رسائل الموكلين",           description: "رسالة جديدة من موكل",            defaultOn: true  },
        { key: "ai_result",      label: "نتائج الذكاء الاصطناعي",    description: "اكتمل بحث أو مسودة",            defaultOn: true  },
        { key: "fee_approval",   label: "الأتعاب",                  description: "موافقة أو طلب تعديل أتعاب",      defaultOn: true  },
        { key: "perf_weekly",    label: "إحصائيات الأداء الأسبوعي",  description: "تقرير أسبوعي بالأداء والإنجازات", defaultOn: false },
        ...shared,
      ];

    case "firm":
      return [
        { key: "team_activity",  label: "نشاط الفريق",             description: "إجراءات الأعضاء المهمة",          defaultOn: true  },
        { key: "new_case",       label: "قضية جديدة للمكتب",        description: "تم قبول قضية جديدة",             defaultOn: true  },
        { key: "financial",      label: "المالية والفواتير",         description: "فاتورة مصدرة أو دفعة واردة",     defaultOn: true  },
        { key: "license_expiry", label: "تجديدات الترخيص",          description: "ترخيص المكتب ينتهي قريباً",      defaultOn: true  },
        { key: "client_approval",label: "موافقات الموكلين",          description: "موكل وافق على العقد أو الأتعاب", defaultOn: true  },
        { key: "delegation",     label: "التفويض",                  description: "استُخدم تفويضك من قِبل أحد الأعضاء", defaultOn: true },
        ...shared,
      ];

    case "corporate":
      // التحديثات القانونية is no longer a line of its own here: `legal_update`
      // moved into `shared` with role-following wording, so the entry that used
      // to sit below was removed rather than left to collide. Two entries with
      // the same key would render two rows driving one switch.
      return [
        { key: "approval_req",   label: "طلبات الموافقة",           description: "طلب ينتظر موافقتك",              defaultOn: true  },
        { key: "compliance",     label: "الامتثال والحوكمة",         description: "تنبيه ZATCA أو PDPL أو SAMA",    defaultOn: true  },
        { key: "contract",       label: "العقود",                   description: "عقد جاهز للمراجعة أو التوقيع",   defaultOn: true  },
        { key: "employee_req",   label: "طلبات الموظفين",           description: "طلب جديد من موظف",               defaultOn: true  },
        ...shared,
      ];

    case "micro":
      return [
        { key: "contract",       label: "العقود",                   description: "عقد جديد أو طلب تعديل",          defaultOn: true  },
        { key: "consultation",   label: "ردود الاستشارات",          description: "رد على استشارتك",                defaultOn: true  },
        { key: "renewal",        label: "تجديد الاشتراك",            description: "اشتراكك ينتهي قريباً",           defaultOn: true  },
        ...shared,
      ];

    case "government":
      return [
        { key: "case_assign",    label: "تعيين القضايا",            description: "قضية جديدة مُعيَّنة لك",         defaultOn: true  },
        { key: "hearing",        label: "مواعيد الجلسات",           description: "جلسة مجدولة قادمة",              defaultOn: true  },
        // 2026-09-02 — «دخول عبر نفاذ» («تنبيه عند أي دخول بهويتك») was here,
        // switched on by default. It promised alerts on an event that cannot
        // occur: there is no Nafath sign-in on this platform and no
        // integration behind it. The settings tab that staged the same claim
        // was deleted in the same change. A device-login alert that IS real
        // in intent lives in SecurityTab; this row asserted a national
        // identity provider was watching the account, which is a different
        // and much larger claim.
        { key: "circular",       label: "التعاميم الرسمية",          description: "تعميم جديد من الجهة",            defaultOn: true  },
        ...shared,
      ];

    case "ngo":
      // `gov_reports`, not `compliance`: the periodic تقارير وزارة الموارد a
      // جمعية files are not the ZATCA/PDPL حوكمة a شركة answers for, and one
      // key holding both meanings would carry an association's answer onto a
      // category that is not theirs the moment an admin changes `user_type`.
      return [
        { key: "approval_req",   label: "طلبات الموافقة",           description: "موافقة إدارية مطلوبة",            defaultOn: true  },
        { key: "gov_reports",    label: "التقارير الحكومية",         description: "تقرير دوري مستحق لوزارة الموارد", defaultOn: true  },
        { key: "donation",       label: "التبرعات",                  description: "تبرع جديد واردة",                defaultOn: true  },
        ...shared,
      ];

    case "provider":
      return [
        { key: "new_request",    label: "طلب خدمة جديد",            description: "عميل طلب خدمتك",                 defaultOn: true  },
        { key: "appointment",    label: "المواعيد",                  description: "تم حجز موعد أو تعديله",          defaultOn: true  },
        { key: "rating",         label: "التقييمات",                 description: "تقييم جديد من عميل",             defaultOn: true  },
        ...shared,
      ];

    default:
      return shared;
  }
}

// ── The subset the onboarding wizard asks about ───────────────────────
//
// The wizard has room for a handful of switches, not a whole matrix, so it
// asks about the two categories that define the role plus the legislative one
// (obs-24). Every id below is a key of `getNotificationCategories` for that
// same role — the wizard cannot show a category the settings tab has no row
// for, which is the whole point of picking them here.
const WIZARD_CATEGORY_KEYS: Record<string, [string, string]> = {
  individual: ["case_update",  "consultation"],
  lawyer:     ["new_case",     "hearing"],
  firm:       ["new_case",     "team_activity"],
  corporate:  ["approval_req", "compliance"],
  micro:      ["contract",     "consultation"],
  government: ["case_assign",  "circular"],
  ngo:        ["approval_req", "gov_reports"],
  provider:   ["new_request",  "appointment"],
};

/** The categories the onboarding wizard shows for a role, in display order. */
export function getWizardCategories(userType: string | null): NotifCategory[] {
  const byKey = new Map(getNotificationCategories(userType).map((c) => [c.key, c]));
  // A role with no entry above is one whose categories are `shared` only —
  // there is nothing role-defining to ask about, so the two general ones stand
  // in. They exist for every role, so the lookup below never comes up empty.
  const picked = WIZARD_CATEGORY_KEYS[userType ?? ""] ?? ["platform_updates", "reminders"];
  return [...picked, "legal_update"]
    .map((key) => byKey.get(key))
    .filter((cat): cat is NotifCategory => cat !== undefined);
}

// ── Persistence ───────────────────────────────────────────────────────
//
// The categories have no column of their own; they live under one key of
// `user_settings.preferences` (jsonb). The three channels are split so that no
// answer is written twice: البريد → `email_notifications`, التطبيق →
// `push_notifications`, and الرسائل النصية → `preferences`, because there is no
// SMS column and `whatsapp_notifications` is a different channel, not this one.

/** The key `user_settings.preferences` keeps the notification block under. */
const NOTIF_PREFS_KEY = "notifications";

interface NotifPrefsBlock {
  categories?: Record<string, boolean>;
  sms?: boolean;
}

/** The 200 body of GET/PUT /api/v1/settings, in the fields this tab reads. */
export type UserSettingsEnvelope = {
  settings: {
    email_notifications?: boolean | null;
    push_notifications?: boolean | null;
    marketing_emails?: boolean | null;
    preferences?: Record<string, unknown> | null;
  } | null;
};

/** The notification block of a `preferences` object, defensively. */
function readNotifBlock(preferences: unknown): NotifPrefsBlock {
  if (!preferences || typeof preferences !== "object") return {};
  const block = (preferences as Record<string, unknown>)[NOTIF_PREFS_KEY];
  if (!block || typeof block !== "object") return {};
  const { categories, sms } = block as { categories?: unknown; sms?: unknown };
  return {
    categories:
      categories && typeof categories === "object"
        ? (categories as Record<string, boolean>)
        : undefined,
    sms: typeof sms === "boolean" ? sms : undefined,
  };
}

/**
 * The switch positions to render for a role: every category starts at its own
 * `defaultOn` and only then is overlaid with what was actually saved. Stored
 * keys the role no longer has are ignored rather than merged — an admin can
 * change `user_type`, and a preference for a category that is not on screen
 * must not decide the state of one that is.
 */
export function readCategoryStates(
  userType: string | null,
  preferences: unknown,
): Record<string, boolean> {
  const stored = readNotifBlock(preferences).categories ?? {};
  return Object.fromEntries(
    getNotificationCategories(userType).map((cat) => [
      cat.key,
      typeof stored[cat.key] === "boolean" ? stored[cat.key] : cat.defaultOn,
    ]),
  );
}

/** The SMS channel, which has no column — `true` until it is answered. */
export function readSmsChannel(preferences: unknown): boolean {
  return readNotifBlock(preferences).sms ?? true;
}

/**
 * A `preferences` object to PUT: the one this account already had, with the
 * notification block updated.
 *
 * Everything outside the notification key is carried through untouched — PUT
 * replaces the whole jsonb column, so anything dropped here is deleted. Keys of
 * categories that are not on screen are carried through too: they belong to a
 * role this account had before, and keeping them means an account moved back
 * finds its old answers instead of silent defaults.
 *
 * `sms` left undefined keeps whatever is stored — the onboarding wizard never
 * asks about channels and must not answer for the user.
 */
export function buildNotificationPreferences(
  existing: Record<string, unknown> | null | undefined,
  categories: Record<string, boolean>,
  sms?: boolean,
): Record<string, unknown> {
  const base: Record<string, unknown> =
    existing && typeof existing === "object" ? { ...existing } : {};
  const current = readNotifBlock(base);
  const block: NotifPrefsBlock = {
    categories: { ...(current.categories ?? {}), ...categories },
    sms: sms ?? current.sms ?? true,
  };
  base[NOTIF_PREFS_KEY] = block;
  return base;
}

// ── Errors ────────────────────────────────────────────────────────────

/** Shown when a failure carries no Arabic message of its own. */
const GENERIC_SETTINGS_ERROR = "تعذّر حفظ التفضيلات. تحقق من اتصالك وحاول مرة أخرى.";

/**
 * The Arabic message for a failed request, or the generic one.
 *
 * NOTE: this is a deliberate duplicate of `arabicError` in
 * src/app/onboarding/page.tsx — same reason, different generic sentence.
 * `apiMutate` (src/lib/services/api.ts:56-59) falls back to `API error: 500`
 * when a response carries no JSON `error`, and that string must never reach an
 * Arabic screen. If a third caller appears, extract them into one module.
 */
function arabicSettingsError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  if (raw) console.warn("[Nzamy] notification settings request failed:", raw);
  return /[\u0600-\u06ff]/.test(raw) ? raw : GENERIC_SETTINGS_ERROR;
}

// ── Component ─────────────────────────────────────────────────────────
export function NotificationsTab() {
  const { userType, loading } = useUser();
  const categories = getNotificationCategories(userType);

  const [states, setStates] = useState<Record<string, boolean>>(() =>
    readCategoryStates(userType, null),
  );
  const [channel, setChannel] = useState({ app: true, sms: true, email: true });
  /**
   * The rest of `preferences` as it came back from the server, so the PUT below
   * can carry it through instead of overwriting the column with this tab's key
   * alone.
   */
  const [storedPreferences, setStoredPreferences] = useState<Record<string, unknown>>({});
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load the saved answers once the role is known.
   *
   * The role matters before the values do: `userType` is null on the first
   * render, and the categories of a null role are the four shared ones. Seeding
   * the switches then and saving would write `true` for every category that
   * arrived later — including `perf_weekly`, which a lawyer is meant to start
   * with switched off. So nothing is seeded until `useUser` has finished, and
   * everything is re-derived if the role itself changes.
   */
  useEffect(() => {
    if (loading) return;

    // Demo mode has no session and no `user_settings` row; the tab is a
    // preview there, and a 401 turned into an Arabic error would be a lie
    // about the user's own connection.
    if (!isSupabaseMode) {
      setStates(readCategoryStates(userType, null));
      setReady(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet<UserSettingsEnvelope>("/api/v1/settings");
        if (cancelled) return;
        const prefs = res.settings?.preferences ?? {};
        setStoredPreferences(prefs);
        setStates(readCategoryStates(userType, prefs));
        setChannel({
          app: res.settings?.push_notifications ?? true,
          sms: readSmsChannel(prefs),
          email: res.settings?.email_notifications ?? true,
        });
      } catch (err) {
        if (cancelled) return;
        // An account that has never saved gets defaults from the endpoint, so a
        // failure here is a real one. Show the switches at their role defaults
        // and say they are not the saved ones — a screen of confident switches
        // that came from nowhere is what this tab is being fixed for.
        setStates(readCategoryStates(userType, null));
        setError(arabicSettingsError(err));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userType, loading]);

  const toggle = (key: string) =>
    setStates((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleSave = async () => {
    if (saving) return;
    setError(null);

    if (!isSupabaseMode) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      return;
    }

    setSaving(true);
    try {
      const res = await apiMutate<UserSettingsEnvelope>("/api/v1/settings", "PUT", {
        email_notifications: channel.email,
        push_notifications: channel.app,
        preferences: buildNotificationPreferences(storedPreferences, states, channel.sms),
      });
      setStoredPreferences(res.settings?.preferences ?? {});
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(arabicSettingsError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Channels */}
      <div>
        <SectionTitle>قنوات الإشعار</SectionTitle>
        <div className="bg-white/80 dark:bg-[#161b22]/80 backdrop-blur-xl rounded-[2rem] border border-slate-200/50 dark:border-white/[0.06] px-6 shadow-[0_20px_40px_-15px_rgba(11,61,46,0.04)] divide-y divide-slate-100 dark:divide-white/[0.04]">
          <ToggleRow label="إشعارات التطبيق"      description="داخل المنصة" checked={channel.app}   onChange={() => setChannel((p) => ({ ...p, app: !p.app }))} />
          <ToggleRow label="رسائل SMS"            description="على رقم جوالك" checked={channel.sms}   onChange={() => setChannel((p) => ({ ...p, sms: !p.sms }))} />
          <ToggleRow label="البريد الإلكتروني"     description="تقارير ومستجدات مهمة فقط" checked={channel.email} onChange={() => setChannel((p) => ({ ...p, email: !p.email }))} />
        </div>
      </div>

      {/* Categories */}
      <div>
        <SectionTitle>تصنيفات الإشعارات</SectionTitle>
        <div className="bg-white/80 dark:bg-[#161b22]/80 backdrop-blur-xl rounded-[2rem] border border-slate-200/50 dark:border-white/[0.06] px-6 shadow-[0_20px_40px_-15px_rgba(11,61,46,0.04)] divide-y divide-slate-100 dark:divide-white/[0.04]">
          {categories.map((cat) => (
            <ToggleRow
              key={cat.key}
              label={cat.label}
              description={cat.description}
              checked={states[cat.key] ?? cat.defaultOn}
              onChange={() => toggle(cat.key)}
            />
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          <WarningCircle size={15} weight="fill" />
          {error}
        </div>
      )}

      {/* Demo mode keeps the switches in the browser only, and says so. */}
      <LocalActionStatus
        show={saved && !isSupabaseMode}
        message="تم تطبيق التفضيلات في هذا المتصفح فقط — لا يوجد حساب محفوظ في وضع العرض."
      />

      <motion.button
        whileTap={{ scale: 0.98, y: 1 }}
        onClick={handleSave}
        disabled={saving || !ready}
        className="flex items-center gap-2 px-8 py-3.5 bg-[#0B3D2E] hover:bg-[#0a3328] text-white rounded-2xl font-bold text-[13.5px] transition-all shadow-[0_4px_14px_0_rgba(11,61,46,0.3)] active:scale-[0.98] disabled:opacity-70"
      >
        {saving ? (
          <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : saved ? (
          <CheckCircle size={18} weight="fill" />
        ) : null}
        {saving ? "جاري الحفظ..." : saved ? "تم الحفظ" : "حفظ الإعدادات"}
      </motion.button>
    </div>
  );
}

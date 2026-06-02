"use client";

import { useState } from "react";
import { Bell, BellSlash, CheckCircle } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { SectionTitle, Toggle, ToggleRow } from "./_shared";
import { motion } from "framer-motion";

// ── Notification category definitions per user type ───────────────────
interface NotifCategory {
  key: string;
  label: string;
  description: string;
  defaultOn: boolean;
}

function getCategories(userType: string | null): NotifCategory[] {
  const shared: NotifCategory[] = [
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
      return [
        { key: "approval_req",   label: "طلبات الموافقة",           description: "طلب ينتظر موافقتك",              defaultOn: true  },
        { key: "compliance",     label: "الامتثال والحوكمة",         description: "تنبيه ZATCA أو PDPL أو SAMA",    defaultOn: true  },
        { key: "contract",       label: "العقود",                   description: "عقد جاهز للمراجعة أو التوقيع",   defaultOn: true  },
        { key: "employee_req",   label: "طلبات الموظفين",           description: "طلب جديد من موظف",               defaultOn: true  },
        { key: "legal_update",   label: "التحديثات القانونية",       description: "نظام أو قرار جديد في مجال عملك", defaultOn: false },
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
        { key: "nafath_login",   label: "دخول عبر نفاذ",            description: "تنبيه عند أي دخول بهويتك",       defaultOn: true  },
        { key: "circular",       label: "التعاميم الرسمية",          description: "تعميم جديد من الجهة",            defaultOn: true  },
        ...shared,
      ];

    case "ngo":
      return [
        { key: "approval_req",   label: "طلبات الموافقة",           description: "موافقة إدارية مطلوبة",            defaultOn: true  },
        { key: "compliance",     label: "التقارير الحكومية",         description: "تقرير دوري مستحق لوزارة الموارد", defaultOn: true  },
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

// ── Component ─────────────────────────────────────────────────────────
export function NotificationsTab() {
  const { userType } = useUser();
  const categories = getCategories(userType);

  const [states, setStates] = useState<Record<string, boolean>>(
    Object.fromEntries(categories.map((c) => [c.key, c.defaultOn]))
  );
  const [channel, setChannel] = useState({ app: true, sms: true, email: false });
  const [saved, setSaved] = useState(false);

  const toggle = (key: string) =>
    setStates((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
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
              checked={states[cat.key] ?? true}
              onChange={() => toggle(cat.key)}
            />
          ))}
        </div>
      </div>

      <motion.button
        whileTap={{ scale: 0.98, y: 1 }}
        onClick={handleSave}
        className="flex items-center gap-2 px-8 py-3.5 bg-[#0B3D2E] hover:bg-[#0a3328] text-white rounded-2xl font-bold text-[13.5px] transition-all shadow-[0_4px_14px_0_rgba(11,61,46,0.3)] active:scale-[0.98]"
      >
        {saved && <CheckCircle size={18} weight="fill" />}
        {saved ? "تم الحفظ" : "حفظ الإعدادات"}
      </motion.button>
    </div>
  );
}

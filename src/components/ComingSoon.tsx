"use client";

import { motion } from "framer-motion";
import { HardHat, ArrowRight, House } from "@phosphor-icons/react";

const pageNames: Record<string, string> = {
  "/services/individuals": "خدمات الأفراد",
  "/services/business": "خدمات الشركات",
  "/services/consultations": "الاستشارات",
  "/services/contracts": "العقود",
  "/services/legal-representation": "التمثيل القضائي",
  "/services/notary": "التوثيق",
  "/services/tracking": "التعقيب",
  "/services/arbitration": "التحكيم",
  "/services/creators": "صنّاع المحتوى",
  "/erp": "نظامي ERP",
  "/erp/library": "المكتبة القانونية",
  "/ai": "نظامي AI",
  "/pricing": "الاشتراكات",
  "/pro/marketplace": "سوق المهنيين",
  "/join": "انضم كمحامي",
  "/laws": "الأنظمة واللوائح",
  "/precedents": "السوابق القضائية",
  "/community": "المجتمع",
  "/blog": "المدونة القانونية",
  "/login": "تسجيل الدخول",
  "/register": "إنشاء حساب",
  "/about": "من نحن",
  "/contact": "تواصل معنا",
  "/faq": "الأسئلة الشائعة",
  "/terms": "الشروط والأحكام",
  "/privacy": "سياسة الخصوصية",
  "/partners": "الشركاء",
};

export default function ComingSoon({ path }: { path: string }) {
  const pageName = pageNames[path] || path;
  const isKnown = path in pageNames;

  return (
    <section className="flex min-h-[100dvh] items-center justify-center px-4 pt-24 pb-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 20 }}
        className="max-w-lg text-center"
      >
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-[1.5rem] bg-gold/10"
        >
          <HardHat size={40} weight="duotone" className="text-gold-dark" />
        </motion.div>

        {isKnown ? (
          <>
            <h1 className="font-brand text-3xl font-bold text-royal md:text-4xl">
              {pageName}
            </h1>
            <p className="mt-4 text-base text-ink-muted">
              هذه الصفحة قيد الإنشاء وستكون متاحة قريباً. نعمل على تجهيزها لتقديم أفضل تجربة لك.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-brand text-3xl font-bold text-royal md:text-4xl">
              الصفحة غير موجودة
            </h1>
            <p className="mt-4 text-base text-ink-muted">
              عذراً، الرابط الذي تبحث عنه غير موجود. تأكد من صحة العنوان أو عُد للصفحة الرئيسية.
            </p>
          </>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <motion.a
            href="/"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-2 rounded-xl bg-royal px-6 py-3 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)]"
          >
            <House size={16} weight="bold" />
            الصفحة الرئيسية
          </motion.a>
          <motion.button
            onClick={() => window.history.back()}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-ink-muted"
          >
            <ArrowRight size={16} weight="bold" />
            رجوع
          </motion.button>
        </div>

        {isKnown && (
          <div className="mt-12 rounded-2xl border border-slate-200/50 bg-white p-6">
            <div className="mb-3 text-xs font-medium text-ink-faint">مسار الصفحة</div>
            <code className="rounded-lg bg-surface px-3 py-1.5 font-mono text-sm text-royal">
              {path}
            </code>
          </div>
        )}
      </motion.div>
    </section>
  );
}

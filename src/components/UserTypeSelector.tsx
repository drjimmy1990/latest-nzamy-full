"use client";

import { motion } from "framer-motion";
import { User, Buildings, Bank, Handshake, Scales, ArrowLeft } from "@phosphor-icons/react";
import { useTheme } from "./ThemeProvider";

const userTypes = [
  {
    icon: User,
    labelAr: "فرد",
    labelEn: "Individual",
    descAr: "استشارات، عقود، تمثيل قضائي",
    descEn: "Consultations, contracts, litigation",
    href: "/register/client",
    gradient: "from-royal/5 to-royal/10",
    iconBg: "bg-royal/10 text-royal",
  },
  {
    icon: Buildings,
    labelAr: "شركة / مؤسسة",
    labelEn: "Business / Enterprise",
    descAr: "إدارة مخاطر، فريق قانوني، امتثال",
    descEn: "Risk management, legal team, compliance",
    href: "/register/client",
    gradient: "from-gold/5 to-gold/10",
    iconBg: "bg-gold/10 text-gold-dark",
  },
  {
    icon: Bank,
    labelAr: "جهة حكومية",
    labelEn: "Government",
    descAr: "امتثال، منافسات، عقود مشتريات",
    descEn: "Compliance, tenders, procurement contracts",
    href: "/register/client",
    gradient: "from-emerald-50 to-emerald-100/50",
    iconBg: "bg-emerald-100 text-emerald-700",
  },
  {
    icon: Handshake,
    labelAr: "جمعية",
    labelEn: "NGO / Association",
    descAr: "حوكمة، تبرعات، تراخيص",
    descEn: "Governance, donations, licensing",
    href: "/register/client",
    gradient: "from-sky-50 to-sky-100/50",
    iconBg: "bg-sky-100 text-sky-700",
  },
];

export default function UserTypeSelector() {
  const { lang } = useTheme();
  const isAr = lang === "ar";

  return (
    <section id="user-type" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-[1400px] px-4">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
          className="mb-16"
        >
          <span className="text-sm font-medium text-gold-dark">{isAr ? "ابدأ الآن" : "Get Started"}</span>
          <h2 className="font-brand mt-2 text-3xl font-bold tracking-tight text-royal md:text-5xl">
            {isAr ? "أنت..." : "You are..."}
          </h2>
          <p className="mt-4 max-w-[50ch] text-base text-ink-muted">
            {isAr ? "اختر فئتك لتحصل على تجربة مخصصة بالكامل لاحتياجاتك القانونية" : "Choose your category for a fully customized experience tailored to your legal needs"}
          </p>
        </motion.div>

        {/* Cards grid - asymmetric 2-col zigzag per taste-skill Rule 5 */}
        <div className="grid gap-4 md:grid-cols-2 lg:gap-6">
          {userTypes.map((type, i) => (
            <motion.a
              key={isAr ? type.labelAr : type.labelEn}
              href={type.href}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                type: "spring",
                stiffness: 100,
                damping: 20,
                delay: i * 0.1,
              }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98, y: -1 }}
              className={`group relative overflow-hidden rounded-[2rem] border border-slate-200/50 bg-gradient-to-bl ${type.gradient} p-8 transition-shadow hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.07)] md:p-10`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl ${type.iconBg}`}>
                    <type.icon size={28} weight="duotone" />
                  </span>
                  <h3 className="font-brand mt-5 text-xl font-bold text-ink md:text-2xl">
                    {isAr ? type.labelAr : type.labelEn}
                  </h3>
                  <p className="mt-2 text-sm text-ink-muted">{isAr ? type.descAr : type.descEn}</p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-ink-faint transition-all group-hover:border-royal/20 group-hover:bg-royal group-hover:text-white dark:border-white/10 dark:bg-dark-card">
                  <ArrowLeft size={16} weight="bold" />
                </span>
              </div>
            </motion.a>
          ))}
        </div>

        {/* Provider CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5, type: "spring", stiffness: 100, damping: 20 }}
          className="mt-8 rounded-[2rem] border border-royal/10 bg-royal/[0.03] p-8 md:p-10"
        >
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div className="flex items-center gap-5">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-royal/10 text-royal">
                <Scales size={28} weight="duotone" />
              </span>
              <div>
                <h3 className="font-brand text-lg font-bold text-royal md:text-xl">
                  {isAr ? "أنت محامي أو مقدم خدمة؟" : "Are you a lawyer or service provider?"}
                </h3>
                <p className="mt-1 text-sm text-ink-muted">
                  {isAr ? "انضم لنظامي برو — أدواتك لإدارة مكتبك، مش منافسك" : "Join Nezamy Pro \u2014 tools to manage your firm, not your competitor"}
                </p>
              </div>
            </div>
            <motion.a
              href="/join"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center gap-2 rounded-xl bg-royal px-6 py-3 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)]"
            >
              {isAr ? "انضم لنظامي برو" : "Join Nezamy Pro"}
              <ArrowLeft size={16} weight="bold" />
            </motion.a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

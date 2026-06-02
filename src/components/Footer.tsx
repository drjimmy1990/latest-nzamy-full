"use client";

import { motion } from "framer-motion";
import { Scales, ArrowLeft } from "@phosphor-icons/react";
import { useTheme } from "./ThemeProvider";
import { useUser } from "@/hooks/useUser";

const footerLinksAr = {
  "عن المنصة": [
    { label: "من نحن", href: "/about" },
    { label: "انضم كمحامي", href: "/join" },
    { label: "كن شريكاً", href: "/partners" },
  ],
  "روابط هامة": [
    { label: "تواصل معنا", href: "/contact" },
    { label: "الأسئلة الشائعة", href: "/faq" },
    { label: "الشروط والأحكام", href: "/terms" },
    { label: "سياسة الخصوصية", href: "/privacy" },
    { label: "إخلاء مسؤولية AI", href: "/ai-disclaimer" },
  ],
  "خدمات المنصة": [
    { label: "الاستشارات", href: "/services/consultations" },
    { label: "العقود", href: "/services/contracts" },
    { label: "التمثيل القضائي", href: "/services/legal-representation" },
    { label: "التوثيق", href: "/services/notary" },
    { label: "التعقيب", href: "/services/tracking" },
    { label: "التحكيم", href: "/services/arbitration" },
    { label: "صنّاع المحتوى", href: "/services/creators" },
  ],
  "للمحامين": [
    { label: "نظامي ERP", href: "/erp" },
    { label: "المكتبة القانونية", href: "/erp/library" },
    { label: "نظامي AI MAX", href: "/ai#max" },
    { label: "سوق المهنيين", href: "/pro/marketplace" },
  ],
};

const footerLinksEn = {
  "About the Platform": [
    { label: "About Us", href: "/about" },
    { label: "Join as a Lawyer", href: "/join" },
    { label: "Become a Partner", href: "/partners" },
  ],
  "Important Links": [
    { label: "Contact Us", href: "/contact" },
    { label: "FAQ", href: "/faq" },
    { label: "Terms & Conditions", href: "/terms" },
    { label: "Privacy Policy", href: "/privacy" },
    { label: "AI Disclaimer", href: "/ai-disclaimer" },
  ],
  "Platform Services": [
    { label: "Consultations", href: "/services/consultations" },
    { label: "Contracts", href: "/services/contracts" },
    { label: "Legal Representation", href: "/services/legal-representation" },
    { label: "Notarization", href: "/services/notary" },
    { label: "Follow-up Services", href: "/services/tracking" },
    { label: "Arbitration", href: "/services/arbitration" },
    { label: "Content Creators", href: "/services/creators" },
  ],
  "For Lawyers": [
    { label: "Nezamy ERP", href: "/erp" },
    { label: "Legal Library", href: "/erp/library" },
    { label: "Nezamy AI MAX", href: "/ai#max" },
    { label: "Professional Marketplace", href: "/pro/marketplace" },
  ],
};

export default function Footer() {
  const { lang } = useTheme();
  const { isLoggedIn } = useUser();
  const isAr = lang === "ar";
  const footerLinks = isAr ? footerLinksAr : footerLinksEn;

  return (
    <footer className="relative border-t border-slate-100 bg-white pt-16 pb-8 dark:border-white/10 dark:bg-dark-bg">
      <div className="mx-auto max-w-[1400px] px-4">
        {/* CTA Banner (Hidden for logged in users) */}
        {!isLoggedIn && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="-mt-32 mb-16 rounded-[2.5rem] bg-royal p-10 shadow-[0_20px_60px_-15px_rgba(11,61,46,0.4)] md:p-14"
          >
            <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
              <div>
                <h2 className="font-brand text-2xl font-bold text-white md:text-3xl">
                  {isAr ? "جاهز تبدأ رحلتك القانونية الذكية؟" : "Ready to start your smart legal journey?"}
                </h2>
                <p className="mt-2 max-w-[45ch] text-sm text-white/70">
                  {isAr ? "سجّل مجاناً الآن واحصل على أول استشارة AI بدون رسوم" : "Sign up free now and get your first AI consultation at no cost"}
                </p>
              </div>
              <motion.a
                href="/register"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-sm font-bold text-royal shadow-[0_4px_16px_-4px_rgba(0,0,0,0.15)]"
              >
                {isAr ? "سجّل مجاناً" : "Sign Up Free"}
                <ArrowLeft size={16} weight="bold" />
              </motion.a>
            </div>
          </motion.div>
        )}

        {/* Links grid */}
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:gap-12">
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="font-brand mb-4 text-sm font-bold text-ink">{category}</h3>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-ink-muted transition-colors hover:text-royal"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-100 pt-8 md:flex-row dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-royal text-white">
              <Scales weight="bold" size={16} />
            </div>
            <span className="font-brand text-sm font-bold text-royal">{isAr ? "نظامي" : "Nezamy"}</span>
            <span className="text-xs text-ink-faint">nezamy.online</span>
          </div>
          <p className="text-xs text-ink-faint">
            {isAr
              ? `جميع الحقوق محفوظة لشركة نظامي للتقنية القانونية ${new Date().getFullYear()}`
              : `All rights reserved. Nezamy Legal Tech ${new Date().getFullYear()}`}
          </p>
        </div>
      </div>
    </footer>
  );
}

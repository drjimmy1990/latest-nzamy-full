"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ChatCircle, FileText, Gavel, ShieldStar, Robot,
  VideoCamera, Users, ArrowLeft, ChatsCircle, Scan,
  PencilSimple, Scales, Stamp, Translate, Receipt,
  CheckCircle, Clock, Warning,
  Sparkle, Buildings, MagnifyingGlass, Envelope,
} from "@phosphor-icons/react";
import {
  formatClientServicePrice,
  getClientServiceCategories,
  getClientServicesByCategory,
} from "@/lib/pricingRepository";
import { useClientPricingCatalog } from "@/hooks/useClientPricingCatalog";
import type { ClientServiceCatalogItem } from "@/constants/clientServiceCatalog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubService {
  id: string;
  label: string;
  desc: string;
  price: string;
  priceNote?: string;
  icon: React.ElementType;
  href?: string;
  tag?: string;
  aiPowered?: boolean;
  humanService?: boolean;
  comingSoon?: boolean;
}

interface ServiceCategory {
  id: string;
  icon: React.ElementType;
  label: string;
  desc: string;
  color: string;
  bgLight: string;
  borderColor: string;
  services: SubService[];
  betaOnly?: boolean; // إذا true = مخفي في البيتا
}

// ─── Service Taxonomy (Admin Pricing seed) ───────────────────────────────────

const IS_CLIENT_BETA = false; // Turned off to show all comprehensive services

const ICON_MAP: Record<string, React.ElementType> = {
  ChatCircle,
  FileText,
  Gavel,
  ShieldStar,
  Robot,
  VideoCamera,
  Users,
  ChatsCircle,
  Scan,
  PencilSimple,
  Scales,
  Stamp,
  Translate,
  Receipt,
  CheckCircle,
  Buildings,
  MagnifyingGlass,
  Envelope,
};

function buildCategories(catalog: ClientServiceCatalogItem[]): ServiceCategory[] {
  return getClientServiceCategories({ includeBeta: true })
    .map((cat) => ({
      id: cat.categoryId,
      icon: ICON_MAP[cat.icon] ?? ShieldStar,
      label: cat.label,
      desc: cat.description,
      color: cat.color,
      bgLight: cat.bgLight,
      borderColor: cat.borderColor,
      betaOnly: false, // We show everything now
      services: getClientServicesByCategory(cat.categoryId, catalog)
        .filter((service) => service.enabled !== false)
        .filter((service) => !IS_CLIENT_BETA || service.betaVisibility === "public")
        .map((service) => ({
          id: service.serviceId,
          label: service.label,
          desc: service.description,
          price: formatClientServicePrice(service),
          priceNote: service.priceNote,
          icon: ICON_MAP[service.icon] ?? ShieldStar,
          href: service.route,
          tag: service.tag,
          aiPowered: service.aiPowered,
          humanService: service.humanService,
        })),
    }))
    .filter((cat) => cat.services.length > 0);
}

// ─── Category Card ─────────────────────────────────────────────────────────────

function CategoryCard({ cat, selected, onClick }: {
  cat: ServiceCategory;
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = cat.icon;
  return (
    <motion.button
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`w-full text-right p-5 rounded-2xl border-2 transition-all duration-200 ${
        selected
          ? `bg-gradient-to-br ${cat.color} text-white border-transparent shadow-lg`
          : `${cat.bgLight} ${cat.borderColor} hover:shadow-md`
      }`}
    >
      <div className="flex items-start gap-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
          selected ? "bg-white/20" : "bg-white dark:bg-white/10 shadow-sm"
        }`}>
          <Icon size={22} weight="duotone" className={selected ? "text-white" : "text-[#0B3D2E] dark:text-emerald-400"} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-black text-base leading-tight ${selected ? "text-white" : "text-gray-900 dark:text-white"}`}>
            {cat.label}
          </p>
          <p className={`text-xs mt-1 leading-relaxed ${selected ? "text-white/80" : "text-gray-500 dark:text-gray-400"}`}>
            {cat.desc}
          </p>
          <p className={`text-[11px] mt-2 font-bold ${selected ? "text-white/70" : "text-gray-400 dark:text-gray-500"}`}>
            {cat.services.length} خدمات متاحة
          </p>
        </div>
        <ArrowLeft
          size={16}
          className={`flex-shrink-0 mt-1 transition-transform ${
            selected ? "text-white rotate-180" : "text-gray-300 dark:text-white/20"
          }`}
        />
      </div>
    </motion.button>
  );
}

// ─── Sub-Service Card ──────────────────────────────────────────────────────────

function SubServiceCard({ svc }: { svc: SubService }) {
  const Icon = svc.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-100 dark:border-white/8 p-5 hover:shadow-md transition-all group"
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          svc.aiPowered
            ? "bg-emerald-50 dark:bg-emerald-900/20"
            : "bg-gray-50 dark:bg-white/5"
        }`}>
          <Icon size={20} weight="duotone" className={
            svc.aiPowered ? "text-[#0B3D2E] dark:text-emerald-400" : "text-gray-500 dark:text-gray-400"
          } />
        </div>

        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-bold text-sm text-gray-900 dark:text-white">
              {svc.label}
            </span>
            {svc.tag && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#C8A762]/15 text-[#C8A762]">
                {svc.tag}
              </span>
            )}
            {svc.aiPowered && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
                <Sparkle size={9} weight="fill" /> AI
              </span>
            )}
            {svc.humanService && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                <Users size={9} weight="fill" /> محامٍ متخصص
              </span>
            )}
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-3">
            {svc.desc}
          </p>

          {/* Price + CTA */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-sm font-black text-[#0B3D2E] dark:text-emerald-400">
                {svc.price}
              </span>
              {svc.priceNote && (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                  {svc.priceNote}
                </p>
              )}
            </div>

            {svc.comingSoon ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-white/5">
                <Clock size={12} />
                قريباً
              </span>
            ) : svc.href ? (
              <Link href={svc.href}>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#0B3D2E] text-white text-xs font-bold rounded-xl hover:bg-[#0a3328] transition-colors shadow-sm"
                >
                  ابدأ الآن
                  <ArrowLeft size={12} />
                </motion.button>
              </Link>
            ) : (
              <button className="flex items-center gap-1.5 px-4 py-2 bg-[#0B3D2E] text-white text-xs font-bold rounded-xl hover:bg-[#0a3328] transition-colors shadow-sm">
                اطلب الآن
                <ArrowLeft size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function RequestServicePage() {
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const { catalog } = useClientPricingCatalog();

  const visibleCategories = useMemo(() => buildCategories(catalog), [catalog]);

  return (
    <div className="max-w-5xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-black text-gray-900 dark:text-white mb-1">
          اطلب خدمة قانونية
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          اختر الفئة المناسبة ثم حدد الخدمة التي تحتاجها — معظمها متاح فوراً
        </p>
      </div>

      {/* Pricing note */}
      <div className="flex items-start gap-2.5 mb-6 px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/30">
        <Warning size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
          <strong>تنبيه حول الأسعار:</strong> الأسعار المعروضة تقديرية. كل محامٍ يحدد سعره الخاص ويظهر في ملفه الشخصي. خدمات الذكاء الاصطناعي قد تكون مشمولة في باقتك.
        </p>
      </div>

      <div className="space-y-4 max-w-4xl">
        {visibleCategories.map((cat) => (
          <div key={cat.id} className="flex flex-col">
            <CategoryCard
              cat={cat}
              selected={selectedCat === cat.id}
              onClick={() => setSelectedCat(selectedCat === cat.id ? null : cat.id)}
            />
            
            <AnimatePresence>
              {selectedCat === cat.id && (
                <motion.div
                  initial={{ opacity: 0, height: 0, scale: 0.98 }}
                  animate={{ opacity: 1, height: "auto", scale: 1 }}
                  exit={{ opacity: 0, height: 0, scale: 0.98 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="overflow-hidden pr-4 lg:pr-12"
                >
                  <div className="space-y-3 pt-4 pb-2">
                    {cat.services.map((svc, i) => (
                      <motion.div
                        key={svc.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 }}
                      >
                        <SubServiceCard svc={svc} />
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}

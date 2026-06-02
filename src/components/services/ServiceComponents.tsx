import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CurrencyDollar, Clock, CaretDown } from "@phosphor-icons/react";
import { type services } from "@/constants/servicesData";

type ServiceType = typeof services.ar[0];

export function ServiceCard({
  service,
  index,
  isSelected,
  onSelect,
}: {
  service: ServiceType;
  index: number;
  isAr: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const Icon = service.icon;
  return (
    <motion.button
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08, type: "spring", stiffness: 100, damping: 20 }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      className={`group relative w-full overflow-hidden rounded-[2rem] border p-6 text-start transition-all md:p-8 ${
        isSelected
          ? "border-royal/30 bg-royal text-white shadow-[0_20px_40px_-10px_rgba(11,61,46,0.3)]"
          : `border-slate-200/50 bg-white dark:border-white/10 dark:bg-dark-card ${service.borderHover} hover:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.08)]`
      }`}
    >
      {isSelected && (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(200,167,98,0.15),transparent_60%)]" />
      )}
      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${isSelected ? "bg-white/10" : service.color}`}>
            <Icon size={24} weight="duotone" />
          </span>
          {service.badge && (
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${isSelected ? "bg-white/20 text-white" : "bg-gold/10 text-gold-dark"}`}>
              {service.badge}
            </span>
          )}
        </div>
        <h3 className={`font-brand mt-4 text-lg font-bold ${isSelected ? "text-white" : "text-ink dark:text-gray-100"}`}>
          {service.label}
        </h3>
        <p className={`mt-1 text-xs font-medium ${isSelected ? "text-white/70" : "text-gold-dark"}`}>
          {service.tagline}
        </p>
        <p className={`mt-3 text-sm leading-relaxed ${isSelected ? "text-white/80" : "text-ink-muted dark:text-gray-400"}`}>
          {service.desc}
        </p>
        <div className={`mt-4 flex items-center gap-4 text-xs ${isSelected ? "text-white/60" : "text-ink-faint dark:text-gray-500"}`}>
          <span className="flex items-center gap-1">
            <CurrencyDollar size={14} />
            {service.price}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={14} />
            {service.duration}
          </span>
        </div>
      </div>
    </motion.button>
  );
}

export function FAQItem({ q, a, index }: { q: string; a: string; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08 }}
      className="overflow-hidden rounded-2xl border border-slate-200/50 bg-white dark:border-white/10 dark:bg-dark-card"
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-start"
      >
        <span className="text-sm font-semibold text-ink dark:text-gray-100">{q}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <CaretDown size={16} className="shrink-0 text-ink-faint dark:text-gray-500" />
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <p className="border-t border-slate-100 px-6 pb-5 pt-4 text-sm leading-relaxed text-ink-muted dark:border-white/10 dark:text-gray-400">
              {a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

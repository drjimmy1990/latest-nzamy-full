"use client";

import React from "react";
import { motion } from "framer-motion";
import { CellValue } from "./PricingShared";
import type { Plan, ComparisonCategory } from "@/constants/pricingData";

interface PricingComparisonProps {
  planList: Plan[];
  comparisonList: ComparisonCategory[];
  isAr: boolean;
}

export function PricingComparison({ planList, comparisonList, isAr }: PricingComparisonProps) {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-[1200px] px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="mb-12 text-center"
        >
          <span className="text-sm font-medium text-gold-dark">{isAr ? "مقارنة الميزات" : "Feature Comparison"}</span>
          <h2 className="font-brand mt-2 text-3xl font-bold text-royal dark:text-white md:text-4xl">
            {isAr ? "قارن بين الباقات" : "Compare Plans"}
          </h2>
        </motion.div>

        <div className="overflow-x-auto rounded-[2rem] border border-slate-200/50 dark:border-white/10">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 dark:border-white/10 dark:bg-dark-card">
                <th className="px-6 py-4 text-start text-sm font-semibold text-ink dark:text-gray-100 w-[40%]">
                  {isAr ? "الميزة" : "Feature"}
                </th>
                {planList.map(plan => (
                  <th key={plan.id} className="px-4 py-4 text-center text-sm font-semibold">
                    <span className={plan.highlighted ? "text-royal dark:text-gold" : "text-ink dark:text-gray-100"}>{plan.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparisonList.map((cat, ci) => {
                const Icon = cat.icon;
                return (
                  <React.Fragment key={ci}>
                    <tr className="border-b border-slate-100 bg-royal/[0.02] dark:border-white/10 dark:bg-royal/5">
                      <td colSpan={planList.length + 1} className="px-6 py-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-royal dark:text-gold">
                          <Icon size={14} weight="duotone" />{cat.category}
                        </div>
                      </td>
                    </tr>
                    {cat.rows.map((row, ri) => (
                      <tr key={`row-${ci}-${ri}`}
                        className="border-b border-slate-100/50 last:border-0 dark:border-white/5 hover:bg-slate-50/50 dark:hover:bg-white/[0.02]"
                      >
                        <td className="px-6 py-3.5 text-sm text-ink-muted dark:text-gray-400">{row.feature}</td>
                        {planList.map(plan => (
                          <td key={plan.id} className={`px-4 py-3.5 text-center ${plan.highlighted ? "bg-royal/[0.02] dark:bg-royal/5" : ""}`}>
                            <CellValue value={(row as any)[plan.id]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

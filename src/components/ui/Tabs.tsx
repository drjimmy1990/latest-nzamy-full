"use client";
import { motion } from "framer-motion";
import { useState, type ReactNode } from "react";

interface Tab {
  id: string;
  label: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  isDark?: boolean;
  onChange?: (id: string) => void;
  children: (activeTab: string) => ReactNode;
}

export default function Tabs({
  tabs,
  defaultTab,
  isDark = false,
  onChange,
  children,
}: TabsProps) {
  const [activeTab, setActiveTab] = useState<string>(
    defaultTab ?? tabs[0]?.id ?? ""
  );

  function handleSelect(id: string) {
    setActiveTab(id);
    onChange?.(id);
  }

  return (
    <div>
      {/* Tab bar */}
      <div
        className={[
          "flex gap-1 p-1 rounded-2xl",
          isDark
            ? "bg-white/5 border border-white/10"
            : "bg-gray-100 dark:bg-white/5 border border-transparent dark:border-white/10",
        ].join(" ")}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleSelect(tab.id)}
              className={[
                "relative flex-1 px-4 py-2 text-sm font-semibold rounded-xl transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-royal dark:focus-visible:ring-gold",
                isActive
                  ? isDark
                    ? "text-[#072a1f] font-bold"
                    : "text-white dark:text-[#072a1f] font-bold"
                  : isDark
                  ? "text-gray-400 hover:text-white"
                  : "text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white",
              ].join(" ")}
            >
              {isActive && (
                <motion.span
                  layoutId="tab-indicator"
                  className={
                    isDark
                      ? "absolute inset-0 bg-[#C8A762] rounded-xl shadow-sm"
                      : "absolute inset-0 bg-[#0B3D2E] dark:bg-[#C8A762] rounded-xl shadow-sm"
                  }
                  style={{ zIndex: 0 }}
                  transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                />
              )}
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="mt-4">{children(activeTab)}</div>
    </div>
  );
}

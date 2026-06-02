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
          isDark ? "bg-white/5" : "bg-gray-100",
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
                "relative flex-1 px-4 py-2 text-sm font-semibold rounded-xl transition-colors focus:outline-none",
                isActive
                  ? "text-white"
                  : isDark
                  ? "text-gray-400 hover:text-white"
                  : "text-gray-500 hover:text-gray-800",
              ].join(" ")}
            >
              {isActive && (
                <motion.span
                  layoutId="tab-indicator"
                  className="absolute inset-0 bg-[#0B3D2E] rounded-xl"
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

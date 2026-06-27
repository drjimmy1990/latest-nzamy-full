"use client";

import LibraryTab from "../../tabs/LibraryTab";
import { BookOpen } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

export default function AdminLawsPage() {
  const { isDark } = useTheme();
  const muted = isDark ? "text-gray-400" : "text-gray-500";

  return (
    <div className="p-6 md:p-10 space-y-6 max-w-[1600px] mx-auto pb-32" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-xl ${isDark ? "bg-[#0B3D2E]/20 text-[#C8A762]" : "bg-[#0B3D2E]/5 text-[#0B3D2E]"}`}>
              <BookOpen size={24} weight="duotone" />
            </div>
            <h1 className={`text-3xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>المكتبة القانونية</h1>
          </div>
          <p className={`text-sm ${muted}`}>إدارة وتصفح السجلات والأنظمة والتعاميم والكتب الفقهية المربوطة بقاعدة البيانات.</p>
        </div>
      </div>

      <LibraryTab />
    </div>
  );
}

"use client";

import { motion } from "framer-motion";
import { UsersThree, LockKey, FolderOpen, ChatsCircle, FileText, CaretRight } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

export default function SharedRoomsPage() {
  const { isDark, lang } = useTheme();
  const isAr = lang === "ar";
  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-slate-100 rounded-2xl shadow-sm";

  return (
    <div className="max-w-[1100px] mx-auto space-y-6" dir={isAr ? "rtl" : "ltr"}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-between items-end">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
            {isAr ? "الغرف المشتركة (Shared Rooms)" : "Shared Rooms"}
          </h1>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {isAr ? "غرف عمل آمنة ومغلقة للتعاون مع مكاتب محاماة أخرى في القضايا المشتركة." : "Secure workspaces for cross-firm collaboration on joint cases."}
          </p>
        </div>
        <button className="px-5 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-sm font-bold flex items-center gap-2">
          <UsersThree size={18} /> {isAr ? "إنشاء غرفة مشتركة" : "Create Room"}
        </button>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {[
          { title: "اندماج البنك الأول — غرفة العناية الواجبة", firm: "مكتب التميمي وشركاه", status: "نشط", members: 8, files: 124 },
          { title: "قضية الاحتكار — لجنة المنافسة", firm: "شركة الدوسري للمحاماة", status: "مؤرشف", members: 4, files: 15 },
        ].map((room, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className={`${card} p-5 hover:border-royal/50 transition-colors cursor-pointer`}>
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isDark ? "bg-white/[0.05]" : "bg-slate-50"}`}>
                  <LockKey size={24} className="text-royal" weight="duotone" />
                </div>
                <div>
                  <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-800"}`}>{room.title}</h3>
                  <p className={`text-xs mt-0.5 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{isAr ? "شراكة مع:" : "Partnered with:"} {room.firm}</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4 py-3 border-t border-b border-dashed border-zinc-500/20 mb-4">
              <div className="flex items-center gap-1.5 text-xs">
                <UsersThree size={16} className={isDark ? "text-zinc-400" : "text-slate-400"} />
                <span className={isDark ? "text-zinc-300" : "text-slate-600"}>{room.members} {isAr ? "أعضاء" : "Members"}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <FileText size={16} className={isDark ? "text-zinc-400" : "text-slate-400"} />
                <span className={isDark ? "text-zinc-300" : "text-slate-600"}>{room.files} {isAr ? "ملف" : "Files"}</span>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${room.status === "نشط" ? "bg-emerald-500/10 text-emerald-500" : "bg-zinc-500/10 text-zinc-500"}`}>
                {room.status}
              </span>
              <span className="text-xs font-bold text-royal flex items-center gap-1">
                {isAr ? "دخول الغرفة" : "Enter Room"} <CaretRight size={12} className={isAr ? "rotate-180" : ""} />
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

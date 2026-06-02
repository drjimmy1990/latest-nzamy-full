import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CONTRACT_TYPES, CONTRACT_GROUPS } from "@/components/contracts/constants";
import { CaretDown, CaretUp, MagnifyingGlass, CheckCircle } from "@phosphor-icons/react";

interface StepDomainProps {
  isDark: boolean;
  contractMode: "draft" | "review" | null;
  setContractMode: (mode: "draft" | "review" | null) => void;
  contractType: string;
  setContractType: (type: string) => void;
  contractLanguage: "ar" | "en" | "ar_en" | "custom";
  setContractLanguage: (lang: "ar" | "en" | "ar_en" | "custom") => void;
  customLanguageName: string;
  setCustomLanguageName: (name: string) => void;
  customLanguageLayout: "single" | "dual";
  setCustomLanguageLayout: (layout: "single" | "dual") => void;
  customLanguageBase: "ar" | "en";
  setCustomLanguageBase: (base: "ar" | "en") => void;
}

// ─── Group contracts by their group key ──────────────────────────────────────
const GROUPED = Object.entries(CONTRACT_GROUPS).map(([groupKey, groupMeta]) => ({
  key: groupKey,
  ...groupMeta,
  types: CONTRACT_TYPES.filter(ct => ct.group === groupKey),
})).filter(g => g.types.length > 0);

export function StepDomain({
  isDark,
  contractMode,
  contractType,
  setContractType,
  contractLanguage,
  setContractLanguage,
  customLanguageName,
  setCustomLanguageName,
  customLanguageLayout,
  setCustomLanguageLayout,
  customLanguageBase,
  setCustomLanguageBase,
}: StepDomainProps) {
  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ core: true });

  const toggleGroup = (key: string) =>
    setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));

  const searchFilter = (ct: typeof CONTRACT_TYPES[0]) =>
    !search || ct.title.includes(search) || ct.desc.includes(search);

  // Flat search results
  const searchResults = search ? CONTRACT_TYPES.filter(searchFilter) : [];
  const selectedInfo = CONTRACT_TYPES.find(ct => ct.id === contractType);

  const btnBase = (selected: boolean) =>
    `rounded-xl border p-3 text-start transition-all text-right ${
      selected
        ? isDark
          ? "border-[#0B3D2E]/50 bg-[#0B3D2E]/15 shadow-sm ring-1 ring-[#0B3D2E]/30"
          : "border-[#0B3D2E]/50 bg-[#0B3D2E]/8 shadow-sm ring-1 ring-[#0B3D2E]/20"
        : isDark
        ? "border-white/[0.07] hover:border-white/[0.15] hover:bg-white/[0.02]"
        : "border-zinc-200/70 hover:border-zinc-300 hover:bg-slate-50"
    }`;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

      {/* Mode reminder chip */}
      <div className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[12px] font-semibold w-fit ${
        contractMode === "draft"
          ? isDark ? "bg-[#0B3D2E]/30 text-emerald-300 border border-[#0B3D2E]/40" : "bg-[#0B3D2E]/8 text-[#0B3D2E] border border-[#0B3D2E]/20"
          : isDark ? "bg-[#C8A762]/15 text-[#C8A762] border border-[#C8A762]/30" : "bg-amber-50 text-amber-700 border border-amber-200"
      }`}>
        <span className="text-lg">{contractMode === "draft" ? "✍️" : "🔍"}</span>
        {contractMode === "draft" ? "صياغة عقد جديد" : "مراجعة عقد موجود"} — اختر نوع العقد أدناه
      </div>

      {/* Language Selector */}
      {contractMode === "draft" && (
        <div className={`flex flex-col gap-3 px-4 py-3.5 rounded-2xl border ${
          isDark ? "border-white/[0.08] bg-zinc-800/40" : "border-zinc-200 bg-white shadow-sm"
        }`}>
          <p className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
            🌐 لغة العقد المطلوبة
          </p>
          <div className={`flex gap-2 p-1 rounded-xl ${isDark ? "bg-zinc-900/50" : "bg-zinc-100"}`}>
            {[
              { id: "ar", label: "عربي فقط" },
              { id: "en", label: "ENGLISH فقط" },
              { id: "ar_en", label: "عربي / ENGLISH" },
              { id: "custom", label: "لغة أخرى / مخصصة 🌐" },
            ].map((lang) => (
              <button
                key={lang.id}
                onClick={() => setContractLanguage(lang.id as any)}
                className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all ${
                  contractLanguage === lang.id
                    ? isDark ? "bg-[#0B3D2E] text-white shadow-md" : "bg-white text-[#0B3D2E] shadow-sm border border-zinc-200"
                    : isDark ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>

          {/* Custom Language Options Panel */}
          <AnimatePresence>
            {contractLanguage === "custom" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className={`mt-2 p-4 rounded-xl border space-y-4 ${
                  isDark ? "border-white/[0.06] bg-zinc-900/40" : "border-zinc-200 bg-zinc-50"
                }`}>
                  {/* Language Input */}
                  <div className="space-y-2">
                    <label className={`block text-[11px] font-bold ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                      أدخل اسم اللغة المطلوبة:
                    </label>
                    <input
                      type="text"
                      value={customLanguageName}
                      onChange={(e) => setCustomLanguageName(e.target.value)}
                      placeholder="مثال: الفرنسية، الألمانية، الهندية، الإسبانية..."
                      className={`w-full rounded-xl border px-3 py-2 text-[12px] outline-none transition-all ${
                        isDark
                          ? "border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600 focus:border-[#C8A762]/50"
                          : "border-zinc-300 bg-white text-zinc-800 placeholder:text-zinc-400 focus:border-[#0B3D2E]/50"
                      }`}
                    />
                    
                    {/* Suggestion tags */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {[
                        { name: "الفرنسية", flag: "🇫🇷" },
                        { name: "الألمانية", flag: "🇩🇪" },
                        { name: "الهندية", flag: "🇮🇳" },
                        { name: "الإسبانية", flag: "🇪🇸" },
                        { name: "الصينية", flag: "🇨🇳" },
                      ].map((tag) => (
                        <button
                          key={tag.name}
                          onClick={() => setCustomLanguageName(tag.name)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all ${
                            customLanguageName === tag.name
                              ? isDark
                                ? "bg-[#C8A762]/20 text-[#C8A762] border-[#C8A762]/40"
                                : "bg-[#0B3D2E]/10 text-[#0B3D2E] border-[#0B3D2E]/30"
                              : isDark
                              ? "border-white/[0.05] bg-zinc-800/40 text-zinc-400 hover:text-zinc-200"
                              : "border-zinc-200 bg-white text-zinc-500 hover:text-zinc-800"
                          }`}
                        >
                          {tag.flag} {tag.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Layout selector */}
                  <div className="space-y-2">
                    <label className={`block text-[11px] font-bold ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                      حدد شكل الهيكل والتنسيق القانوني للعقد:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Single Layout */}
                      <button
                        onClick={() => setCustomLanguageLayout("single")}
                        className={`flex items-start gap-3 p-3 rounded-xl border text-right transition-all ${
                          customLanguageLayout === "single"
                            ? isDark
                              ? "border-[#0B3D2E]/50 bg-[#0B3D2E]/15 ring-1 ring-[#0B3D2E]/30"
                              : "border-[#0B3D2E]/50 bg-[#0B3D2E]/5 ring-1 ring-[#0B3D2E]/20"
                            : isDark
                            ? "border-white/[0.06] bg-zinc-800/40 hover:bg-zinc-800/60"
                            : "border-zinc-200 bg-white hover:bg-zinc-50"
                        }`}
                      >
                        <span className="text-xl mt-0.5">📄</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                            نسخة أحادية (لغة واحدة فقط)
                          </p>
                          <p className={`text-[10px] leading-relaxed mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                            صياغة كامل بنود العقد باللغة {customLanguageName || "الأجنبية المحددة"} فقط دون لغات أخرى.
                          </p>
                        </div>
                      </button>

                      {/* Dual Column Layout */}
                      <button
                        onClick={() => setCustomLanguageLayout("dual")}
                        className={`flex items-start gap-3 p-3 rounded-xl border text-right transition-all ${
                          customLanguageLayout === "dual"
                            ? isDark
                              ? "border-[#0B3D2E]/50 bg-[#0B3D2E]/15 ring-1 ring-[#0B3D2E]/30"
                              : "border-[#0B3D2E]/50 bg-[#0B3D2E]/5 ring-1 ring-[#0B3D2E]/20"
                            : isDark
                            ? "border-white/[0.06] bg-zinc-800/40 hover:bg-zinc-800/60"
                            : "border-zinc-200 bg-white hover:bg-zinc-50"
                        }`}
                      >
                        <span className="text-xl mt-0.5">📊</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                            نسخة ثنائية متقابلة (عمودين)
                          </p>
                          <p className={`text-[10px] leading-relaxed mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                            تنسيق ثنائي الأعمدة يضع اللغة الأساسية والترجمة باللغة {customLanguageName || "الأجنبية المحددة"} متقابلتين.
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Dual Column Base Language Selector */}
                  {customLanguageLayout === "dual" && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3 rounded-lg border border-dashed flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-black/[0.05]"
                      style={{ borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }}
                    >
                      <span className={`text-[11px] font-medium ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                        الترجمة المرافقة مع اللغة {customLanguageName || "المحددة"}:
                      </span>
                      <div className="flex gap-2">
                        {[
                          { id: "ar", label: "العربية" },
                          { id: "en", label: "الإنجليزية" },
                        ].map((b) => (
                          <button
                            key={b.id}
                            onClick={() => setCustomLanguageBase(b.id as any)}
                            className={`px-3 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                              customLanguageBase === b.id
                                ? isDark
                                  ? "bg-[#C8A762] text-zinc-950 border-[#C8A762]"
                                  : "bg-[#0B3D2E] text-white border-[#0B3D2E]"
                                : isDark
                                ? "border-white/[0.06] bg-zinc-950 text-zinc-400"
                                : "border-zinc-200 bg-white text-zinc-500"
                            }`}
                          >
                            {b.label}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Optional notice */}
      <div className={`flex items-start gap-3 px-4 py-3 rounded-2xl border ${
        isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"
      }`}>
        <span className="text-base flex-shrink-0 mt-0.5">💡</span>
        <div className="flex-1 min-w-0">
          <p className={`text-[12px] font-bold mb-0.5 ${isDark ? "text-[#C8A762]" : "text-amber-700"}`}>
            الاختيار اختياري تماماً
          </p>
          <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-500" : "text-amber-600"}`}>
            تحديد نوع العقد يساعد الذكاء الاصطناعي على اقتراح البنود المناسبة والممارسات القانونية الأفضل.
            يمكنك تخطي هذه الخطوة والمتابعة مباشرةً إن أردت.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${
        isDark ? "border-white/[0.08] bg-zinc-800/60" : "border-zinc-200 bg-zinc-50"
      }`}>
        <MagnifyingGlass size={14} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="بحث في أنواع العقود..."
          className={`flex-1 bg-transparent text-[13px] outline-none ${
            isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-zinc-800 placeholder:text-zinc-400"
          }`}
        />
        {search && (
          <button onClick={() => setSearch("")} className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>✕</button>
        )}
      </div>

      {/* Search results */}
      {search && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {searchResults.length === 0 ? (
            <p className={`col-span-3 text-center text-[12px] py-6 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
              لا توجد نتائج لـ &quot;{search}&quot;
            </p>
          ) : searchResults.map((ct, i) => (
            <motion.button key={ct.id}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              onClick={() => setContractType(contractType === ct.id ? "" : ct.id)}
              className={btnBase(contractType === ct.id)}
            >
              <p className={`text-[12px] font-semibold mb-0.5 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{ct.title}</p>
              <p className={`text-[10px] leading-snug ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{ct.desc}</p>
              <p className={`text-[9px] mt-1 font-bold ${CONTRACT_GROUPS[ct.group]?.color ?? "text-slate-400"}`}>
                {CONTRACT_GROUPS[ct.group]?.emoji} {CONTRACT_GROUPS[ct.group]?.label}
              </p>
            </motion.button>
          ))}
        </div>
      )}

      {/* Selected badge */}
      {contractType && !search && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[12px] ${
          isDark ? "border-emerald-500/30 bg-emerald-500/8 text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-700"
        }`}>
          <CheckCircle size={14} weight="fill" />
          <span className="font-semibold">{selectedInfo?.title}</span>
          <span className={isDark ? "text-emerald-600" : "text-emerald-500"}>— {selectedInfo?.desc}</span>
        </div>
      )}

      {/* Grouped contract types (no search active) */}
      {!search && (
        <div className="space-y-2">
          {GROUPED.map(group => {
            const isOpen = !!openGroups[group.key];
            const hasSelected = group.types.some(ct => ct.id === contractType);
            return (
              <div key={group.key} className={`rounded-2xl border overflow-hidden ${
                isDark ? "border-white/[0.06] bg-zinc-900/40" : "border-zinc-100 bg-zinc-50/80"
              }`}>
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(group.key)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-start transition-colors ${
                    isDark ? "hover:bg-white/[0.03]" : "hover:bg-zinc-100/60"
                  }`}
                >
                  <span className="text-lg">{group.emoji}</span>
                  <span className={`flex-1 text-[13px] font-bold ${group.color}`}>{group.label}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    isDark ? "bg-white/[0.06] text-zinc-500" : "bg-white text-zinc-400 shadow-sm"
                  }`}>{group.types.length}</span>
                  {hasSelected && (
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                      isDark ? "bg-emerald-500/15 text-emerald-400" : "bg-emerald-50 text-emerald-600"
                    }`}>✓ محدد</span>
                  )}
                  {isOpen ? <CaretUp size={12} className={isDark ? "text-zinc-500" : "text-zinc-400"} /> : <CaretDown size={12} className={isDark ? "text-zinc-500" : "text-zinc-400"} />}
                </button>

                {/* Group items */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className={`px-3 pb-3 grid grid-cols-2 sm:grid-cols-3 gap-2`}>
                        {group.types.map((ct, i) => (
                          <motion.button key={ct.id}
                            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                            onClick={() => setContractType(contractType === ct.id ? "" : ct.id)}
                            className={btnBase(contractType === ct.id)}
                          >
                            <p className={`text-[12px] font-semibold mb-0.5 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{ct.title}</p>
                            <p className={`text-[10px] leading-snug ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{ct.desc}</p>
                            {contractType === ct.id && (
                              <span className="mt-1.5 inline-block text-[9px] font-black text-[#0B3D2E] bg-[#0B3D2E]/10 px-1.5 py-0.5 rounded-full">✓ محدد</span>
                            )}
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

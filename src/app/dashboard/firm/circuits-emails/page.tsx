"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Bank, Phone, Envelope, MapPin, Clock, MagnifyingGlass,
  CaretDown, CaretUp, Buildings, Scales, FileText,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types & Data ─────────────────────────────────────────────────────────────

interface CircuitEntry {
  id: string;
  name: string;
  city: string;
  type: "محكمة" | "ديوان مظالم" | "هيئة تحكيم" | "استئناف" | "جهة حكومية";
  departments: {
    name: string;
    phone: string;
    email: string;
    hours: string;
    notes?: string;
  }[];
}

const CIRCUITS: CircuitEntry[] = [
  {
    id: "c1", name: "المحكمة التجارية بالرياض", city: "الرياض", type: "محكمة",
    departments: [
      { name: "دائرة الدعاوى التجارية (عامة)", phone: "011-4085555", email: "commercial.riyadh@moj.gov.sa", hours: "الأحد-الخميس ٧:٣٠–٢:٣٠", notes: "التسجيل من الأحد للثلاثاء فقط" },
      { name: "دائرة العقود والمنازعات التجارية", phone: "011-4085556", email: "contracts.riyadh@moj.gov.sa", hours: "الأحد-الخميس ٧:٣٠–٢:٣٠" },
      { name: "دائرة الأوراق التجارية", phone: "011-4085557", email: "papers.riyadh@moj.gov.sa", hours: "الأحد-الخميس ٧:٣٠–١:٣٠" },
    ],
  },
  {
    id: "c2", name: "المحكمة العمالية بالرياض", city: "الرياض", type: "محكمة",
    departments: [
      { name: "دائرة الطلبات المستعجلة", phone: "011-2054321", email: "labor.urgent.riyadh@moj.gov.sa", hours: "الأحد-الخميس ٧:٣٠–٢:٠٠" },
      { name: "دائرة نزاعات العمل العامة", phone: "011-2054322", email: "labor.riyadh@moj.gov.sa", hours: "الأحد-الخميس ٧:٣٠–٢:٣٠" },
      { name: "مكتب كتابة العدل", phone: "011-2054323", email: "notary.riyadh@moj.gov.sa", hours: "الأحد-الخميس ٧:٣٠–١:٠٠", notes: "التوثيق يتطلب موعداً مسبقاً" },
    ],
  },
  {
    id: "c3", name: "ديوان المظالم بالرياض", city: "الرياض", type: "ديوان مظالم",
    departments: [
      { name: "المحكمة الإدارية (ابتدائي)", phone: "011-4033333", email: "admin.court.riyadh@bab.gov.sa", hours: "الأحد-الخميس ٧:٣٠–٢:٣٠" },
      { name: "محكمة الاستئناف الإداري", phone: "011-4033334", email: "appeal.riyadh@bab.gov.sa", hours: "الأحد-الخميس ٧:٣٠–٢:٠٠" },
      { name: "المحكمة الجزائية الإدارية", phone: "011-4033335", email: "criminal.admin.riyadh@bab.gov.sa", hours: "الأحد-الخميس ٧:٣٠–٢:٣٠" },
    ],
  },
  {
    id: "c4", name: "محكمة الاستئناف التجارية بالرياض", city: "الرياض", type: "استئناف",
    departments: [
      { name: "دائرة الاستئناف التجاري", phone: "011-4085600", email: "appeal.commercial.riyadh@moj.gov.sa", hours: "الأحد-الخميس ٧:٣٠–٢:٠٠" },
    ],
  },
  {
    id: "c5", name: "المحكمة التجارية بجدة", city: "جدة", type: "محكمة",
    departments: [
      { name: "دائرة الدعاوى التجارية العامة", phone: "012-6601234", email: "commercial.jeddah@moj.gov.sa", hours: "الأحد-الخميس ٧:٣٠–٢:٣٠" },
      { name: "دائرة عقود الشركات", phone: "012-6601235", email: "companies.jeddah@moj.gov.sa", hours: "الأحد-الخميس ٧:٣٠–٢:٣٠" },
    ],
  },
  {
    id: "c6", name: "المحكمة العمالية بجدة", city: "جدة", type: "محكمة",
    departments: [
      { name: "دائرة النزاعات العمالية", phone: "012-6501100", email: "labor.jeddah@moj.gov.sa", hours: "الأحد-الخميس ٧:٣٠–٢:٣٠" },
    ],
  },
  {
    id: "c7", name: "هيئة التحكيم التجاري السعودية", city: "الرياض", type: "هيئة تحكيم",
    departments: [
      { name: "مكتب تسجيل طلبات التحكيم", phone: "011-4670001", email: "register@sacc.org.sa", hours: "الأحد-الخميس ٨:٠٠–٤:٠٠" },
      { name: "إدارة الملفات والجلسات", phone: "011-4670002", email: "cases@sacc.org.sa", hours: "الأحد-الخميس ٨:٠٠–٤:٠٠", notes: "الرد الكتروني خلال ٤٨ ساعة" },
    ],
  },
  {
    id: "c8", name: "وزارة الموارد البشرية (تسوية النزاعات)", city: "الرياض", type: "جهة حكومية",
    departments: [
      { name: "مكتب تسوية النزاعات العمالية", phone: "19911", email: "disputes@hrsd.gov.sa", hours: "الأحد-الخميس ٧:٣٠–٢:٣٠", notes: "الخط الساخن متاح ٢٤ساعة" },
    ],
  },
];

const CITY_FILTER = ["الكل", "الرياض", "جدة", "الدمام", "مكة"];
const TYPE_FILTER = ["الكل", "محكمة", "ديوان مظالم", "هيئة تحكيم", "استئناف", "جهة حكومية"];

const TYPE_COLORS: Record<string, string> = {
  "محكمة": "bg-blue-500/10 text-blue-500 border-blue-500/20",
  "ديوان مظالم": "bg-purple-500/10 text-purple-500 border-purple-500/20",
  "هيئة تحكيم": "bg-amber-500/10 text-amber-500 border-amber-500/20",
  "استئناف": "bg-orange-500/10 text-orange-500 border-orange-500/20",
  "جهة حكومية": "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  "محكمة": Scales,
  "ديوان مظالم": Buildings,
  "هيئة تحكيم": FileText,
  "استئناف": Bank,
  "جهة حكومية": Buildings,
};

// ─── Circuit Card ─────────────────────────────────────────────────────────────

function CircuitCard({ circuit, isDark, card }: { circuit: CircuitEntry; isDark: boolean; card: string }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TYPE_ICONS[circuit.type] ?? Buildings;

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`${card} overflow-hidden`}>
      {/* Header */}
      <button onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center justify-between p-5 text-right hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-white/[0.05]" : "bg-slate-50"}`}>
            <Icon size={20} className="text-royal" weight="duotone" />
          </div>
          <div>
            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{circuit.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <MapPin size={11} className={isDark ? "text-zinc-600" : "text-slate-400"} />
              <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{circuit.city}</span>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${TYPE_COLORS[circuit.type]}`}>{circuit.type}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{circuit.departments.length} دائرة</span>
          {expanded ? <CaretUp size={14} className={isDark ? "text-zinc-500" : "text-slate-400"} /> : <CaretDown size={14} className={isDark ? "text-zinc-500" : "text-slate-400"} />}
        </div>
      </button>

      {/* Departments */}
      {expanded && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className={`border-t ${isDark ? "border-white/[0.04]" : "border-slate-100"} divide-y ${isDark ? "divide-white/[0.04]" : "divide-slate-50"}`}>
          {circuit.departments.map((dept, i) => (
            <div key={i} className="p-4 ps-5">
              <p className={`text-[12px] font-bold mb-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{dept.name}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="flex items-center gap-2">
                  <Phone size={12} className="text-emerald-500 shrink-0" />
                  <a href={`tel:${dept.phone}`} className={`text-[11px] font-mono hover:text-emerald-500 transition-colors ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                    {dept.phone}
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <Envelope size={12} className="text-blue-500 shrink-0" />
                  <a href={`mailto:${dept.email}`} className={`text-[11px] break-all hover:text-blue-500 transition-colors ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                    {dept.email}
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={12} className={isDark ? "text-zinc-500 shrink-0" : "text-slate-400 shrink-0"} />
                  <span className={`text-[11px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{dept.hours}</span>
                </div>
              </div>
              {dept.notes && (
                <p className={`mt-2 text-[10px] px-2.5 py-1 rounded-lg border inline-block ${isDark ? "bg-amber-500/8 border-amber-500/15 text-amber-400" : "bg-amber-50 border-amber-100 text-amber-700"}`}>
                  ⚠ {dept.notes}
                </p>
              )}
            </div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CircuitsEmailsPage() {
  const { isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("الكل");
  const [typeFilter, setTypeFilter] = useState("الكل");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const filtered = CIRCUITS.filter(c => {
    const matchSearch = !search || c.name.includes(search) || c.city.includes(search) ||
      c.departments.some(d => d.name.includes(search) || d.email.includes(search));
    const matchCity = cityFilter === "الكل" || c.city === cityFilter;
    const matchType = typeFilter === "الكل" || c.type === typeFilter;
    return matchSearch && matchCity && matchType;
  });

  return (
    <div className="max-w-[1100px] mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className={`text-xl font-bold mb-0.5 flex items-center gap-2 ${isDark ? "text-white" : "text-slate-800"}`}
          style={{ fontFamily: "var(--font-brand)" }}>
          <Bank className="text-royal" weight="duotone" />
          دليل الدوائر القضائية والجهات
        </h1>
        <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          أرقام وإيميلات الدوائر القضائية والهيئات — قابل للبحث والتصفية
        </p>
      </motion.div>

      {/* Search + Filters */}
      <div className={`${card} p-4 space-y-3`}>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${isDark ? "bg-white/[0.04] border-white/[0.06]" : "bg-zinc-50 border-zinc-200"}`}>
          <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو المدينة أو الإيميل..."
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-zinc-500"
            dir="rtl"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <span className={`text-[10px] font-bold self-center ${isDark ? "text-zinc-600" : "text-slate-400"}`}>المدينة:</span>
          {CITY_FILTER.map(c => (
            <button key={c} onClick={() => setCityFilter(c)}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-colors ${cityFilter === c ? "bg-[#0B3D2E] text-white" : isDark ? "bg-zinc-800 text-zinc-400 hover:text-zinc-200" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"}`}>
              {c}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <span className={`text-[10px] font-bold self-center ${isDark ? "text-zinc-600" : "text-slate-400"}`}>النوع:</span>
          {TYPE_FILTER.map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-colors ${typeFilter === t ? "bg-[#0B3D2E] text-white" : isDark ? "bg-zinc-800 text-zinc-400 hover:text-zinc-200" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
        يعرض <strong className={isDark ? "text-zinc-300" : "text-slate-600"}>{filtered.length}</strong> جهة من أصل {CIRCUITS.length}
      </p>

      {/* Results */}
      <div className="space-y-3">
        {filtered.map(c => <CircuitCard key={c.id} circuit={c} isDark={isDark} card={card} />)}
        {filtered.length === 0 && (
          <div className={`${card} p-12 text-center`}>
            <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لا توجد نتائج مطابقة لبحثك.</p>
          </div>
        )}
      </div>
    </div>
  );
}

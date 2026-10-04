"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Handshake, Plus, ShieldCheck, Scales, Gavel, MapPin,
  Clock, CurrencyDollar, ArrowRight, CheckCircle, Warning,
  Buildings, MagnifyingGlass, UserCheck, CaretDown,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

interface Props {
  userType?: "lawyer" | "firm" | "corporate" | "micro";
  initialMode?: "solo" | "collab";
}

const BACK_HREF: Record<NonNullable<Props["userType"]>, string> = {
  lawyer: "/dashboard/lawyer",
  firm: "/dashboard/firm",
  corporate: "/dashboard/business",
  micro: "/dashboard",
};

interface CollabListing {
  id: string;
  title: string;
  city: string;
  court: string;
  category: string;
  budget: number;
  urgency: "urgent" | "normal";
  offersCount: number;
  status: "open" | "matched" | "completed";
  deadline: string;
  description: string;
}

export default function MyMarketplaceDashboard(props: Props) {
  const { isDark } = useTheme();
  const userType = props.userType ?? "lawyer";
  const [activeTab, setActiveTab] = useState<"my-requests" | "incoming-offers" | "browse-open">(
    props.initialMode === "collab" ? "browse-open" : "my-requests"
  );
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Initial collaboration listings (B2B lawyer subcontracting)
  const [listings, setListings] = useState<CollabListing[]>([
    {
      id: "LIST-101",
      title: "إسناد حضور جلسة استئناف تجاري — الدائرة الثالثة",
      city: "جدة",
      court: "محكمة الاستئناف التجارية بجدة",
      category: "ترافع وتمثيل قضائي",
      budget: 1500,
      urgency: "urgent",
      offersCount: 3,
      status: "open",
      deadline: "٢٤ سبتمبر ٢٠٢٦",
      description: "مطلوب محامٍ مرخص بجدة لحضور جلسة استئناف تجاري وتقديم مذكرة الدفاع المحررة مسبقاً وتوثيق المحضر.",
    },
    {
      id: "LIST-102",
      title: "استلام وتوثيق صك حكم تنفيذي ومراجعة محكمة التنفيذ",
      city: "الدمام",
      court: "محكمة التنفيذ بالدمام",
      category: "إجراءات تنفيذية",
      budget: 800,
      urgency: "normal",
      offersCount: 1,
      status: "open",
      deadline: "٢٨ سبتمبر ٢٠٢٦",
      description: "مراجعة دائرة التنفيذ لاستخراج محضر استيفاء سند لأمر ومتابعة الإفصاح الإلكتروني.",
    },
  ]);

  // Form state for creating a new collaboration listing
  const [newTitle, setNewTitle] = useState("");
  const [newCity, setNewCity] = useState("الرياض");
  const [newCourt, setNewCourt] = useState("");
  const [newBudget, setNewBudget] = useState("1000");
  const [newDesc, setNewDesc] = useState("");

  const handleCreateListing = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const item: CollabListing = {
      id: `LIST-${Date.now().toString().slice(-4)}`,
      title: newTitle,
      city: newCity,
      court: newCourt || "المحكمة العامة",
      category: "إسناد قضائي B2B",
      budget: Number(newBudget) || 1000,
      urgency: "normal",
      offersCount: 0,
      status: "open",
      deadline: "خلال ٧ أيام",
      description: newDesc,
    };

    setListings([item, ...listings]);
    setShowCreateModal(false);
    setNewTitle("");
    setNewCourt("");
    setNewDesc("");
  };

  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";

  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href={BACK_HREF[userType]}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-white hover:bg-gray-100 text-gray-700 border"
              }`}
            >
              <ArrowRight size={18} />
            </Link>
            <div>
              <h1 className={`text-xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>
                سوق التعاقد المهني والإسناد (Marketplace B2B)
              </h1>
              <p className={`text-xs ${muted}`}>
                إسناد الجلسات والمهام القضائية بين المحامين المرخصين بنظام الضمان المالي المعتمد (Escrow)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-colors"
            >
              <Plus size={16} weight="bold" />
              إسناد مهمة جديدة
            </button>
          </div>
        </div>

        {/* Escrow Guarantee Banner */}
        <div className={`p-4 rounded-2xl border ${isDark ? "bg-blue-500/10 border-blue-500/30 text-blue-300" : "bg-blue-50 border-blue-200 text-blue-900"} flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <ShieldCheck size={24} weight="duotone" className="text-blue-500 shrink-0" />
            <div className="text-xs">
              <span className="font-bold">حماية الضمان المالي (Escrow Protected):</span> تُحجز أتعاب المهمة في محفظة الضمان المالي قبل بدء العمل، ولا تُحرر للمحامي المسند إليه إلا بعد إتمام المهمة ورفع المحضر المعتمد، مع فحص تعارض المصالح آلياً.
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-1 rounded bg-blue-500/20 text-blue-400 shrink-0">
            ضمان ١٠٠٪
          </span>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 gap-6 text-sm font-semibold">
          <button
            onClick={() => setActiveTab("my-requests")}
            className={`pb-3 transition-colors relative ${
              activeTab === "my-requests"
                ? "text-blue-600 dark:text-blue-400 font-bold"
                : `${muted} hover:text-gray-700 dark:hover:text-gray-200`
            }`}
          >
            طلباتي وإسناداتي ({listings.length})
            {activeTab === "my-requests" && (
              <motion.div layoutId="marketTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("incoming-offers")}
            className={`pb-3 transition-colors relative ${
              activeTab === "incoming-offers"
                ? "text-blue-600 dark:text-blue-400 font-bold"
                : `${muted} hover:text-gray-700 dark:hover:text-gray-200`
            }`}
          >
            العروض المستلمة (٤)
            {activeTab === "incoming-offers" && (
              <motion.div layoutId="marketTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("browse-open")}
            className={`pb-3 transition-colors relative ${
              activeTab === "browse-open"
                ? "text-blue-600 dark:text-blue-400 font-bold"
                : `${muted} hover:text-gray-700 dark:hover:text-gray-200`
            }`}
          >
            فرص التعاون المتاحة
            {activeTab === "browse-open" && (
              <motion.div layoutId="marketTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
            )}
          </button>
        </div>

        {/* Tab 1: My Subcontract Requests */}
        {activeTab === "my-requests" && (
          <div className="space-y-4">
            {listings.length === 0 ? (
              <div className={`${card} p-12 text-center space-y-3`}>
                <Handshake size={48} weight="duotone" className="mx-auto text-gray-400" />
                <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                  لا توجد طلبات إسناد نشطة
                </h3>
                <p className={`text-xs ${muted} max-w-md mx-auto`}>
                  يمكنك إسناد حضور جلسة أو مراجعة محكمة أو تمثيل قضائي في أي مدينة بالمملكة وسيتنافس المحامون المرخصون لإنجازها.
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold"
                >
                  طرح أول إسناد
                </button>
              </div>
            ) : (
              listings.map((item) => (
                <div key={item.id} className={`${card} p-5 hover:border-blue-500/50 transition-colors shadow-sm`}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500">
                          {item.id}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400">
                          {item.category}
                        </span>
                        {item.urgency === "urgent" && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 flex items-center gap-1">
                            <Clock size={11} weight="bold" /> عاجل
                          </span>
                        )}
                      </div>
                      <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                        {item.title}
                      </h3>
                      <p className={`text-xs ${muted}`}>{item.description}</p>
                    </div>

                    <div className="flex md:flex-col items-end justify-between gap-2 shrink-0">
                      <div className="text-right">
                        <span className="text-[11px] text-gray-400 block">الميزانية المرصودة</span>
                        <span className={`text-base font-black ${isDark ? "text-[#C8A762]" : "text-amber-700"}`}>
                          {item.budget.toLocaleString()} ر.س
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-blue-500 bg-blue-500/10 px-2.5 py-1 rounded-lg">
                          {item.offersCount} عروض مقدمة
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className={`mt-4 pt-3 border-t flex flex-wrap items-center justify-between text-xs ${isDark ? "border-gray-800 text-gray-400" : "border-gray-100 text-gray-500"}`}>
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <MapPin size={14} className="text-gray-400" /> {item.city} — {item.court}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={14} className="text-gray-400" /> الموعد: {item.deadline}
                      </span>
                    </div>
                    <button className="text-blue-500 hover:text-blue-600 font-bold transition-colors">
                      استعراض العروض المقدمة والتعميد ←
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 2: Incoming Offers */}
        {activeTab === "incoming-offers" && (
          <div className="space-y-4">
            <div className={`${card} p-5 space-y-4`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
                    م.ع
                  </div>
                  <div>
                    <h4 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                      المحامي عبدالرحمن الغامدي (ترخيص: ٤٢/١٢٩٨)
                    </h4>
                    <p className={`text-xs ${muted}`}>عرض لحضور جلسة الاستئناف التجاري بجدة</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-base font-black ${isDark ? "text-[#C8A762]" : "text-amber-700"}`}>
                    ١,٢٠٠ ر.س
                  </span>
                  <span className="text-[10px] text-gray-400 block">شامل الضريبة والعمولة</span>
                </div>
              </div>
              <p className={`text-xs p-3 rounded-xl ${isDark ? "bg-gray-800/50" : "bg-gray-50"}`}>
                «مرخص في جدة ومتواجد بالمحكمة التجارية يوم الثلاثاء، أستلم المذكرة غداً وأوثق محضر الضبط فور رفع الجلسة.»
              </p>
              <div className="flex items-center justify-end gap-2">
                <button className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-xs font-semibold">
                  محادثة آمنة
                </button>
                <button className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">
                  قبول العرض وحجز الضمان (Escrow)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Open Opportunities */}
        {activeTab === "browse-open" && (
          <div className={`${card} p-8 text-center space-y-3`}>
            <Scales size={44} weight="duotone" className="mx-auto text-blue-500" />
            <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
              فرص الإسناد والتعاون المتاحة بالمملكة
            </h3>
            <p className={`text-xs ${muted} max-w-md mx-auto`}>
              يتم تحديث قائمة الطلبات المطروحة من المحامين والشركات فورياً؛ يمكنك تصفية الفرص حسب مدينتك والتخصص لتقديم عروض أتعابك مباشرة.
            </p>
            <div className="inline-flex items-center gap-2 text-xs font-bold text-blue-500 bg-blue-500/10 px-3 py-1.5 rounded-lg">
              <CheckCircle size={14} /> التنبيهات الفورية مفعلة لمدينتك
            </div>
          </div>
        )}

        {/* Modal: Create Collaboration Listing */}
        <AnimatePresence>
          {showCreateModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`${isDark ? "bg-[#161b22] border-gray-800" : "bg-white border-gray-200"} border rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4`}
              >
                <div className="flex items-center justify-between border-b pb-3 dark:border-gray-800">
                  <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                    إسناد مهمة جديدة لمحامٍ مرخص (B2B)
                  </h3>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="text-gray-400 hover:text-gray-200 text-sm font-bold"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleCreateListing} className="space-y-4 text-xs">
                  <div>
                    <label className="font-bold block mb-1">عنوان المهمة</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: حضور جلسة دعوى عمالية لدى الدائرة الأولى"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className={`w-full p-2.5 rounded-xl border ${isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-gray-50 border-gray-300"}`}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold block mb-1">المدينة</label>
                      <select
                        value={newCity}
                        onChange={(e) => setNewCity(e.target.value)}
                        className={`w-full p-2.5 rounded-xl border ${isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-gray-50 border-gray-300"}`}
                      >
                        <option value="الرياض">الرياض</option>
                        <option value="جدة">جدة</option>
                        <option value="الدمام">الدمام</option>
                        <option value="مكة المكرمة">مكة المكرمة</option>
                        <option value="المدينة المنورة">المدينة المنورة</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-bold block mb-1">الأتعاب المرصودة (ر.س)</label>
                      <input
                        type="number"
                        required
                        value={newBudget}
                        onChange={(e) => setNewBudget(e.target.value)}
                        className={`w-full p-2.5 rounded-xl border ${isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-gray-50 border-gray-300"}`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold block mb-1">المحكمة / الجهة القضائية</label>
                    <input
                      type="text"
                      placeholder="مثال: المحكمة العمالية بالرياض"
                      value={newCourt}
                      onChange={(e) => setNewCourt(e.target.value)}
                      className={`w-full p-2.5 rounded-xl border ${isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-gray-50 border-gray-300"}`}
                    />
                  </div>

                  <div>
                    <label className="font-bold block mb-1">تفاصيل وموجز المهمة</label>
                    <textarea
                      rows={3}
                      placeholder="صف المطلوب إنجازه بدقة ليتسنى للمحامي تقديم عرضه..."
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      className={`w-full p-2.5 rounded-xl border ${isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-gray-50 border-gray-300"}`}
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t dark:border-gray-800">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700 font-semibold"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold"
                    >
                      نشر طلب الإسناد
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Plus, Trash } from "@phosphor-icons/react";
import { BackendReadyNotice, LocalActionStatus, SectionTitle } from "./_shared";

// ── Tab 5: Payments ─────────────────────────────────────────────────
export function PaymentsTab() {
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const transactions = [
    { date: "٢٠٢٥/٠٣/١٥", desc: "رسوم استشارة قانونية", amount: "٢٥٠ ر.س", status: "مكتمل" },
    { date: "٢٠٢٥/٠٢/٢٨", desc: "Escrow — القضية ٢٠٢٥-٠٠١", amount: "٢,٥٠٠ ر.س", status: "محجوز" },
    { date: "٢٠٢٥/٠٢/١٠", desc: "رسوم خدمة المنصة", amount: "٩٩ ر.س", status: "مكتمل" },
    { date: "٢٠٢٥/٠١/٢٠", desc: "رسوم استشارة قانونية", amount: "٣٥٠ ر.س", status: "مكتمل" },
    { date: "٢٠٢٤/١٢/٠٥", desc: "استرداد — إلغاء موعد", amount: "١٥٠ ر.س", status: "مسترد" },
  ];

  const statusColor: Record<string, string> = {
    "مكتمل": "text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30",
    "محجوز": "text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30",
    "مسترد": "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30",
  };

  return (
    <div className="space-y-8">
      <BackendReadyNotice>
        المدفوعات هنا للعرض وتجهيز العقود فقط؛ حذف بطاقة أو إضافة بطاقة لا يلمس بوابة دفع حقيقية الآن.
      </BackendReadyNotice>

      <div>
        <SectionTitle>طرق الدفع المحفوظة</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-9 bg-gradient-to-r from-blue-600 to-blue-800 rounded-lg flex items-center justify-center text-white text-xs font-bold tracking-wide shadow">
              VISA
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Visa •••• 4242</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">تنتهي ٠٦/٢٧</p>
            </div>
            <button
              onClick={() => setLocalMessage("حذف البطاقة محلي فقط؛ لا يوجد Payment Gateway الآن.")}
              className="ms-auto w-8 h-8 rounded-lg border border-red-200 dark:border-red-800 flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Trash size={15} />
            </button>
          </div>
          <div className="relative group">
            <button
              onClick={() => setLocalMessage("إضافة بطاقة جاهزة للربط ببوابة دفع لاحقاً؛ لا يوجد إدخال بطاقة إنتاجي الآن.")}
              className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl px-4 py-2.5 w-full justify-center hover:border-royal/30 hover:text-royal transition-colors"
            >
              <Plus size={16} />
              إضافة بطاقة
            </button>
            <div className="absolute bottom-full mb-2 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 bg-gray-800 dark:bg-gray-700 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">
              لأسباب أمنية يجب إدخال البطاقة مباشرة
            </div>
          </div>
        </div>
      </div>

      <LocalActionStatus show={Boolean(localMessage)} message={localMessage ?? undefined} />

      <div>
        <SectionTitle>سجل المعاملات</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50">
                <th className="text-start px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">التاريخ</th>
                <th className="text-start px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">الوصف</th>
                <th className="text-end px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">المبلغ</th>
                <th className="text-end px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {transactions.map((tx) => (
                <tr key={tx.date + tx.desc} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400 text-xs">{tx.date}</td>
                  <td className="px-5 py-3.5 text-gray-800 dark:text-gray-200 font-medium">{tx.desc}</td>
                  <td className="px-5 py-3.5 text-end text-gray-800 dark:text-gray-200 font-semibold">{tx.amount}</td>
                  <td className="px-5 py-3.5 text-end">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColor[tx.status]}`}>
                       {tx.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

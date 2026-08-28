"use client";

import { Receipt, Upload } from "@phosphor-icons/react";
import { BackendReadyNotice, SectionTitle } from "./_shared";

// ── Tab: Invoices ────────────────────────────────────────────────────
// REMOVED: handleSave, the `saved` tick with its «تم الحفظ» label, the
// setTimeout that reset it, and the logo-upload handler — with the useState /
// motion / CheckCircle / LocalActionStatus imports they were the only users of.
//
// The save button reported «تم حفظ إعدادات الفواتير محلياً فقط» and flashed a
// green check. The five inputs below are uncontrolled — no `name`, no `ref`, no
// `onChange` — so nothing typed here was ever read, let alone stored: not on the
// server, not in localStorage, not in React state. The whole handler was
// `setSaved(true)`. The word «محلياً» made a complete no-op sound like a
// deliberate local-only save, which is the worst version of this: the user is
// told their input was kept somewhere, so they close the tab and stop worrying.
//
// The logo button was the same lie in a smaller frame: there is no
// `<input type="file">` anywhere in this file, so «رفع شعار الفاتورة محلي فقط»
// announced an action that could not have happened even in the browser.
//
// Both controls are now disabled with a stated Arabic reason, and the caption
// under the logo no longer promises «يظهر في أعلى كل فاتورة مُصدَرة» — no
// invoice is issued from this platform. Do NOT re-enable either control before
// a real destination exists: a route that stores invoice identity, and a
// storage path for the logo. Binding these inputs to component state is not
// that destination — if the button can be pressed, the user is entitled to
// assume the value survives the page.
//
// The fields stay on screen because they state, accurately, what an invoice
// will need. They are format hints only — see the comment on the input below.
export function InvoiceTab() {
  return (
    <div className="space-y-8">
      <BackendReadyNotice>
        لا تُحفظ إعدادات الفواتير من هذه الصفحة، ولا تُصدر هذه الصفحة أي فاتورة. ما تكتبه في الحقول أدناه لا
        يُرسل ولا يُخزَّن في أي مكان. لتسجيل بيانات فاتورتك أو طلب فاتورة رسمية تواصل مع فريق نظامي.
      </BackendReadyNotice>

      <div>
        <SectionTitle>بيانات الفاتورة</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] p-5 space-y-5">
          {/* Logo on invoice */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 dark:border-white/[0.08] flex items-center justify-center">
              <Receipt size={24} className="text-zinc-400" />
            </div>
            <div>
              <button
                type="button"
                disabled
                title="رفع شعار الفاتورة غير متاح حالياً"
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl border border-zinc-200 text-zinc-400 disabled:cursor-not-allowed dark:border-white/[0.08] dark:text-zinc-500"
              >
                <Upload size={14} />
                رفع شعار الفاتورة — قريباً
              </button>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                لا يوجد مكان يُحفظ فيه الشعار بعد، فلا يمكن رفعه من هنا.
              </p>
            </div>
          </div>

          {/* Fields */}
          {[
            { label: "اسم الكيان على الفاتورة",  placeholder: "مكتب نظامي للمحاماة والاستشارات القانونية" },
            { label: "الرقم الضريبي (VAT)",         placeholder: "3XXXXXXXXXXXXXXX" },
            { label: "عنوان الفاتورة",              placeholder: "حي الملقا، طريق الأمير محمد بن سلمان، الرياض" },
            { label: "البريد الإلكتروني للفواتير",  placeholder: "invoices@nezamy.sa" },
            { label: "نص ثابت أسفل الفاتورة (اختياري)", placeholder: "شكراً لثقتكم — جميع المبالغ بالريال السعودي شاملة الضريبة" },
          ].map((f) => (
            <div key={f.label}>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">{f.label}</label>
              {/* NO defaultValue. Every one of these five fields used to open
                  pre-filled with `f.placeholder` — which is نظامي's OWN
                  identity: its trading name, its Riyadh address and
                  invoices@nezamy.sa. A corporate customer opened this tab and
                  found another company's billing details entered as its own,
                  ready to be saved onto its invoices. A placeholder shows the
                  expected FORMAT; a defaultValue asserts the VALUE. */}
              <input
                type="text"
                placeholder={f.placeholder}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-dark-bg text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-royal/30 transition-colors"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <button
          type="button"
          disabled
          title="حفظ إعدادات الفواتير غير متاح حالياً"
          className="flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-sm disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 disabled:shadow-none dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
        >
          حفظ إعدادات الفواتير — قريباً
        </button>
        <p className="text-xs leading-6 text-zinc-500 dark:text-zinc-400 mt-2">
          الحفظ معطّل لأن هذه البيانات لا تُخزَّن في أي مكان؛ لا توجد جهة تستقبلها بعد. لتحديث بيانات
          فاتورتك تواصل مع فريق نظامي.
        </p>
      </div>
    </div>
  );
}

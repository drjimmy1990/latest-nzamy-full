"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowClockwise,
  CurrencyCircleDollar,
  Eye,
  EyeSlash,
  FloppyDisk,
  PencilSimple,
  Robot,
  Warning,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { LAWYER_AI_TOOLS } from "@/constants/lawyerAiCatalog";
import { bookSar, PRICE_BOOK } from "@/lib/pricing/priceBook";
import { formatClientServicePrice, type AdminPricingCatalogRow } from "@/lib/pricingRepository";
import {
  CATALOG_PRICE_MODES,
  changedCatalogFields,
  customerViewOf,
  type CatalogCustomerView,
} from "@/lib/pricing/catalogAdminRules";
import { listFailed, listFromApi, listOk, listViewState, itemsOf, type ListRead } from "@/lib/services/listRead";
import type { ClientServicePriceMode } from "@/constants/clientServiceCatalog";

/**
 * /dashboard/admin/pricing (S6-T8) — the client services' prices, read from
 * and written to public.admin_pricing_catalog through
 * /api/v1/admin/pricing-catalog (requireStaff; every edit audited). What a row
 * shows is what the customer sees (customerViewOf): a legacy row — disabled
 * with no admin hide flag, which the client loader never reads — shows its
 * code-catalogue entry, and its first edit realigns it to that entry on the
 * server (catalogAdminRules.ts).
 *
 * The plans and top-ups are the price book's (priceBook.ts, what checkout
 * charges), read-only: they change by deploying code. The market commission is
 * «قريباً» with no number (owner question ٤٢١ is open).
 *
 * The admin console is dark-only (admin/layout.tsx), so zinc tokens only.
 */

const AUDIENCE_LABEL: Record<string, string> = {
  individual: "الأفراد",
  corporate: "الأعمال",
};

const MODE_LABEL: Record<ClientServicePriceMode, string> = {
  free: "مجاني",
  included: "مشمول في باقة",
  fixed: "سعر ثابت",
  starting_from: "يبدأ من",
  custom: "حسب التقييم",
  per_page: "بالصفحة",
  points: "بالنقاط",
};

const API = "/api/v1/admin/pricing-catalog";

/** Read-only price-book rows: the professionals' subscription and top-ups, the two firm plans (yearly; monthly retired). */
const BOOK_ROWS: Array<{ id: string; billing: "yearly" | "once" }> = [
  { id: "lawyer-pro", billing: "yearly" },
  { id: "topup-500", billing: "once" },
  { id: "topup-1000", billing: "once" },
  { id: "topup-2500", billing: "once" },
  { id: "topup-5000", billing: "once" },
  { id: "topup-10000", billing: "once" },
  { id: "firm-basic", billing: "yearly" },
  { id: "firm-enterprise", billing: "yearly" },
];

type Draft = { serviceId: string; basePrice: string; priceMode: string; priceNote: string };

const card = "rounded-2xl border border-white/[0.06] bg-zinc-900/60";
const muted = "text-zinc-400";
const input = "rounded-xl border px-3 py-2 text-sm outline-none bg-zinc-950 border-white/10 text-white";

export default function PricingPage() {
  const [read, setRead] = useState<ListRead<AdminPricingCatalogRow> | null>(null);
  // Starts true: nothing may be said about the price list before the first answer.
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  // Only ever reports what a WRITE did.
  const [toast, setToast] = useState("");

  // The fetch alone (no synchronous setState), so the mount effect may call it.
  const fetchRows = useCallback(async () => {
    try {
      const res = await fetch(API, { cache: "no-store" });
      if (!res.ok) {
        setRead(listFailed<AdminPricingCatalogRow>());
        return;
      }
      setRead(listFromApi<AdminPricingCatalogRow>(await res.json()));
    } catch (err) {
      console.error("[admin/pricing] load failed:", err);
      setRead(listFailed<AdminPricingCatalogRow>());
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRows = useCallback(() => {
    setLoading(true);
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const state = listViewState(loading, read);
  const rows = itemsOf(read);
  const betaFreeTools = LAWYER_AI_TOOLS.filter((tool) => tool.betaStatus === "beta-free" && !tool.comingSoon).length;
  const hiddenCount = rows.filter((row) => !customerViewOf(row).visible).length;
  const legacyCount = rows.filter((row) => customerViewOf(row).legacy).length;
  const ready = state === "ready" || state === "empty";

  async function patchRow(row: AdminPricingCatalogRow, body: Record<string, unknown>, label: string) {
    if (Object.keys(body).length === 0) {
      setToast("لا تغييرات للحفظ.");
      return false;
    }
    setSaving(row.service_id);
    try {
      const res = await fetch(`${API}/${encodeURIComponent(row.service_id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.data) {
        setToast(json.error ?? `تعذّر حفظ «${label}» على الخادم — لم يتغيّر شيء.`);
        if (res.status === 409) loadRows();
        return false;
      }
      const saved = json.data as AdminPricingCatalogRow;
      setRead((current) =>
        current && current.ok
          ? listOk(current.items.map((r) => (r.service_id === saved.service_id ? saved : r)), current.total)
          : current,
      );
      setToast(`حُفظ «${label}» — يراه العملاء الآن.`);
      return true;
    } catch (err) {
      console.error("[admin/pricing] save failed:", err);
      setToast(`تعذّر الاتصال بالخادم — لم يُحفظ «${label}».`);
      return false;
    } finally {
      setSaving(null);
    }
  }

  async function saveDraft(row: AdminPricingCatalogRow, view: CatalogCustomerView) {
    if (!draft) return;
    const price = draft.basePrice.trim() === "" ? Number.NaN : Number(draft.basePrice);
    if (!Number.isFinite(price)) {
      setToast("السعر غير صالح");
      return;
    }
    const body = changedCatalogFields(view, {
      basePrice: price,
      priceMode: draft.priceMode,
      priceNote: draft.priceNote,
      enabled: view.visible,
    });
    if (await patchRow(row, body, view.label)) setDraft(null);
  }

  function startEdit(row: AdminPricingCatalogRow, view: CatalogCustomerView) {
    setDraft({
      serviceId: row.service_id,
      basePrice: String(view.basePrice),
      priceMode: view.priceMode,
      priceNote: view.priceNote,
    });
  }

  const stats: Array<[string, string, typeof CurrencyCircleDollar]> = [
    ["بنود خدمات العملاء", ready ? rows.length.toLocaleString("ar-SA") : "—", CurrencyCircleDollar],
    ["مخفية عن العملاء", ready ? hiddenCount.toLocaleString("ar-SA") : "—", EyeSlash],
    ["قديمة (يُعرض سعر الكود)", ready ? legacyCount.toLocaleString("ar-SA") : "—", Warning],
    ["أدوات AI مجانية في البيتا", betaFreeTools.toLocaleString("ar-SA"), Robot],
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-5 p-4 md:p-8" dir="rtl">
      <div>
        <h1 className="text-2xl font-black mb-1 text-white">إدارة التسعير</h1>
        <p className={`text-sm ${muted}`}>
          أسعار خدمات العملاء تُحفظ في قاعدة البيانات ويراها العملاء فور الحفظ. كل تعديل يُسجَّل في سجل الإدارة.
        </p>
      </div>

      {toast && (
        <div className="flex items-start gap-2 text-sm p-4 rounded-2xl border border-blue-500/20 bg-blue-500/10 text-blue-100">
          <WarningCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
          <span className="flex-1">{toast}</span>
          <button type="button" onClick={() => setToast("")} aria-label="إغلاق" className="text-blue-200 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {stats.map(([label, value, Icon]) => (
          <div key={label} className={`${card} p-5 flex items-center justify-between`}>
            <div>
              <p className={`text-xs mb-2 ${muted}`}>{label}</p>
              <p className="text-2xl font-black font-mono text-white">{value}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.04] text-[#C8A762]">
              <Icon size={22} weight="duotone" />
            </div>
          </div>
        ))}
      </div>

      {/* ── Section 1: the client services' prices (admin_pricing_catalog) ── */}
      <div className={`${card} overflow-hidden`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <p className="text-sm font-black text-white">أسعار خدمات العملاء</p>
          <button type="button" onClick={loadRows} className={`inline-flex items-center gap-1.5 text-xs font-bold ${muted} hover:text-white`}>
            <ArrowClockwise size={12} weight="bold" /> تحديث
          </button>
        </div>

        {state === "loading" && <div className={`px-5 py-12 text-center text-sm ${muted}`}>جارٍ تحميل قائمة الأسعار…</div>}

        {state === "unreadable" && (
          <div className="px-5 py-12 text-center">
            <Warning size={24} weight="fill" className="mx-auto mb-2 text-amber-500" />
            <p className="text-sm font-bold text-white">تعذّرت قراءة قائمة الأسعار</p>
            <p className={`text-xs mt-1 ${muted}`}>
              هذه ليست قائمة فارغة — لم نتمكن من القراءة. الأسعار التي يراها العملاء لم تتغيّر.
            </p>
            <button type="button" onClick={loadRows}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-white font-bold text-xs hover:bg-amber-600 transition">
              <ArrowClockwise size={12} weight="bold" /> إعادة المحاولة
            </button>
          </div>
        )}

        {state === "empty" && (
          <div className={`px-5 py-12 text-center text-sm ${muted}`}>
            لا توجد بنود في جدول الأسعار — يرى العملاء أسعار الكود الافتراضية.
          </div>
        )}

        {state === "ready" && (
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="text-xs font-bold bg-zinc-950/40 text-zinc-400 border-b border-white/[0.06]">
                  <th className="px-4 py-3">البند</th>
                  <th className="px-4 py-3">الفئة</th>
                  <th className="px-4 py-3">طريقة التسعير</th>
                  <th className="px-4 py-3">السعر (ر.س)</th>
                  <th className="px-4 py-3">ملاحظة السعر</th>
                  <th className="px-4 py-3">الظهور</th>
                  <th className="px-4 py-3">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const view = customerViewOf(row);
                  const editing = draft?.serviceId === row.service_id ? draft : null;
                  const busy = saving === row.service_id;
                  const audience = row.audience ?? "individual";
                  const variantOf = (row.metadata as Record<string, unknown> | undefined)?.variantOf;
                  return (
                    <tr key={row.service_id} className="border-b last:border-0 border-white/[0.04] hover:bg-white/[0.02] align-top">
                      <td className="px-4 py-4">
                        <p className="text-sm font-bold text-zinc-100">{view.label}</p>
                        <p className={`text-[10px] font-mono ${muted}`}>{row.service_id}</p>
                        {typeof variantOf === "string" && (
                          <p className={`text-[10px] mt-1 ${muted}`}>سعر بديل لـ {variantOf}</p>
                        )}
                        {view.legacy && (
                          <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 font-bold">
                            قديم — يُعرض سعر الكود
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-[11px] px-2 py-1 rounded-full border border-white/10 bg-white/[0.04] text-zinc-300 font-bold">
                          {AUDIENCE_LABEL[audience] ?? audience}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs text-zinc-300">
                        {editing ? (
                          <select value={editing.priceMode} onChange={(e) => setDraft({ ...editing, priceMode: e.target.value })} className={`${input} w-36 text-xs`}>
                            {CATALOG_PRICE_MODES.map((mode) => (
                              <option key={mode} value={mode}>{MODE_LABEL[mode]}</option>
                            ))}
                          </select>
                        ) : (
                          MODE_LABEL[view.priceMode as ClientServicePriceMode] ?? view.priceMode
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm font-mono text-[#C8A762]">
                        {editing ? (
                          <input type="number" min={0} step="0.01" value={editing.basePrice} onChange={(e) => setDraft({ ...editing, basePrice: e.target.value })} className={`${input} w-28`} />
                        ) : (
                          <>
                            <span>{view.basePrice.toLocaleString("ar-SA")}</span>
                            <span className={`block text-[10px] font-sans ${muted}`}>
                              {formatClientServicePrice({ basePrice: view.basePrice, priceMode: view.priceMode as ClientServicePriceMode })}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-4 text-xs text-zinc-300 max-w-xs">
                        {editing ? (
                          <input value={editing.priceNote} maxLength={200} onChange={(e) => setDraft({ ...editing, priceNote: e.target.value })} className={`${input} w-full`} />
                        ) : (
                          view.priceNote || <span className={muted}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => { void patchRow(row, changedCatalogFields(view, { basePrice: view.basePrice, priceMode: view.priceMode, priceNote: view.priceNote, enabled: !view.visible }), view.label); }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold disabled:opacity-50 ${view.visible ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/[0.04] text-zinc-400"}`}
                          title={view.visible ? "إخفاء عن العملاء" : "إظهار للعملاء"}
                        >
                          {view.visible ? <Eye size={12} /> : <EyeSlash size={12} />}
                          {view.visible ? "ظاهر" : "مخفي"}
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        {editing ? (
                          <div className="flex gap-1">
                            <button type="button" disabled={busy} onClick={() => { void saveDraft(row, view); }} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0B3D2E] text-white disabled:opacity-50">
                              <FloppyDisk size={12} /> حفظ
                            </button>
                            <button type="button" disabled={busy} onClick={() => setDraft(null)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-white/10 text-zinc-300 hover:bg-white/5">
                              إلغاء
                            </button>
                          </div>
                        ) : (
                          <button type="button" disabled={busy || draft !== null} onClick={() => startEdit(row, view)} className="p-2 rounded-lg border border-white/10 text-zinc-300 hover:bg-white/5 disabled:opacity-40" title="تعديل">
                            <PencilSimple size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 2: plans and top-ups, read-only from the price book ── */}
      <div className={`${card} p-5 space-y-3`}>
        <div>
          <p className="text-sm font-black text-white">الباقات والشحن — من دفتر الأسعار</p>
          <p className={`text-xs mt-1 ${muted}`}>تتغيّر بنشر الكود، لا من هذه الشاشة. الأسعار قبل الضريبة، كما تحسبها صفحة الدفع.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="text-xs font-bold text-zinc-400 border-b border-white/[0.06]">
                <th className="px-3 py-2">البند</th>
                <th className="px-3 py-2">الدورة</th>
                <th className="px-3 py-2">السعر (ر.س)</th>
                <th className="px-3 py-2">النقاط</th>
              </tr>
            </thead>
            <tbody>
              {BOOK_ROWS.map(({ id, billing }) => (
                <tr key={id} className="border-b last:border-0 border-white/[0.04]">
                  <td className="px-3 py-2 text-sm text-zinc-100">
                    {PRICE_BOOK[id].labelAr}
                    <span className={`block text-[10px] font-mono ${muted}`}>{id}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-300">{billing === "yearly" ? "سنوي" : "مرة واحدة"}</td>
                  <td className="px-3 py-2 text-sm font-mono text-[#C8A762]">{bookSar(id, billing).toLocaleString("ar-SA")}</td>
                  <td className={`px-3 py-2 text-sm font-mono ${muted}`}>
                    {PRICE_BOOK[id].points ? PRICE_BOOK[id].points!.toLocaleString("ar-SA") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-300">عمولة السوق: قريباً</p>
      </div>
    </div>
  );
}

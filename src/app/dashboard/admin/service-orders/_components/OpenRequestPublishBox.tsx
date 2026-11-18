"use client";

/**
 * Owner ٢٣ (18 Nov 2026) — «نشر في الطلبات المفتوحة». After a quick triage,
 * staff publish a waiting client request under one of three types (استشارة /
 * قضية / صياغة); verified lawyers then see it in «الطلبات المفتوحة» with the
 * type, the city and the server-written summary line — never the client's
 * name or text (public.marketplace_open_requests, 20261127_70). Withdrawing it
 * takes it off their list. Claiming or routing the order takes it off by
 * itself (the function lists unassigned, waiting requests only).
 *
 * The preview shows exactly what a lawyer will see, so staff can check the
 * summary line before they publish.
 */
import { useState } from "react";
import { saudiCityLabelAr } from "@/constants/saudiCities";
import { formatArabicDate } from "@/lib/services/clientDashboardCards";
import {
  OPEN_REQUEST_CATEGORIES,
  OPEN_REQUEST_CATEGORY_LABEL_AR,
  isOpenRequestCategory,
  openRequestCategoryLabelAr,
  suggestOpenRequestCategory,
  type OpenRequestCategory,
} from "@/lib/services/openRequestCategory";

export interface PublishableOrder {
  id: string;
  type?: string;
  status: string;
  metadata: Record<string, unknown>;
  city?: string | null;
  public_summary?: string | null;
  marketplace_published_at?: string | null;
  marketplace_category?: string | null;
  assignee: { id: string; name: string } | null;
}

export default function OpenRequestPublishBox({ order, isDark, busy, onPublish, onUnpublish }: {
  order: PublishableOrder;
  isDark: boolean;
  busy: boolean;
  onPublish: (category: OpenRequestCategory) => void;
  onUnpublish: () => void;
}) {
  const [category, setCategory] = useState<OpenRequestCategory | "">(
    isOpenRequestCategory(order.marketplace_category) ? order.marketplace_category : suggestOpenRequestCategory(order) ?? "",
  );
  const published = !!order.marketplace_published_at;
  const muted = isDark ? "text-zinc-500" : "text-zinc-500";
  const city = saudiCityLabelAr(order.city ?? null);
  const box = `rounded-xl border p-3 space-y-2 ${isDark ? "border-white/[0.07] bg-white/[0.02]" : "border-zinc-200 bg-zinc-50"}`;
  const btn = "rounded-xl px-4 py-2 text-[12px] font-bold disabled:opacity-40";

  return (
    <div className={box}>
      <p className={`text-[11px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الطلبات المفتوحة للمحامين</p>

      {published ? (
        <>
          <p className={`text-[12px] ${isDark ? "text-emerald-300" : "text-emerald-700"}`} role="status">
            منشور للمحامين الموثَّقين بنوع «{openRequestCategoryLabelAr(order.marketplace_category) ?? "—"}»
            {formatArabicDate(order.marketplace_published_at) ? ` منذ ${formatArabicDate(order.marketplace_published_at)}` : ""}.
          </p>
          {order.assignee && (
            <p className={`text-[10px] ${muted}`}>الطلب موجّه الآن لعضو من الفريق، فلا يظهر في قائمة المحامين.</p>
          )}
          <button type="button" disabled={busy} onClick={onUnpublish}
            className={`${btn} border ${isDark ? "border-white/[0.1] text-zinc-300" : "border-zinc-300 text-zinc-700"}`}>
            سحب من الطلبات المفتوحة
          </button>
        </>
      ) : order.assignee ? (
        <p className={`text-[11px] ${muted}`}>الطلب موجّه لعضو من الفريق — ألغِ التوجيه أولاً إن أردت نشره للمحامين.</p>
      ) : (
        <>
          <label htmlFor={`open-cat-${order.id}`} className={`block text-[11px] ${muted}`}>نوع الطلب كما يراه المحامي</label>
          <select id={`open-cat-${order.id}`} disabled={busy} value={category}
            onChange={(e) => setCategory(isOpenRequestCategory(e.target.value) ? e.target.value : "")}
            className={`w-full rounded-xl px-3 py-2 text-[12px] border disabled:opacity-40 ${
              isDark ? "bg-zinc-950 border-white/[0.07] text-zinc-200" : "bg-white border-zinc-200 text-zinc-800"}`}>
            <option value="">اختر النوع…</option>
            {OPEN_REQUEST_CATEGORIES.map((c) => (
              <option key={c} value={c}>{OPEN_REQUEST_CATEGORY_LABEL_AR[c]}</option>
            ))}
          </select>
          <div className={`rounded-lg p-2 text-[11px] leading-relaxed ${isDark ? "bg-zinc-950/60 text-zinc-300" : "bg-white text-zinc-700"}`}>
            <span className="font-bold">ما يراه المحامي: </span>
            {[category ? OPEN_REQUEST_CATEGORY_LABEL_AR[category] : "—", city].filter(Boolean).join(" · ")}
            <br />
            {order.public_summary || <span className={muted}>لا سطر ملخّص لهذا الطلب — سيظهر النوع والمدينة فقط.</span>}
          </div>
          <button type="button" disabled={busy || !category} onClick={() => { if (category) onPublish(category); }}
            className={`${btn} bg-[#0B3D2E] text-white`}>
            نشر في الطلبات المفتوحة
          </button>
        </>
      )}

      <p className={`text-[10px] leading-relaxed ${muted}`}>
        لا يرى المحامي اسم العميل ولا نصّ طلبه. النشر لا يغيّر حالة الطلب ولا يُرسل إشعاراً للعميل، ويختفي الطلب من القائمة عند استلامه أو توجيهه.
      </p>
    </div>
  );
}

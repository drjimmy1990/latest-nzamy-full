"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NewspaperClipping } from "@phosphor-icons/react";
import { apiSlug } from "@/utils/apiSlug";

/**
 * «أحدث التحديثات التشريعية» — the laws in the library with the newest «آخر
 * تحديث تشريعي» (owner TODO P1-12), from GET /api/library/legislative-updates.
 *
 * It used to render DEMO_UPDATES: amendments, decrees and summaries that were
 * never issued (owner test 2026-09-28, T28-01; unmounted twice). Now each row is
 * a real law, its link and its date ALONE — the one legislative date every
 * viewer may see (owner ٣١٨). No decree, article or "what changed" is shown:
 * the library holds none a guest may read. While loading, on an empty list or
 * on a failed read the card renders nothing — never an invented item.
 */

interface UpdateItem {
  slug: string;
  title: string;
  dateHijri: string;
}

interface LegislativeUpdatesProps { isDark: boolean; isRTL: boolean; }

function asItems(raw: unknown): UpdateItem[] {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { items?: unknown }).items)) return [];
  return ((raw as { items: unknown[] }).items).filter(
    (i): i is UpdateItem =>
      typeof i === "object" && i !== null &&
      typeof (i as UpdateItem).slug === "string" && (i as UpdateItem).slug !== "" &&
      typeof (i as UpdateItem).title === "string" && (i as UpdateItem).title !== "" &&
      typeof (i as UpdateItem).dateHijri === "string" && (i as UpdateItem).dateHijri !== "",
  );
}

export default function LegislativeUpdates({ isDark, isRTL }: LegislativeUpdatesProps) {
  const [items, setItems] = useState<UpdateItem[]>([]);

  useEffect(() => {
    let alive = true;
    fetch("/api/library/legislative-updates")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (alive) setItems(asItems(json));
      })
      .catch(() => {
        if (alive) setItems([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <section
      dir={isRTL ? "rtl" : "ltr"}
      aria-label="أحدث التحديثات التشريعية"
      className={`rounded-3xl border overflow-hidden ${isDark ? "bg-[#0f1923] border-white/10" : "bg-white border-slate-200"}`}
    >
      <div className={`flex items-center gap-3 px-4 py-3 border-b ${isDark ? "border-white/[0.08]" : "border-slate-100"}`}>
        <div className={`p-2 rounded-xl ${isDark ? "bg-amber-400/10" : "bg-amber-50"}`}>
          <NewspaperClipping size={18} weight="fill" className="text-amber-500" />
        </div>
        <div>
          <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}>أحدث التحديثات التشريعية</h3>
          <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
            الأنظمة الأحدث في المكتبة بتاريخ آخر تحديث تشريعي
          </p>
        </div>
      </div>
      <ul className="px-3 py-2 space-y-1">
        {items.map((u) => (
          <li key={u.slug}>
            <Link
              href={`/laws/${apiSlug(u.slug)}`}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${isDark ? "hover:bg-white/5" : "hover:bg-slate-50"}`}
            >
              <span className="w-2 h-2 rounded-full shrink-0 bg-amber-400" aria-hidden />
              <span className="flex-1 min-w-0">
                <span className={`block text-xs font-bold truncate ${isDark ? "text-zinc-300" : "text-slate-800"}`}>{u.title}</span>
                <span className={`block text-[11px] mt-0.5 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                  آخر تحديث تشريعي: {u.dateHijri}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

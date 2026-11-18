"use client";

import { useState } from "react";

/**
 * «تحرير المقاعد التجريبية» (batch l7, decision 3; launch gap item 17) — the
 * admin frees the founder seats test accounts took after a journey test.
 * Preview first (GET /api/v1/admin/founder/test-seats), then one confirmed
 * POST. A seat paid LIVE is never touched here (it is listed apart; the
 * refund path frees it). Shown to managers only (the page passes canManage).
 */

const URL_ = "/api/v1/admin/founder/test-seats";

type SeatView = { seatId: string; orderId: string | null; status: string };
type Preview = {
  release: SeatView[];
  skippedLive: SeatView[];
  skippedNoOrder: SeatView[];
  testAccountsComplete: boolean;
};

async function call(init?: RequestInit): Promise<{ ok: boolean; body: Record<string, unknown> | null }> {
  try {
    const res = await fetch(URL_, { cache: "no-store", ...init });
    return { ok: res.ok, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
  } catch {
    return { ok: false, body: { error: "تعذّر الاتصال بالخادم." } };
  }
}

export default function TestSeatsRelease({ onDone }: { onDone: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null);

  async function check() {
    setBusy(true);
    setNotice(null);
    const { ok, body } = await call();
    setBusy(false);
    if (ok && body) setPreview(body as unknown as Preview);
    else setNotice({ ok: false, msg: String(body?.error ?? "تعذّر قراءة المقاعد.") });
  }

  async function release() {
    if (!preview || preview.release.length === 0) return;
    if (!window.confirm(`تحرير ${preview.release.length} مقعد تجريبي؟ تُسحب أرصدتها ووصول المكتبة المرتبط بها، ولا يُمسّ أي مقعد مدفوع دفعاً حقيقياً.`)) return;
    setBusy(true);
    const { ok, body } = await call({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    setBusy(false);
    setNotice({ ok, msg: String(body?.message ?? body?.error ?? (ok ? "تم." : "تعذّر التحرير.")) });
    setPreview(null);
    if (ok) onDone();
  }

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-zinc-900/60 p-5">
      <h2 className="mb-1 text-[14px] font-bold text-white">تحرير المقاعد التجريبية</h2>
      <p className="mb-3 text-[12px] text-zinc-400">
        يحرّر مقاعد المؤسس التي دُفعت في وضع الاختبار، ومقاعد الحسابات التجريبية التي لم تُدفع دفعاً حقيقياً. المقعد المدفوع دفعاً
        حقيقياً لا يُمسّ هنا، ويُحرَّر بالاسترداد.
      </p>
      {preview ? (
        <div className="space-y-2 text-[12px] text-zinc-300">
          <p>
            سيُحرَّر: <span className="font-bold text-white">{preview.release.length}</span> مقعد
            {preview.skippedLive.length > 0 ? ` · لحساب تجريبي ومدفوع دفعاً حقيقياً (لن يُمسّ): ${preview.skippedLive.length}` : ""}
            {preview.skippedNoOrder.length > 0 ? ` · بلا عملية دفع (لن يُمسّ): ${preview.skippedNoOrder.length}` : ""}
          </p>
          {!preview.testAccountsComplete ? (
            <p className="text-amber-300">تعذّرت قراءة قائمة الحسابات التجريبية كاملة؛ قد تكون القائمة أعلاه ناقصة.</p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || preview.release.length === 0}
              onClick={() => void release()}
              className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-[12px] font-bold text-amber-200 disabled:opacity-40"
            >
              تحرير المقاعد التجريبية
            </button>
            <button type="button" disabled={busy} onClick={() => setPreview(null)} className="rounded-lg px-3 py-1.5 text-[12px] text-zinc-400">
              إلغاء
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void check()}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] font-bold text-zinc-200 disabled:opacity-40"
        >
          {busy ? "جارٍ الفحص…" : "فحص المقاعد التجريبية"}
        </button>
      )}
      {notice ? (
        <p className={`mt-3 text-[12px] ${notice.ok ? "text-emerald-300" : "text-red-300"}`}>{notice.msg}</p>
      ) : null}
    </section>
  );
}

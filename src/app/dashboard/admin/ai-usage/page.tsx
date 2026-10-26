"use client";

import { useCallback, useEffect, useState } from "react";
import { Robot, ArrowClockwise, CheckCircle, XCircle, Play } from "@phosphor-icons/react";
import { useAiRun } from "@/hooks/useAiRun";

/**
 * /dashboard/admin/ai-usage — «تشغيلات الذكاء الاصطناعي» (AI wave 0, plan §5).
 *
 * Real rows only, from public.ai_runs (20261027_10) through
 * GET /api/v1/admin/ai-runs:
 *   * every tool's switch (off / review / live) and daily limit, saved to
 *     platform_settings.ai_tools through PATCH /api/v1/admin/settings;
 *   * a round-trip test (echo-fast / echo-job) run from this session — an
 *     admin is never charged, so a charge test needs a test account;
 *   * the last 100 runs: who, status, points charged / refunded, error, tokens, time.
 */

interface ToolRow {
  id: string;
  class: "fast" | "job";
  tier: string;
  price: number;
  mode: "off" | "review" | "live";
  dailyLimit: number;
  defaultMode: string;
  defaultDailyLimit: number;
}

interface RunRow {
  id: string;
  tool: string;
  status: string;
  user_name: string;
  model: string | null;
  price_points: number;
  charged_points: number;
  charged: boolean;
  error_code: string | null;
  usage: { input_tokens?: number; output_tokens?: number } | null;
  created_at: string;
  refunded_at: string | null;
  duration_ms: number | null;
}

const MODE_LABEL: Record<string, string> = { off: "متوقفة", review: "بمراجعة", live: "مفعّلة" };
const STATUS_LABEL: Record<string, string> = { running: "قيد التنفيذ", review: "بانتظار المراجعة", succeeded: "نجح", failed: "فشل" };
const STATUS_TONE: Record<string, string> = {
  running: "text-amber-300",
  review: "text-sky-300",
  succeeded: "text-emerald-300",
  failed: "text-red-300",
};

export default function AdminAIUsagePage() {
  const [tools, setTools] = useState<ToolRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [charging, setCharging] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testText, setTestText] = useState("اختبار الاتصال");
  const [useModel, setUseModel] = useState(false);
  const run = useAiRun();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/ai-runs", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "تعذّر تحميل التشغيلات");
      setTools(json.tools ?? []);
      setRuns(json.runs ?? []);
      setCharging(json.charging === true);
      setSchemaMissing(json.schemaMissing === true);
    } catch (err) {
      setToast({ ok: false, msg: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (run.phase === "done" || run.phase === "error") load();
  }, [run.phase, load]);

  async function save(next: ToolRow[]) {
    setSaving(true);
    setToast(null);
    const value = Object.fromEntries(next.map((t) => [t.id, { mode: t.mode, daily_limit: t.dailyLimit }]));
    try {
      const res = await fetch("/api/v1/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "ai_tools", value }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "تعذّر الحفظ");
      setToast({ ok: true, msg: "حُفظت إعدادات الأدوات" });
      await load();
    } catch (err) {
      setToast({ ok: false, msg: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const update = (id: string, patch: Partial<ToolRow>) =>
    setTools((rows) => rows.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  return (
    <div className="min-h-full p-6 md:p-8" dir="rtl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#C8A762]/10 border border-[#C8A762]/20">
            <Robot size={22} weight="duotone" className="text-[#C8A762]" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">تشغيلات الذكاء الاصطناعي</h1>
            <p className="text-[12px] text-zinc-500">
              تشغيل الأدوات وإيقافها، وسجل كل تشغيل بما خُصم وما أُعيد. الخصم {charging ? "مفعّل" : "متوقف (فترة تجربة)"}.
            </p>
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-2 rounded-xl border border-zinc-800 px-3 py-2 text-[12px] font-bold text-zinc-300">
          <ArrowClockwise size={14} /> تحديث
        </button>
      </div>

      {toast && (
        <div className={`mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-[13px] font-semibold border ${
          toast.ok ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-red-500/10 border-red-500/30 text-red-300"
        }`}>
          {toast.ok ? <CheckCircle size={16} weight="fill" /> : <XCircle size={16} weight="fill" />}
          {toast.msg}
        </div>
      )}

      {schemaMissing && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-200">
          جدول التشغيلات غير موجود بعد — نفّذ ملف 20261027_10_ai_runs.sql أولاً.
        </div>
      )}

      <section className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
        <h2 className="mb-3 text-[14px] font-black text-white">الأدوات</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="text-zinc-500">
              <tr className="text-right">
                <th className="py-2">الأداة</th>
                <th>النوع</th>
                <th>السعر</th>
                <th>الحالة</th>
                <th>الحد اليومي</th>
              </tr>
            </thead>
            <tbody className="text-zinc-200">
              {tools.map((t) => (
                <tr key={t.id} className="border-t border-zinc-800/70">
                  <td className="py-2 font-mono">{t.id}</td>
                  <td>{t.class === "fast" ? "فوري" : "مهمة"}</td>
                  <td>{t.price} نقطة</td>
                  <td>
                    <select value={t.mode} onChange={(e) => update(t.id, { mode: e.target.value as ToolRow["mode"] })}
                      className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100">
                      {(["off", "review", "live"] as const).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
                    </select>
                  </td>
                  <td>
                    <input type="number" min={0} max={1000} value={t.dailyLimit}
                      onChange={(e) => update(t.id, { dailyLimit: Math.max(0, Math.min(1000, Math.trunc(Number(e.target.value) || 0))) })}
                      className="w-20 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button disabled={saving || loading} onClick={() => save(tools)}
          className="mt-3 rounded-xl bg-[#C8A762] px-4 py-2 text-[12px] font-black text-black disabled:opacity-50">
          {saving ? "جارٍ الحفظ…" : "حفظ"}
        </button>
      </section>

      <section className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
        <h2 className="mb-1 text-[14px] font-black text-white">اختبار الاتصال مع n8n</h2>
        <p className="mb-3 text-[12px] text-zinc-500">
          فعّل أداة echo-fast أو echo-job أعلاه ثم شغّلها من هنا. الحساب الإداري لا يُخصم منه، فاختبار الخصم يكون بحساب تجريبي.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input value={testText} onChange={(e) => setTestText(e.target.value)} maxLength={500}
            className="min-w-[220px] flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-[13px] text-zinc-100" />
          <label className="flex items-center gap-2 text-[12px] text-zinc-300">
            <input type="checkbox" checked={useModel} onChange={(e) => setUseModel(e.target.checked)} />
            عبر النموذج (Claude)
          </label>
          {(["echo-fast", "echo-job"] as const).map((tool) => (
            <button key={tool} disabled={run.busy} onClick={() => run.start(tool, { text: testText, use_model: useModel })}
              className="flex items-center gap-2 rounded-xl border border-[#C8A762]/40 px-3 py-2 text-[12px] font-bold text-[#C8A762] disabled:opacity-50">
              <Play size={14} /> {tool}
            </button>
          ))}
        </div>
        {run.phase !== "idle" && (
          <div className="mt-3 rounded-xl border border-zinc-800 bg-black/40 p-3 text-[12px] text-zinc-300">
            <div>الحالة: {run.phase}{run.step ? ` · ${run.step}` : ""}{run.runId ? ` · ${run.runId.slice(0, 8)}` : ""}</div>
            {run.output && <pre className="mt-2 whitespace-pre-wrap text-zinc-100">{JSON.stringify(run.output, null, 2)}</pre>}
            {run.error && <div className="mt-2 text-red-300">{run.error}{run.code ? ` (${run.code})` : ""}</div>}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
        <h2 className="mb-3 text-[14px] font-black text-white">آخر التشغيلات</h2>
        {loading ? (
          <p className="text-[12px] text-zinc-500">جارٍ التحميل…</p>
        ) : runs.length === 0 ? (
          <p className="text-[12px] text-zinc-500">لا توجد تشغيلات بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="text-zinc-500">
                <tr className="text-right">
                  <th className="py-2">الوقت</th>
                  <th>المستخدم</th>
                  <th>الأداة</th>
                  <th>الحالة</th>
                  <th>النقاط</th>
                  <th>الخطأ</th>
                  <th>الرموز</th>
                  <th>المدة</th>
                </tr>
              </thead>
              <tbody className="text-zinc-200">
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-800/70">
                    <td className="py-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString("ar-SA-u-nu-latn")}</td>
                    <td>{r.user_name}</td>
                    <td className="font-mono">{r.tool}</td>
                    <td className={STATUS_TONE[r.status] ?? ""}>{STATUS_LABEL[r.status] ?? r.status}</td>
                    <td>
                      {r.charged ? `${r.charged_points}${r.refunded_at ? " (أُعيدت)" : ""}` : `— (${r.price_points})`}
                    </td>
                    <td className="font-mono text-red-300">{r.error_code ?? ""}</td>
                    <td>{r.usage ? `${r.usage.input_tokens ?? 0} / ${r.usage.output_tokens ?? 0}` : ""}</td>
                    <td>{r.duration_ms !== null ? `${(r.duration_ms / 1000).toFixed(1)} ث` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

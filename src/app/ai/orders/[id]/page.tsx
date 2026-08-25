"use client";

import { useEffect, useState, use } from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import {
  getServiceOrder, ORDER_STATUS_AR, type ServiceOrder,
} from "@/lib/services/serviceOrders";

type LoadState = "loading" | "error" | "not_found" | "loaded";

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isDark } = useTheme();
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [downloadErr, setDownloadErr] = useState("");

  const load = () => {
    setState("loading");
    getServiceOrder(id)
      .then((o) => { setOrder(o); setState("loaded"); })
      .catch((e) => {
        // Match on .name rather than `instanceof ServiceOrderNotFoundError`:
        // instanceof against a subclassed built-in (Error) is only reliable
        // once you're certain nothing in the bundling pipeline downlevels
        // classes to ES5 prototypes (which breaks the prototype chain for
        // built-in extends). Matching the name string sidesteps that
        // question entirely, at no cost, so there's nothing to verify later.
        setState(e instanceof Error && e.name === "ServiceOrderNotFoundError" ? "not_found" : "error");
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function download() {
    setDownloadErr("");
    try {
      const res = await fetch(`/api/v1/service-requests/${id}/deliverable`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setDownloadErr(body.error ?? "تعذّر التحميل");
        return;
      }
      const { url } = await res.json();
      window.open(url, "_blank");
    } catch {
      // Transport-level failure (offline, dropped connection, malformed
      // response body) — never leave the button looking dead with no
      // feedback. This is a distinct message from the endpoint's own
      // (deliberately non-distinguishing) 404 body above.
      setDownloadErr("تعذّر التحميل. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.");
    }
  }

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";
  const mutedText = isDark ? "text-zinc-400" : "text-zinc-600";

  if (state === "loading") {
    return <div className={`p-7 text-[12px] ${mutedText}`} dir="rtl">جارٍ التحميل...</div>;
  }

  if (state === "error") {
    return (
      <div className="p-7 space-y-3" dir="rtl">
        <p className="text-[12px] text-red-500">تعذّر تحميل الطلب. حاول مرة أخرى.</p>
        <button onClick={load} className="rounded-xl bg-[#0B3D2E] px-5 py-2 text-[12px] font-bold text-white">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (state === "not_found" || !order) {
    // The server's own GET route conflates "row genuinely doesn't exist"
    // with "any other query error" into the same 404 (it does
    // `if (error || !serviceRequest) return 404`) — so this branch cannot
    // promise the order truly doesn't exist, only that it couldn't be
    // loaded under that id. Never assert non-existence outright; offer a
    // retry, since a transient failure on the server side is indistinguishable
    // from here.
    return (
      <div className="p-7 space-y-3" dir="rtl">
        <p className={`text-[12px] ${mutedText}`}>الطلب غير موجود أو تعذّر الوصول إليه. حاول مرة أخرى.</p>
        <button onClick={load} className="rounded-xl bg-[#0B3D2E] px-5 py-2 text-[12px] font-bold text-white">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const s = ORDER_STATUS_AR[order.status] ?? ORDER_STATUS_AR.pending_assignment;
  const deliverable = order.metadata?.deliverable;

  // Revisions SLA calculation: max 2 revisions, within 48h of completion
  const completedAt = order.metadata?.completedAt || order.metadata?.deliveredAt || order.created_at;
  const rawCompletedTime = completedAt ? new Date(completedAt).getTime() : Date.now();
  const completedTime = Number.isNaN(rawCompletedTime) ? Date.now() : rawCompletedTime;
  const now = Date.now();
  const hoursSinceDelivery = Math.max(0, Math.floor((now - completedTime) / (1000 * 60 * 60)));
  const isWithin48h = hoursSinceDelivery <= 48;
  const revisionsCount = Array.isArray(order.metadata?.revisions) ? (order.metadata.revisions as any[]).length : 0;
  const maxRevisions = 2;
  const remainingRevisions = Math.max(0, maxRevisions - revisionsCount);
  const canRequestRevision = order.status === "completed" && isWithin48h && remainingRevisions > 0;


  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [submittingRevision, setSubmittingRevision] = useState(false);
  const [revisionSuccess, setRevisionSuccess] = useState(false);

  const handleRevisionSubmit = async () => {
    if (!revisionNotes.trim()) return;
    setSubmittingRevision(true);
    try {
      const res = await fetch(`/api/v1/service-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_revision",
          revisionNotes: revisionNotes.trim(),
          revisionNumber: revisionsCount + 1,
        }),
      });
      if (res.ok) {
        setRevisionSuccess(true);
        setShowRevisionForm(false);
        setRevisionNotes("");
        load();
      }
    } catch {
      // ignore
    } finally {
      setSubmittingRevision(false);
    }
  };

  return (
    <div className="p-5 md:p-7 max-w-3xl mx-auto space-y-4" dir="rtl">
      <div>
        <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{order.title}</h1>
        <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          {order.metadata?.serviceTitleAr} · الحالة: {s.label}
        </p>
      </div>

      {order.status === "completed" && deliverable ? (
        <div className={`${card} p-5 space-y-4`}>
          <div className="flex items-center justify-between">
            <p className={`text-[14px] font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
              ✓ تم تسليم المستند بنجاح
            </p>
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
              isDark ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}>
              النسخة النهائية
            </span>
          </div>

          {/* Delivery notes from team */}
          {deliverable.notes && (
            <div className={`p-3.5 rounded-xl border ${isDark ? "bg-white/[0.03] border-white/[0.06]" : "bg-slate-50 border-slate-100"}`}>
              <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                ملاحظات وتوجيهات الفريق:
              </p>
              <p className={`text-[12px] leading-[1.9] ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{deliverable.notes}</p>
            </div>
          )}

          {/* Download button */}
          <div className="flex flex-wrap gap-2">
            <button onClick={download} className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-6 py-2.5 text-[12px] font-bold text-[#C8A762] hover:bg-[#092e22] shadow transition">
              <DownloadSimple size={15} /> تحميل {deliverable.fileName || "المستند"}
            </button>
          </div>
          {downloadErr && <p className="text-[11px] text-red-500">{downloadErr}</p>}

          {/* SLA Revisions Policy Box */}
          <div className={`p-4 rounded-2xl border ${isDark ? "border-white/[0.08] bg-zinc-950/50" : "border-slate-200 bg-slate-50/70"}`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                  سياسة التعديلات والاستفسارات
                </p>
                <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                  {canRequestRevision ? (
                    <>متاح لك <span className="font-bold text-amber-500">{remainingRevisions} تعديل مجاني</span> خلال 48 ساعة من الاستلام (مضى {hoursSinceDelivery} ساعة).</>
                  ) : (
                    <>انتهت فترة التعديلات المباشرة (48 ساعة أو استُهلكت التعديلات).</>
                  )}
                </p>
              </div>

              {canRequestRevision ? (
                <button
                  onClick={() => setShowRevisionForm(v => !v)}
                  className={`px-4 py-2 rounded-xl text-[11px] font-bold border transition ${
                    showRevisionForm
                      ? "bg-amber-500 text-white border-amber-500"
                      : isDark ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10" : "border-amber-300 text-amber-700 hover:bg-amber-50"
                  }`}
                >
                  {showRevisionForm ? "إلغاء" : "طلب تعديل على المسودة"}
                </button>
              ) : (
                <a
                  href="/dashboard/lawyer/consultations"
                  className={`px-4 py-2 rounded-xl text-[11px] font-bold border transition ${
                    isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  فتح تذكرة دعم / شكوى
                </a>
              )}
            </div>

            {/* Revision Request Form */}
            {showRevisionForm && (
              <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-3">
                <p className={`text-[11px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                  اكتب ملاحظات التعديل المطلوب بدقة:
                </p>
                <textarea
                  rows={3}
                  value={revisionNotes}
                  onChange={e => setRevisionNotes(e.target.value)}
                  placeholder="مثال: يرجى إضافة فقرة تتعلق بالشرط الجزائي وتعديل قيمة المطالبة..."
                  className={`w-full rounded-xl p-3 text-[12px] outline-none border transition ${
                    isDark ? "bg-zinc-900 border-white/[0.08] text-zinc-200 focus:border-[#C8A762]" : "bg-white border-zinc-200 text-zinc-800 focus:border-[#0B3D2E]"
                  }`}
                />
                <div className="flex gap-2">
                  <button
                    disabled={submittingRevision || !revisionNotes.trim()}
                    onClick={handleRevisionSubmit}
                    className="rounded-xl bg-[#0B3D2E] px-5 py-2 text-[12px] font-bold text-[#C8A762] hover:bg-[#092e22] disabled:opacity-40 transition"
                  >
                    {submittingRevision ? "جارٍ الإرسال..." : "إرسال طلب التعديل"}
                  </button>
                  <button
                    onClick={() => setShowRevisionForm(false)}
                    className={`rounded-xl px-4 py-2 text-[12px] font-semibold border ${
                      isDark ? "border-white/[0.08] text-zinc-400" : "border-slate-200 text-zinc-500"
                    }`}
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}

            {revisionSuccess && (
              <p className="text-[11px] text-emerald-400 mt-2 font-semibold">
                ✓ تم إرسال طلب التعديل لفريق نظامي بنجاح، وسنقوم بمراجعته وإعادة التسليم.
              </p>
            )}
          </div>
        </div>
      ) : order.status === "completed" ? (
        // Reachable: the status flip to "completed" and the metadata.deliverable
        // write aren't guaranteed atomic upstream, so a completed order can
        // momentarily (or permanently, if that write failed) have no
        // deliverable attached yet. Never render a blank panel here.
        <div className={`${card} p-5`}>
          <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
            طلبك جاهز لكن تعذّر تحميل بيانات المستند. حاول تحديث الصفحة أو تواصل مع الدعم.
          </p>
        </div>
      ) : order.status === "cancelled" ? (
        <div className={`${card} p-5`}>
          <p className="text-[12px] text-red-500">تم إلغاء الطلب.</p>
        </div>
      ) : order.status === "pending_assignment" || order.status === "assigned" || order.status === "in_review" ? (
        <div className={`${card} p-5`}>
          <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
            طلبك قيد التنفيذ لدى فريق نظامي. سيصلك إشعار فور جهوزية المستند.
          </p>
        </div>
      ) : (
        // Catch-all: any status value outside the five this page knows about
        // (e.g. "draft"/"pending_payment", which CREATE_STATUS_ALLOWLIST on
        // the service-requests route admits but ServiceOrder["status"] does
        // not model) falls here instead of rendering a blank panel below the
        // header. Type-level exhaustiveness on ORDER_STATUS_AR does not
        // reach this render, so this branch is the runtime backstop.
        <div className={`${card} p-5`}>
          <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
            حالة الطلب غير معروفة حالياً. حاول تحديث الصفحة أو تواصل مع الدعم.
          </p>
        </div>
      )}
    </div>
  );
}

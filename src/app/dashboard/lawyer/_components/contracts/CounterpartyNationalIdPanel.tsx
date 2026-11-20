"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleNotch, Eye, EyeSlash, IdentificationCard, Trash } from "@phosphor-icons/react";

/**
 * «رقم هوية الطرف الآخر» — N01-5 (owner ٢٤). Shown to the contract's author
 * only: /api/v1/lawyer/contracts/[id]/party-id answers 403 to anyone else, and
 * this panel then renders nothing. The number is never part of the contract
 * data; it is fetched on «عرض الرقم», each time, and every such view is
 * recorded. It leaves the screen on «إخفاء» or when the page closes.
 */

interface Status {
  stored: boolean;
  encrypted: boolean;
  keyConfigured: boolean;
}

type Load = { kind: "loading" } | { kind: "hidden" } | { kind: "unavailable" } | { kind: "error" } | { kind: "ready"; status: Status };

async function call(contractId: string, init?: RequestInit & { reveal?: boolean }) {
  const url = `/api/v1/lawyer/contracts/${encodeURIComponent(contractId)}/party-id${init?.reveal ? "?reveal=1" : ""}`;
  const res = await fetch(url, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { res, body };
}

export default function CounterpartyNationalIdPanel({ contractId, isDark }: { contractId: string; isDark: boolean }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [input, setInput] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { res, body } = await call(contractId);
      if (res.status === 403 || res.status === 404 || res.status === 401) { setLoad({ kind: "hidden" }); return; }
      if (res.status === 503) { setLoad({ kind: "unavailable" }); return; }
      if (!res.ok) { setLoad({ kind: "error" }); return; }
      setLoad({ kind: "ready", status: body as unknown as Status });
    } catch {
      setLoad({ kind: "error" });
    }
  }, [contractId]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (load.kind === "hidden" || load.kind === "loading") return null;

  const card = isDark ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60" : "rounded-2xl border border-slate-100 bg-white";
  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const title = isDark ? "text-zinc-200" : "text-zinc-800";
  const inputCls = isDark
    ? "rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-[12px] text-zinc-200"
    : "rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-700";
  const btn = `flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold transition disabled:opacity-50 ${isDark ? "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1]" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`;

  async function save() {
    setBusy(true); setMessage(null); setShown(null);
    try {
      const { res, body } = await call(contractId, { method: "PUT", body: JSON.stringify({ nationalId: input }) });
      if (!res.ok) { setMessage(typeof body.error === "string" ? body.error : "تعذّر الحفظ."); return; }
      setInput("");
      setLoad({ kind: "ready", status: body as unknown as Status });
      setMessage((body as unknown as Status).encrypted
        ? "حُفظ الرقم محمياً، ولا يطّلع عليه غيرك."
        : "حُفظ أثر للرقم يكفي للمطابقة فقط، ولا يمكن عرضه لاحقاً.");
    } catch {
      setMessage("تعذّر الحفظ.");
    } finally {
      setBusy(false);
    }
  }

  async function reveal() {
    setBusy(true); setMessage(null);
    try {
      const { res, body } = await call(contractId, { reveal: true });
      if (!res.ok || typeof body.nationalId !== "string") {
        setMessage(typeof body.error === "string" ? body.error : "تعذّر عرض الرقم.");
        return;
      }
      setShown(body.nationalId);
    } catch {
      setMessage("تعذّر عرض الرقم.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("حذف رقم هوية الطرف الآخر من هذا العقد؟")) return;
    setBusy(true); setMessage(null); setShown(null);
    try {
      const { res, body } = await call(contractId, { method: "DELETE" });
      if (!res.ok) { setMessage(typeof body.error === "string" ? body.error : "تعذّر الحذف."); return; }
      setLoad({ kind: "ready", status: body as unknown as Status });
    } catch {
      setMessage("تعذّر الحذف.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${card} p-4`} dir="rtl">
      <h2 className={`flex items-center gap-2 text-[13px] font-bold mb-1 ${title}`}>
        <IdentificationCard size={16} className="text-[#C8A762]" />
        رقم هوية الطرف الآخر (فرد)
      </h2>
      <p className={`text-[11.5px] mb-3 ${muted}`}>
        يُحفظ محمياً ولا يظهر إلا لك بصفتك كاتب العقد، ويُسجَّل كل اطلاع عليه.
      </p>

      {load.kind === "unavailable" ? (
        <p className={`text-[12px] ${muted}`}>هذه الخانة غير متاحة بعد — قريباً.</p>
      ) : load.kind === "error" ? (
        <p className={`text-[12px] ${muted}`}>تعذّرت قراءة حالة الرقم. <button type="button" className="font-bold text-royal hover:underline" onClick={() => void refresh()}>إعادة المحاولة</button></p>
      ) : (
        <div className="space-y-3">
          {load.status.stored ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[12px] font-bold ${title}`} dir="ltr">{shown ?? "••••••••••"}</span>
              {load.status.encrypted && load.status.keyConfigured && (
                shown
                  ? <button type="button" className={btn} onClick={() => setShown(null)}><EyeSlash size={13} /> إخفاء</button>
                  : <button type="button" className={btn} disabled={busy} onClick={() => void reveal()}><Eye size={13} /> عرض الرقم</button>
              )}
              <button type="button" className={btn} disabled={busy} onClick={() => void remove()}><Trash size={13} /> حذف</button>
            </div>
          ) : (
            <p className={`text-[12px] ${muted}`}>لم يُسجَّل رقم هوية للطرف الآخر.</p>
          )}
          {!load.status.keyConfigured && (
            <p className={`text-[11px] ${muted}`}>الحفظ المحمي القابل للعرض غير مفعّل بعد؛ يُحفظ الآن أثر للمطابقة فقط ولا يمكن عرض الرقم.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              maxLength={14}
              placeholder={load.status.stored ? "رقم جديد يحلّ محلّ المحفوظ" : "١٠ أرقام تبدأ بـ ١ أو ٢"}
              aria-label="رقم هوية الطرف الآخر"
              className={inputCls}
              dir="ltr"
            />
            <button type="button" className={btn} disabled={busy || !input.trim()} onClick={() => void save()}>
              {busy ? <CircleNotch size={13} className="animate-spin" /> : null} حفظ
            </button>
          </div>
        </div>
      )}
      {message && <p className={`mt-2 text-[11.5px] ${muted}`}>{message}</p>}
    </div>
  );
}

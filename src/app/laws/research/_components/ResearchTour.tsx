"use client";

/**
 * «جولة في الواجهة» (owner file 11 item 2, V3 phase A3): the guidance that used
 * to sit inside the answer («المصادر — اضغط مصدراً…») moves into a closable
 * four-card spotlight tour. The prototype's cards 3–4 described listening and
 * attachments, which are not built (phases C/D/F); these four describe what
 * the page does today. «إغلاق وعدم الإظهار» is remembered in this browser
 * (try/catch: a blocked storage only means the tour may show again).
 */
import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import { X } from "@phosphor-icons/react";

export const TOUR_HIDDEN_KEY = "nzamy_research_tour_hidden_v1";

export const TOUR_STEPS = [
  {
    target: "sources",
    title: "مصادر الإجابة وحالة سريانها",
    desc: "كل رقم في الإجابة وكل مصدر تحتها يفتح النص الرسمي وحالة سريانه في لوحة جانبية دون مغادرة إجابتك، ومنها تسأل عنه أو تحفظه في مسودة التجميع.",
  },
  {
    target: "answer",
    title: "ظلّل أي عبارة لتسأل عنها",
    desc: "ظلّل جملة من الإجابة ليظهر شريط «اسأل عن الجزئية» و«الدفوع المضادة»، فيكتب السؤال في خانة البحث لتراجعه قبل الإرسال.",
  },
  {
    target: "actions",
    title: "النسخ وملف Word والصائغ",
    desc: "انسخ الإجابة صافية بلا أرقام المصادر، أو صدّرها ملف Word، أو أرسلها إلى الصائغ القانوني إن كان متاحاً لحسابك.",
  },
  {
    target: "composer",
    title: "نطاق البحث وسؤالك",
    desc: "اختر نطاق البحث: المكتبة كلها أو الأنظمة أو المبادئ، ثم اكتب سؤالك. تتابع مراحل البحث حيّة أثناء العمل، وتنطوي في «خطوات البحث» عند وصول الجواب.",
  },
] as const;

export function readTourHidden(): boolean {
  try {
    return window.localStorage.getItem(TOUR_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeTourHidden(): void {
  try {
    window.localStorage.setItem(TOUR_HIDDEN_KEY, "1");
  } catch {
    /* storage blocked: the tour may show again next time */
  }
}

type Box = { top: number; left: number; width: number; height: number } | null;

export function ResearchTour({ open, onClose, isDark }: { open: boolean; onClose: () => void; isDark: boolean }) {
  const [idx, setIdx] = useState(0);
  const [box, setBox] = useState<Box>(null);
  const step = TOUR_STEPS[idx];

  useEffect(() => { if (open) setIdx(0); }, [open]);

  const measure = useCallback(() => {
    const el = document.querySelector<HTMLElement>(`[data-research="${step.target}"]`);
    if (!el) return setBox(null);
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return setBox(null);
    setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step.target]);

  useLayoutEffect(() => {
    if (!open) return;
    document.querySelector<HTMLElement>(`[data-research="${step.target}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    measure();
    const t = window.setTimeout(measure, 350);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step.target, measure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const cardW = 340;
  const pad = 6;
  let cardStyle: CSSProperties = { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: `min(${cardW}px, calc(100vw - 24px))` };
  if (box && typeof window !== "undefined") {
    const below = window.innerHeight - (box.top + box.height) > 200;
    const top = below ? Math.min(window.innerHeight - 190, box.top + box.height + 14) : Math.max(12, box.top - 190);
    const left = Math.max(12, Math.min(window.innerWidth - Math.min(cardW, window.innerWidth - 24) - 12, box.left + box.width - cardW));
    cardStyle = { top, left, width: `min(${cardW}px, calc(100vw - 24px))` };
  }
  const last = idx === TOUR_STEPS.length - 1;
  const btn = "transition-transform motion-safe:active:scale-[0.97]";

  return (
    <div className="fixed inset-0 z-[90]" dir="rtl">
      <div className="absolute inset-0 bg-black/25" onClick={onClose} aria-hidden="true" />
      {box && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-2xl transition-all duration-300"
          style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2, boxShadow: "0 0 0 2px #C8A762, 0 0 0 9999px rgba(0,0,0,0.18)" }}
        />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="research-tour-title"
        className={`absolute space-y-2.5 rounded-2xl border p-4 shadow-2xl ${isDark ? "border-[#C8A762]/45 bg-[#11171a] text-zinc-100" : "border-[#C8A762]/50 bg-white text-slate-800"}`}
        style={cardStyle}
      >
        <div className="flex items-center justify-between">
          <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: "rgba(200,167,98,0.14)", color: "#C8A762" }}>
            خطوة {["١", "٢", "٣", "٤"][idx]} من ٤
          </span>
          <button type="button" onClick={onClose} aria-label="إغلاق الجولة" className={`rounded-lg border p-1 ${btn} ${isDark ? "border-white/10" : "border-slate-200"}`}>
            <X size={12} />
          </button>
        </div>
        <h4 id="research-tour-title" className="text-[14px] font-bold">{step.title}</h4>
        <p className={`text-[12.5px] leading-relaxed ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{step.desc}</p>
        <div className="flex items-center justify-between pt-1">
          <button type="button" onClick={() => { writeTourHidden(); onClose(); }} className={`text-[12px] hover:underline ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
            إغلاق وعدم الإظهار
          </button>
          <div className="flex items-center gap-1.5">
            {idx > 0 && (
              <button type="button" onClick={() => setIdx((i) => i - 1)} className={`rounded-xl border px-3 py-1.5 text-[12px] font-semibold ${btn} ${isDark ? "border-white/10" : "border-slate-200"}`}>
                السابق
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? onClose() : setIdx((i) => i + 1))}
              className={`rounded-xl px-3.5 py-1.5 text-[12px] font-bold text-white ${btn}`}
              style={{ background: "#0B3D2E" }}
            >
              {last ? "تم" : "التالي"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

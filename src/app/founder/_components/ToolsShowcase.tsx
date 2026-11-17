"use client";

import { useState } from "react";
import { Tabs } from "./Tabs";

/**
 * «مخرج مستقل واحد» — a glimpse of three of the four professional tools, as
 * in the owner's prototype: the contract professional (a risky clause and its
 * proposed replacement), the decisive opinion (its outline), the
 * comprehensive simulator (two expected objections with their weight).
 * Direction support joins «فور إطلاقها».
 */

function ContractPreview() {
  const [accepted, setAccepted] = useState(false);
  return (
    <div>
      {!accepted ? (
        <div className="mb-3 rounded-2xl border border-[#F0B8B2] bg-[#FBE9E7] px-[18px] py-3.5 text-[#14261F]" data-light-surface>
          <small className="block text-[13px] text-[#4B6158]">بند في العقد القائم · خطر مرتفع</small>
          <span className="line-through decoration-[#B3261E]">
            يحق للطرف الأول إنهاء العقد في أي وقت دون إشعار ودون أي تعويض للطرف الثاني.
          </span>
        </div>
      ) : (
        <div className="mb-3 rounded-2xl border border-[#A8D5B5] bg-[#E3F3E8] px-[18px] py-3.5 text-[#14261F]" data-light-surface>
          <small className="block text-[13px] text-[#4B6158]">البند البديل المقترح · متوافق مع النظام</small>
          يحق لأي من الطرفين إنهاء العقد بإشعار كتابي مدته ثلاثون يوماً، وتُسوّى المستحقات المترتبة حتى تاريخ الإنهاء.
        </div>
      )}
      <button
        type="button"
        onClick={() => setAccepted(true)}
        disabled={accepted}
        className="inline-flex min-h-[46px] items-center rounded-full bg-gradient-to-l from-[#E6CD8E] to-[#C8A762] px-6 py-3 font-bold text-[#2A1F07] disabled:opacity-80"
      >
        {accepted ? "تم الاعتماد" : "اقبل التعديل"}
      </button>
      <p className="mt-2.5 text-sm text-[#BFD3C9]">الحذف باللون الأحمر والإحلال بالأخضر، وأنت من يعتمد كل تعديل.</p>
    </div>
  );
}

const OUTLINE = [
  "تحديد المسألة القانونية والسؤال المطروح",
  "النصوص النظامية ولوائحها الحاكمة",
  "السوابق والمبادئ القضائية ذات الصلة",
  "أقوال الفقهاء عند الحاجة",
  "الخلاصة والتوصية المؤصّلة لتقديمها لموكلك",
];

function OpinionPreview() {
  return (
    <ol className="list-decimal pe-0 ps-5 text-[#F2F5F1]">
      {OUTLINE.map((line) => (
        <li key={line} className="border-b border-dashed border-white/20 py-1.5">
          {line}
        </li>
      ))}
    </ol>
  );
}

function SimulatorPreview() {
  const rows: Array<[string, number]> = [
    ["دفع متوقع من الخصم: سقوط الحق بالتقادم", 72],
    ["سؤال متوقع من الدائرة: ما سند الصفة؟", 48],
  ];
  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map(([text, w]) => (
          <div key={text} className="rounded-2xl bg-[#102F26] p-3.5 text-[#F2F5F1]">
            {text}
            <div className="mt-2.5 h-2 overflow-hidden rounded bg-white/15">
              <i className="block h-full bg-[#C8A762]" style={{ width: `${w}%` }} />
            </div>
            <small className="text-[#BFD3C9]">درجة الخطورة على ملفك</small>
          </div>
        ))}
      </div>
      <p className="mt-3.5 text-sm text-[#BFD3C9]">وتنضم أداة «داعم الاتجاه» إلى خياراتك فور إطلاقها.</p>
    </div>
  );
}

export function ToolsShowcase() {
  return (
    <Tabs
      tone="dark"
      label="أدوات المحترفين"
      items={[
        { id: "contracts", label: "محترف العقود", panel: <ContractPreview /> },
        { id: "opinion", label: "الرأي الفصل", panel: <OpinionPreview /> },
        { id: "simulator", label: "المحاكي الشامل", panel: <SimulatorPreview /> },
      ]}
    />
  );
}

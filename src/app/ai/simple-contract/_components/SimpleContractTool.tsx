"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowCounterClockwise, FileText, Info, PencilSimpleLine } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useAiRun } from "@/hooks/useAiRun";
import { useToolUsable } from "@/hooks/useToolUsable";
import { useToolDraft } from "@/hooks/useToolDraft";
import DashboardComingSoon from "@/components/ui/DashboardComingSoon";
import AiResultActions from "@/components/AiResultActions";
import CitationCheckList from "@/components/ai/CitationCheckList";
import { AiThinkingStage } from "@/components/ai/AiThinkingStage";
import { RUN_HELD_MESSAGE_AR } from "@/lib/ai/runPageView";
import { aiToolLabelAr } from "@/lib/ai/toolLabels";
import { arabicPoints, pointsNounAr } from "@/lib/ai/toolPointsDisplay";
import { draftText as draftField, draftTextMap } from "@/lib/payments/topUpDraft";
import {
  SIMPLE_CONTRACT_LINK_LABEL_AR,
  SIMPLE_CONTRACT_NOTICE_AR,
  SIMPLE_CONTRACT_SERVICES_HREF,
  SIMPLE_CONTRACT_TOOL,
  simpleContractText,
} from "@/lib/ai/simpleContract";
import { contractTypes, type ContractType } from "@/app/ai/contract-drafter/_components/contractTypes";
import { asContractDraft, contractDraftFields } from "@/app/ai/contract-drafter/_components/contractDraft";
import type { SimpleContractAudience } from "../_audience";

/**
 * «صائغ العقود المبسّط» (owner ١٢٣): one screen — the contract's type, its
 * details, then the draft. The six types and their fields are the L11 form's
 * (contractTypes.ts); the server checks the input again and charges the price
 * shown here (expectedPrice). The guidance line and the link to
 * /services/contracts come from the app, under every draft and in every copy.
 */

const TOOL_NAME = aiToolLabelAr(SIMPLE_CONTRACT_TOOL);

export default function SimpleContractTool({ audience, price }: { audience: SimpleContractAudience; price: number | null }) {
  const { isDark } = useTheme();
  if (audience === "lawyer") {
    return (
      <Notice isDark={isDark} title={TOOL_NAME}>
        هذه الأداة للأفراد والمنشآت. لصياغة العقود في حسابك استعمل{" "}
        <Link href="/ai/contracts" className="font-bold underline">محترف العقود</Link>.
      </Notice>
    );
  }
  if (audience === "other") {
    return (
      <Notice isDark={isDark} title={TOOL_NAME}>
        هذه الأداة غير متاحة لنوع حسابك. يمكنك طلب صياغة عقدك من محامٍ في المنصة:{" "}
        <Link href={SIMPLE_CONTRACT_SERVICES_HREF} className="font-bold underline">{SIMPLE_CONTRACT_LINK_LABEL_AR}</Link>.
      </Notice>
    );
  }
  return <SimpleContractGate price={price} />;
}

function SimpleContractGate({ price }: { price: number | null }) {
  const { isDark } = useTheme();
  const usable = useToolUsable(SIMPLE_CONTRACT_TOOL);
  if (usable === null) {
    return <p role="status" dir="rtl" className={`py-16 text-center text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>جارٍ التحقق…</p>;
  }
  if (!usable) {
    return (
      <div dir="rtl">
        <DashboardComingSoon
          title={`${TOOL_NAME} — قريباً`}
          description="اختر نوع العقد واكتب بياناته، فتصلك مسوّدة عقد مبسّطة بلغة واضحة. لم تُتح الأداة بعد."
          backHref="/ai"
        />
        <p className={`-mt-8 pb-12 text-center text-[13px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
          إلى أن تُتاح يمكنك{" "}
          <Link href={SIMPLE_CONTRACT_SERVICES_HREF} className="font-bold underline">طلب صياغة عقد من محامٍ في المنصة</Link>.
        </p>
      </div>
    );
  }
  return <SimpleContractForm price={price} />;
}

function SimpleContractForm({ price }: { price: number | null }) {
  const { isDark } = useTheme();
  const router = useRouter();
  const run = useAiRun();
  const [type, setType] = useState<ContractType | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [agreed, setAgreed] = useState(false);

  // Back from a top-up: the chosen type and its fields (the box is ticked again by the user).
  // Literal ids (= SIMPLE_CONTRACT_TOOL) so toolDraftEveryTool.test.ts pairs this restore with the start below.
  useToolDraft("simple-contract", (d) => {
    const id = draftField(d, "type_id");
    const ct = id ? contractTypes.find((t) => t.id === id) : undefined;
    if (!ct) return;
    setType(ct);
    setForm(draftTextMap(d, "form") ?? {});
  });

  const draft = run.phase === "done" ? asContractDraft(run.output) : null;
  const filled = !!type && type.fields.every((f) => !f.required || !!form[f.id]?.trim());
  const canRun = filled && agreed && price !== null && !run.busy;

  const card = `rounded-2xl border p-5 sm:p-6 ${isDark ? "border-white/10 bg-zinc-900/60" : "border-zinc-200 bg-white"}`;
  const muted = isDark ? "text-zinc-400" : "text-zinc-500";
  const inputCls = `w-full rounded-xl border px-3 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-[#0B3D2E] ${
    isDark ? "border-white/10 bg-zinc-800 text-white placeholder:text-zinc-500" : "border-zinc-200 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400"
  }`;

  function generate() {
    if (!type || !canRun || price === null) return;
    void run.start(
      "simple-contract",
      { type: type.id, fields: contractDraftFields(type.fields, form) },
      { expectedPrice: price },
      { type_id: type.id, form },
    );
  }

  function restart() {
    run.reset();
    setType(null);
    setForm({});
    setAgreed(false);
  }

  if (draft) {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return (
      <div dir="rtl" className="mx-auto max-w-3xl space-y-5 px-4 py-8">
        <header className="space-y-1">
          <p className={`text-[12px] font-bold ${muted}`}>{TOOL_NAME}</p>
          <h1 className="text-2xl font-black">{draft.title}</h1>
          {run.chargedPoints > 0 && (
            <p className={`text-[12px] ${muted}`}>
              خُصم {arabicPoints(run.chargedPoints)} {pointsNounAr(run.chargedPoints)}
            </p>
          )}
        </header>
        <article className={`${card} space-y-4 text-[15px] leading-loose`}>
          {draft.preamble && <p className="whitespace-pre-wrap">{draft.preamble}</p>}
          {draft.sections.map((s, i) => (
            <section key={i}>
              <h2 className="mb-1 font-bold">{s.heading}</h2>
              <p className="whitespace-pre-wrap">{s.body}</p>
            </section>
          ))}
        </article>
        <SimpleContractNotice isDark={isDark} />
        {draft.citation_check.length > 0 && (
          <CitationCheckList
            items={draft.citation_check}
            isDark={isDark}
            title="المواد النظامية التي استند إليها العقد"
            empty="لم يستند العقد إلى مواد بعينها"
          />
        )}
        <AiResultActions
          text={simpleContractText(draft, origin)}
          filename="nzamy-simple-contract"
          title={draft.title}
          showCollector={false}
          showSaveToCase={false}
          runId={run.runId}
        />
        <button
          type="button"
          onClick={restart}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold ${isDark ? "bg-white/5 text-zinc-300 hover:bg-white/10" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}
        >
          <ArrowCounterClockwise size={16} /> عقد جديد
        </button>
      </div>
    );
  }

  return (
    <div dir="rtl" className="mx-auto max-w-3xl space-y-5 px-4 py-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <PencilSimpleLine size={22} weight="duotone" className="text-[#0B3D2E] dark:text-emerald-400" />
          <h1 className="text-2xl font-black">{TOOL_NAME}</h1>
        </div>
        <p className={`text-[14px] leading-relaxed ${muted}`}>
          اختر نوع العقد واكتب بياناته، فتصلك مسوّدة عقد مبسّطة بلغة واضحة. ما لا تذكره يُترك فراغاً لتكمله بنفسك.
        </p>
      </header>

      <section className={card} aria-labelledby="sc-type">
        <h2 id="sc-type" className="mb-3 text-[15px] font-bold">نوع العقد</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {contractTypes.map((ct) => {
            const on = type?.id === ct.id;
            return (
              <button
                key={ct.id}
                type="button"
                aria-pressed={on}
                disabled={run.busy}
                onClick={() => {
                  if (type?.id !== ct.id) {
                    setType(ct);
                    setForm({});
                    run.reset();
                  }
                }}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-start text-[13px] font-bold transition-colors ${
                  on
                    ? "border-[#0B3D2E] bg-[#0B3D2E] text-white"
                    : isDark ? "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10" : "border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-zinc-100"
                }`}
              >
                <ct.icon size={18} weight="duotone" />
                {ct.labelAr}
              </button>
            );
          })}
        </div>
      </section>

      {type && (
        <section className={card} aria-labelledby="sc-fields">
          <h2 id="sc-fields" className="mb-1 text-[15px] font-bold">بيانات {type.labelAr}</h2>
          <p className={`mb-4 text-[12px] ${muted}`}>{type.descAr}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {type.fields.map((f) => {
              const id = `sc-field-${f.id}`;
              const value = form[f.id] ?? "";
              const set = (v: string) => setForm((p) => ({ ...p, [f.id]: v }));
              return (
                <div key={f.id} className={f.type === "textarea" ? "sm:col-span-2" : ""}>
                  <label htmlFor={id} className="mb-1.5 block text-[13px] font-bold">
                    {f.labelAr}
                    {f.required && <span className="ms-1 text-rose-600" aria-hidden="true">*</span>}
                  </label>
                  {f.type === "select" ? (
                    <select id={id} aria-required={f.required || undefined} value={value} onChange={(e) => set(e.target.value)} className={inputCls}>
                      <option value="">اختر…</option>
                      {f.options?.map((o) => <option key={o.en} value={o.ar}>{o.ar}</option>)}
                    </select>
                  ) : f.type === "textarea" ? (
                    <textarea id={id} rows={3} maxLength={2000} value={value} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} className={`${inputCls} resize-none`} />
                  ) : (
                    <input id={id} aria-required={f.required || undefined} type={f.type} maxLength={2000} value={value} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} className={inputCls} />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {type && (
        <section className={`${card} space-y-4`}>
          <label className="flex items-start gap-2 text-[13px] leading-relaxed">
            <input type="checkbox" className="mt-1" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>أفهم أن ما سأحصل عليه نموذج مبسّط استرشادي، ولا يغني عن عقد احترافي يراجعه محامٍ.</span>
          </label>
          {price === null ? (
            <p role="alert" className="text-[13px] font-bold text-rose-600">تعذّر عرض التكلفة الآن — حدّث الصفحة بعد قليل.</p>
          ) : (
            <p className={`text-[13px] ${muted}`}>
              التكلفة: <strong>{arabicPoints(price)} {pointsNounAr(price)}</strong>، وتُعاد إليك إن لم تكتمل الصياغة.
            </p>
          )}
          {run.phase === "error" && run.error && (
            <div role="alert" className={`rounded-xl border px-4 py-3 text-[13px] ${isDark ? "border-red-900/40 bg-red-900/10 text-red-400" : "border-red-200 bg-red-50 text-red-700"}`}>
              {run.error}
              {run.code === "price_changed" && (
                <button type="button" onClick={() => { run.reset(); router.refresh(); }} className="ms-2 font-bold underline">
                  اعرض التكلفة الجديدة
                </button>
              )}
            </div>
          )}
          {run.phase === "review" && (
            <p role="status" className={`rounded-xl border px-4 py-3 text-[13px] ${isDark ? "border-amber-900/40 bg-amber-900/10 text-amber-400" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
              {RUN_HELD_MESSAGE_AR}
            </p>
          )}
          {(run.busy || run.phase === "error") && <AiThinkingStage run={run} isDark={isDark} toolLabel={TOOL_NAME} />}
          <button
            type="button"
            disabled={!canRun}
            onClick={generate}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-6 py-3 text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileText size={18} weight="duotone" />
            {run.busy ? "جارٍ كتابة العقد…" : "اكتب العقد"}
          </button>
        </section>
      )}

      <SimpleContractNotice isDark={isDark} />
    </div>
  );
}

/** The owner's fixed line «استرشادي» and the link to order a professional contract (owner ١٢٣, [25][67]). */
function SimpleContractNotice({ isDark }: { isDark: boolean }) {
  return (
    <aside
      role="note"
      className={`flex gap-3 rounded-2xl border p-4 text-[13px] leading-relaxed ${
        isDark ? "border-amber-900/40 bg-amber-900/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <Info size={20} weight="duotone" className="mt-0.5 shrink-0" />
      <p>
        {SIMPLE_CONTRACT_NOTICE_AR}{" "}
        <Link href={SIMPLE_CONTRACT_SERVICES_HREF} className="font-bold underline">
          {SIMPLE_CONTRACT_LINK_LABEL_AR}
        </Link>
      </p>
    </aside>
  );
}

function Notice({ isDark, title, children }: { isDark: boolean; title: string; children: React.ReactNode }) {
  return (
    <div dir="rtl" className="mx-auto max-w-2xl px-4 py-16">
      <div className={`rounded-2xl border p-6 text-[14px] leading-relaxed ${isDark ? "border-white/10 bg-zinc-900/60 text-zinc-200" : "border-zinc-200 bg-white text-zinc-800"}`}>
        <h1 className="mb-2 text-xl font-black">{title}</h1>
        <p>{children}</p>
      </div>
    </div>
  );
}

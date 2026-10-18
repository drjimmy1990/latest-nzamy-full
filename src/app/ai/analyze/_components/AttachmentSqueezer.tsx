"use client";

// «عصارة المرفقات» (the lawyer/firm half of /ai/analyze) — honesty gate
// (owner answer ١١٥).
//
// WHAT THIS COMPONENT WAS: an upload step, three questions built from the file
// names, then a four-second "squeeze" after which it showed the same report
// for any files: fixed page/fact/date/gap counters, two "admissions" with
// quotes, two "contradictions", a timeline with a 150,000-riyal transfer, two
// weaknesses and two articles of نظام الإثبات — all literals. Its export
// button wrote that same fixed report, as markdown, into the lawyer's research
// collector (/ai/collector), where it then sat beside real research as if it
// had been extracted from his case.
//
// Gated here rather than in page.tsx because the same route serves the client
// analyzer (SmartAnalyzer), which this does not touch. So that the gate does
// not hide behind page.tsx (the honesty tests key off it), the lawyer tool is
// «قريباً» everywhere else too: `comingSoon` on "ai:analyze" in
// lawyerAiCatalog.ts, no price on /pricing, no quick-access tile, and the
// lawyer and firm sidebar rows badged «قريباً» (cannedOutputGate.test.ts).
// With the report gone there is nothing left to export, so the collector
// write is gone with it.
//
// ClientMediaPanel.tsx and InputPhase.tsx beside this file were used only by
// the old flow; they stay on disk (owner decision ٤) and leave the bundle.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function AttachmentSqueezer() {
  return (
    <DashboardComingSoon
      title="عصارة المرفقات"
      description="عصارة المرفقات غير متاحة حالياً وستُفعَّل قريباً. كان التقرير الذي يظهر هنا (الإقرارات والتناقضات والخط الزمني والنصوص النظامية) أمثلة ثابتة لا استخراجاً من مرفقاتك، لذلك أُوقفت الأداة ولم يعد يُضاف شيء منها إلى المجمع البحثي."
      backHref="/ai"
    />
  );
}

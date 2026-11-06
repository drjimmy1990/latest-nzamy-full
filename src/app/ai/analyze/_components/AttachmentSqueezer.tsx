"use client";

// «عصارة المرفقات» (the lawyer/firm half of /ai/analyze).
//
// WHAT THIS WAS: a fixed report (owner answer ١١٥), then a «قريباً» card after
// that report was removed. It is now the real case-brief job: the same studio
// that ran at /ai/case-brief, with the same tool id, price and file rules. The
// old URL answers 301 to /ai/analyze (src/proxy.ts).
//
// ClientMediaPanel.tsx and InputPhase.tsx beside this file were used only by
// the old flow; they stay on disk (owner decision ٤) and leave the bundle.

import CaseBriefStudio from "@/components/ai/caseBrief/CaseBriefStudio";

export default function AttachmentSqueezer() {
  return <CaseBriefStudio />;
}

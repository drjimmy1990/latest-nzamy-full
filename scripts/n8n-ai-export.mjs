#!/usr/bin/env node
/**
 * n8n-ai-export.mjs — writes one importable file per AI tool workflow,
 * n8n/ai/<tool>.json, from n8n/ai/workflows.mjs (the single source), and the
 * Sayegh v2 staging workflow, n8n/ai/legal-drafter-v2.json, from
 * n8n/ai/legalDrafterV2.mjs. Import in n8n: Workflows → Import from File, then
 * re-select the credentials.
 *
 *   node scripts/n8n-ai-export.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AI_WORKFLOWS, toWorkflow } from "../n8n/ai/workflows.mjs";
import { toLegalDrafterV2Workflow } from "../n8n/ai/legalDrafterV2.mjs";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "n8n", "ai");
for (const def of AI_WORKFLOWS) {
  const file = path.join(dir, `${def.tool}.json`);
  fs.writeFileSync(file, `${JSON.stringify(toWorkflow(def), null, 2)}\n`);
  console.log("wrote", path.relative(process.cwd(), file));
}

// Sayegh v2 (staging): kept out of AI_WORKFLOWS, which mirrors the app's tool registry.
const v2 = path.join(dir, "legal-drafter-v2.json");
fs.writeFileSync(v2, `${JSON.stringify(toLegalDrafterV2Workflow(), null, 2)}\n`);
console.log("wrote", path.relative(process.cwd(), v2));

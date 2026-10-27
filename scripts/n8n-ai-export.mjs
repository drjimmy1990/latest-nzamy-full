#!/usr/bin/env node
/**
 * n8n-ai-export.mjs — writes one importable file per AI tool workflow,
 * n8n/ai/<tool>.json, from n8n/ai/workflows.mjs (the single source). Import
 * in n8n: Workflows → Import from File, then re-select the two credentials.
 *
 *   node scripts/n8n-ai-export.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { AI_WORKFLOWS, toWorkflow } from "../n8n/ai/workflows.mjs";

const dir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "n8n", "ai");
for (const def of AI_WORKFLOWS) {
  const file = path.join(dir, `${def.tool}.json`);
  fs.writeFileSync(file, `${JSON.stringify(toWorkflow(def), null, 2)}\n`);
  console.log("wrote", path.relative(process.cwd(), file));
}

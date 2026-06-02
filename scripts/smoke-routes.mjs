import { execFileSync, spawn } from "node:child_process";
import path from "node:path";

const DEFAULT_PORT = process.env.SMOKE_PORT || "3210";
const DEFAULT_BASE_URL = `http://127.0.0.1:${DEFAULT_PORT}`;
let baseUrl = process.env.SMOKE_BASE_URL || DEFAULT_BASE_URL;
let shouldStartServer = !process.env.SMOKE_BASE_URL;
const REQUEST_TIMEOUT_MS = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS || 30000);
const START_TIMEOUT_MS = Number(process.env.SMOKE_START_TIMEOUT_MS || 120000);

const ROUTES = [
  "/",
  "/about",
  "/academy",
  "/academy/certificates",
  "/academy/my-courses",
  "/academy/quiz",
  "/blog",
  "/blog/wrongful-termination-rights",
  "/community",
  "/community/ask",
  "/community/public",
  "/contact",
  "/faq",
  "/join",
  "/lawyers",
  "/lawyers/browse",
  "/media",
  "/partners",
  "/precedents",
  "/pro",
  "/services",
  "/services/arbitration",
  "/services/business",
  "/services/business/company-formation",
  "/services/business/trademark",
  "/services/cases",
  "/services/collection",
  "/services/consultations",
  "/services/contracts",
  "/services/corporate",
  "/services/corporate/governance",
  "/services/corporate/health-check",
  "/services/corporate/seconded-counsel",
  "/services/creators",
  "/services/individuals",
  "/services/labor",
  "/services/lawyers",
  "/services/lawyers/vault",
  "/services/legal-representation",
  "/services/notary",
  "/services/tracking",
  "/pricing",
  "/register",
  "/security",
  "/marketplace",
  "/marketplace/collaborate",
  "/marketplace/post",
  "/promo/test-promo-slug",
  "/ai",
  "/ai/analyze",
  "/ai/analyze-strength",
  "/ai/assistant",
  "/ai/brief-check",
  "/ai/case-brief",
  "/ai/communicate",
  "/ai/compare",
  "/ai/consult",
  "/ai/contracts",
  "/ai/contract-drafter",
  "/ai/collector",
  "/ai/debt-collection",
  "/ai/direction-support",
  "/ai/draft",
  "/ai/fee-calculator",
  "/ai/legal-opinion",
  "/ai/legal-translate",
  "/ai/micro",
  "/ai/monitor",
  "/ai/najiz-optimizer",
  "/ai/ngo/donation-analyzer",
  "/ai/ngo/report-generator",
  "/ai/ngo/volunteer-contract",
  "/ai/procedures",
  "/ai/quick-answer",
  "/ai/report-generator",
  "/ai/secretary",
  "/ai/smart-inspector",
  "/ai/templates",
  "/ai/transcriber",
  "/ai/wargaming",
  "/ai/corp/advisor",
  "/ai/corp/clm",
  "/ai/corp/compliance",
  "/ai/corp/compliance-monitor",
  "/ai/corp/contracts",
  "/ai/corp/corpmind",
  "/ai/corp/deal-intel",
  "/ai/corp/hr",
  "/ai/corp/monitor",
  "/ai/corp/privacy",
  "/ai/corp/risk-assessment",
  "/ai/gov/arrest-forms",
  "/ai/gov/compliance-checker",
  "/ai/gov/contract-reviewer",
  "/ai/gov/deadline-calculator",
  "/ai/gov/detention-records",
  "/ai/gov/evidence-analyzer",
  "/ai/gov/guarantees-checker",
  "/ai/gov/incident-report",
  "/ai/gov/indictment-drafter",
  "/ai/gov/investigation-forms",
  "/ai/gov/judgment-drafter",
  "/ai/gov/judgment-weigher",
  "/ai/gov/judicial-search",
  "/ai/gov/jurisdiction-analyzer",
  "/ai/gov/legal-opinion-drafter",
  "/ai/gov/procedure-guide",
  "/ai/gov/procurement-reviewer",
  "/ai/gov/rights-reminder",
  "/ai/gov/verdict-drafter",
  "/dashboard/admin/subscriptions/coupons",
  "/dashboard/business",
  "/dashboard/client",
  "/dashboard/client/requests",
  "/dashboard/client/wallet",
  "/dashboard/firm",
  "/dashboard/lawyer/archive",
  "/dashboard/lawyer/cases",
  "/dashboard/lawyer/clients",
  "/dashboard/lawyer/contracts",
  "/dashboard/lawyer/documents",
  "/dashboard/lawyer/promotions",
  "/dashboard/ngo",
  "/dashboard/provider",
  "/dashboard/provider/requests",
  "/dashboard/provider/promotions",
  "/dashboard/government",
  "/dashboard/micro",
  "/dashboard/business/kanban",
  "/laws",
  "/laws/civil-procedure",
  "/laws/companies-law",
  "/terms",
  "/privacy",
  "/review/abc123",
  "/robots.txt",
  "/sitemap.xml",
];

const headers = {
  Cookie: "nzamy_session=demo; nzamy_demo_role=lawyer; nzamy_user_type=lawyer",
};

let server;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      headers,
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function isServerReachable(url) {
  try {
    const response = await fetchWithTimeout(`${url}/`);
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  }
}

async function waitForServer() {
  const startedAt = Date.now();
  let lastError = "";

  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}/`);
      if (response.status >= 200 && response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(1500);
  }

  throw new Error(`Timed out waiting for ${baseUrl}. Last error: ${lastError}`);
}

function startServer() {
  const runner = process.execPath;
  const nextCli = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const args = [nextCli, "dev", "--hostname", "127.0.0.1", "--port", DEFAULT_PORT];
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };

  if (process.platform === "win32") {
    for (const key of Object.keys(env)) {
      if (!key || key.startsWith("=") || key.includes("\0")) delete env[key];
    }
  }

  server = spawn(runner, args, {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  server.stdout.on("data", (chunk) => process.stdout.write(chunk));
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));
}

function stopServer() {
  if (!server?.pid || server.killed) return;

  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      // Fall through to regular kill.
    }
  }

  server.kill("SIGTERM");
}

async function run() {
  if (shouldStartServer) {
    for (const candidate of ["http://127.0.0.1:3000", "http://localhost:3000"]) {
      if (await isServerReachable(candidate)) {
        baseUrl = candidate;
        shouldStartServer = false;
        console.log(`Using existing server at ${baseUrl}`);
        break;
      }
    }
  }

  if (shouldStartServer) {
    startServer();
    await waitForServer();
  }

  const failures = [];

  for (const route of ROUTES) {
    const url = `${baseUrl}${route}`;

    try {
      const response = await fetchWithTimeout(url);
      const ok = response.status >= 200 && response.status < 400;
      console.log(`${ok ? "OK" : "FAIL"} ${response.status} ${route}`);

      if (!ok) failures.push(`${route} returned ${response.status}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`FAIL ${route} ${message}`);
      failures.push(`${route} failed: ${message}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Smoke route failures:\n- ${failures.join("\n- ")}`);
  }
}

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (shouldStartServer) stopServer();
  });

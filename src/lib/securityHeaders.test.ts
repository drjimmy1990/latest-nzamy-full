import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://auth.nezamy.sa";
const { default: nextConfig } = await import("../../next.config.ts");

type HeaderRule = { source: string; headers: { key: string; value: string }[] };

async function rules(): Promise<HeaderRule[]> {
  assert.ok(nextConfig.headers, "next.config.ts defines headers()");
  return (await nextConfig.headers()) as HeaderRule[];
}

const valueOf = (rule: HeaderRule | undefined, key: string) => rule?.headers.find((h) => h.key === key)?.value;

test("x-powered-by is switched off", () => {
  assert.equal(nextConfig.poweredByHeader, false);
});

test("dev-server origins: loopback 127.0.0.1 only, never a wildcard or another host", () => {
  assert.deepEqual(nextConfig.allowedDevOrigins, ["127.0.0.1"]);
});

test("every path gets the security headers, from the first rule", async () => {
  const all = await rules();
  assert.equal(all[0].source, "/:path*");
  const g = all[0];
  assert.equal(valueOf(g, "Strict-Transport-Security"), "max-age=31536000; includeSubDomains");
  assert.doesNotMatch(valueOf(g, "Strict-Transport-Security") ?? "", /preload/);
  assert.equal(valueOf(g, "X-Frame-Options"), "DENY");
  assert.equal(valueOf(g, "X-Content-Type-Options"), "nosniff");
  assert.equal(valueOf(g, "Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(valueOf(g, "Content-Security-Policy"), undefined, "no enforcing CSP yet");
  assert.ok(valueOf(g, "Content-Security-Policy-Report-Only"));
});

test("/track/:token keeps no-referrer, after the global rule", async () => {
  const all = await rules();
  const trackIndex = all.findIndex((r) => r.source === "/track/:token");
  assert.ok(trackIndex > 0);
  assert.equal(valueOf(all[trackIndex], "Referrer-Policy"), "no-referrer");
});

test("the report-only policy lists the sources the site loads", async () => {
  const csp = valueOf((await rules())[0], "Content-Security-Policy-Report-Only") ?? "";
  const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";
  assert.match(directive("default-src"), /'self'/);
  assert.match(directive("connect-src"), /https:\/\/auth\.nezamy\.sa/);
  assert.match(directive("connect-src"), /wss:\/\/auth\.nezamy\.sa/);
  assert.match(directive("connect-src"), /https:\/\/api\.moyasar\.com/);
  assert.match(directive("script-src"), /https:\/\/challenges\.cloudflare\.com/);
  assert.match(directive("frame-src"), /https:\/\/www\.youtube-nocookie\.com/);
  assert.match(directive("frame-src"), /https:\/\/www\.google\.com/);
  assert.match(directive("frame-src"), /https:\/\/auth\.nezamy\.sa/);
  assert.equal(directive("object-src"), "object-src 'none'");
  assert.equal(directive("frame-ancestors"), "frame-ancestors 'none'");
  assert.doesNotMatch(csp, /[\r\n]/);
});

test("Permissions-Policy: no camera or location, microphone and payment for our own pages", async () => {
  const pp = valueOf((await rules())[0], "Permissions-Policy") ?? "";
  assert.match(pp, /(^|, )camera=\(\)/);
  assert.match(pp, /(^|, )geolocation=\(\)/);
  // voice input (SpeechRecognition) needs the microphone on our own pages
  assert.match(pp, /(^|, )microphone=\(self\)/);
  assert.match(pp, /(^|, )payment=\(self "https:\/\/pay\.google\.com"\)/);
  assert.doesNotMatch(pp, /[\r\n]/);
});

test("analytics hosts are in the policy only when their env id is set at build", async () => {
  const csp = valueOf((await rules())[0], "Content-Security-Policy-Report-Only") ?? "";
  if (!process.env.NEXT_PUBLIC_GA4_ID) assert.doesNotMatch(csp, /googletagmanager|google-analytics/);
  if (!process.env.NEXT_PUBLIC_CLARITY_ID) assert.doesNotMatch(csp, /clarity\.ms|c\.bing\.com/);

  const saved = { ga: process.env.NEXT_PUBLIC_GA4_ID, cl: process.env.NEXT_PUBLIC_CLARITY_ID };
  process.env.NEXT_PUBLIC_GA4_ID = "G-TEST1234";
  process.env.NEXT_PUBLIC_CLARITY_ID = "abcdef1234";
  try {
    const { default: withIds } = await import(`../../next.config.ts?ids=${Date.now()}`);
    const all = (await withIds.headers()) as HeaderRule[];
    const on = valueOf(all[0], "Content-Security-Policy-Report-Only") ?? "";
    const directive = (name: string) => on.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";
    assert.match(directive("script-src"), /https:\/\/www\.googletagmanager\.com/);
    assert.match(directive("script-src"), /https:\/\/\*\.clarity\.ms/);
    assert.match(directive("connect-src"), /https:\/\/\*\.google-analytics\.com/);
    assert.match(directive("connect-src"), /https:\/\/\*\.analytics\.google\.com/);
    assert.match(directive("connect-src"), /https:\/\/\*\.clarity\.ms/);
    assert.match(directive("connect-src"), /https:\/\/c\.bing\.com/);
    // still report-only
    assert.equal(valueOf(all[0], "Content-Security-Policy"), undefined);
  } finally {
    if (saved.ga === undefined) delete process.env.NEXT_PUBLIC_GA4_ID;
    else process.env.NEXT_PUBLIC_GA4_ID = saved.ga;
    if (saved.cl === undefined) delete process.env.NEXT_PUBLIC_CLARITY_ID;
    else process.env.NEXT_PUBLIC_CLARITY_ID = saved.cl;
  }
});

test("batch l9 (file 15 row 43): the report-only policy reports to our endpoint; still not enforcing", async () => {
  const g = (await rules())[0];
  const csp = valueOf(g, "Content-Security-Policy-Report-Only") ?? "";
  const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";
  assert.equal(directive("report-uri"), "report-uri /api/v1/security/csp-report");
  assert.equal(directive("report-to"), "report-to csp-endpoint");
  assert.equal(valueOf(g, "Reporting-Endpoints"), 'csp-endpoint="/api/v1/security/csp-report"');
  assert.equal(valueOf(g, "Content-Security-Policy"), undefined, "owner register 24: report-only until the payment test + a clean week");
});

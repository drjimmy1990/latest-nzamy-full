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

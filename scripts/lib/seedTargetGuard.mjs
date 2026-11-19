/**
 * scripts/lib/seedTargetGuard.mjs — owner file 19 (batch l9-secleak): the two
 * test-account seed scripts (seed-clean-test-accounts.mjs, seed-test-lawyers.mjs)
 * re-created the 22 accounts the owner had deleted, with a shared password,
 * on the live database. They now refuse EVERY target that is not an explicit
 * local / test one — dry-run and --verify included, before any client exists:
 *
 *   1. the Supabase host must be local: localhost, 127.0.0.0/8, ::1, or a name
 *      ending in .localhost or .test (a docker-compose name such as
 *      "supabase-kong" is NOT accepted — map it to a .test name instead);
 *   2. AND the run must name it: --confirm-local-host=<that host>.
 *
 * There is no override for a public host, on purpose. The live database gets
 * its test accounts by hand (file 19 §2.1), never from these scripts.
 */

/** @param {string} host lower-case hostname, no trailing dot, IPv6 without brackets */
export function isLocalSeedHost(host) {
  if (typeof host !== "string" || host.length === 0) return false;
  const h = host.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (h === "localhost" || h === "::1") return true;
  if (/^127(\.\d{1,3}){3}$/.test(h)) return true;
  return h.endsWith(".localhost") || h.endsWith(".test");
}

/** The host of a URL as the guard compares it (lower case, no trailing dot, no brackets), or null. */
export function seedHostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  } catch {
    return null;
  }
}

/**
 * @param {string} url  NEXT_PUBLIC_SUPABASE_URL
 * @param {string[]} argv process.argv.slice(2)
 * @returns {{ ok: true, host: string } | { ok: false, host: string | null, reason: string }}
 */
export function seedTargetVerdict(url, argv) {
  const host = seedHostOf(url);
  if (!host) return { ok: false, host: null, reason: "NEXT_PUBLIC_SUPABASE_URL is not a valid URL." };
  if (!isLocalSeedHost(host)) {
    return {
      ok: false,
      host,
      reason:
        `target host ${host} is not a local/test host. These seed scripts never write to a live or shared ` +
        "database (owner file 19): only localhost, 127.x.x.x, ::1, *.localhost or *.test.",
    };
  }
  const flag = (argv || []).find((a) => typeof a === "string" && a.startsWith("--confirm-local-host="));
  const confirmed = flag ? flag.slice("--confirm-local-host=".length).trim().toLowerCase().replace(/^\[|\]$/g, "") : "";
  if (confirmed !== host) {
    return {
      ok: false,
      host,
      reason: `name the local target explicitly: --confirm-local-host=${host}`,
    };
  }
  return { ok: true, host };
}

/** Exits with code 2 (nothing read, nothing written) unless the target is an explicit local/test one. */
export function refuseUnlessLocalSeedTarget(url, argv, scriptName) {
  const verdict = seedTargetVerdict(url, argv);
  if (!verdict.ok) {
    console.error(`⛔ ${scriptName}: refusing to run — ${verdict.reason} Nothing was read or changed.`);
    process.exit(2);
  }
  return verdict.host;
}

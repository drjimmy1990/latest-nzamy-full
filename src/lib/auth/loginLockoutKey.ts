/**
 * loginLockoutKey.ts — the counter key of the sign-in lockout (batch
 * l12-access): 'i:' + sha256 of the identifier's kind and value, so the
 * table never holds a typed e-mail or mobile. Server only (node:crypto);
 * the messages and the rules are in ./loginLockout.ts.
 */
import { createHash } from "node:crypto";
import type { LoginIdentifier } from "./loginLockout.ts";

export function loginLockKey(id: LoginIdentifier): string {
  return "i:" + createHash("sha256").update(`nzamy-login:${id.kind}:${id.value}`).digest("hex");
}

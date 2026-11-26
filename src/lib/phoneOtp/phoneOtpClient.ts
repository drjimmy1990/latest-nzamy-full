/**
 * Browser half of the WhatsApp sign-up code (batch l15), for the register
 * pages: right after signUp returned a session, is this new account held
 * until its mobile is confirmed? (The switch is on and the account is new.)
 *
 * false on any failure: the page then keeps its usual last step, and the
 * proxy still sends the account to /verify-phone on its next protected page.
 */
export async function phoneOtpRequiredNow(): Promise<boolean> {
  try {
    const res = await fetch("/api/v1/auth/phone-otp/status", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as { required?: unknown; verified?: unknown } | null;
    return body?.required === true && body?.verified !== true;
  } catch {
    return false;
  }
}

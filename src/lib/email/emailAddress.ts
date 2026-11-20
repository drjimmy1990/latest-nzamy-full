/**
 * isPlainEmail: one plain address, no display name or list. Pure (no
 * sender, no env), so client-side modules may import it (batch l11: the
 * admin protection panel reached sendEmail.ts through publicViewCap.ts).
 */
export function isPlainEmail(addr: unknown): addr is string {
  return (
    typeof addr === "string" &&
    addr.length <= 254 &&
    /^[^\s@,;<>"()[\]\\]+@[^\s@,;<>"()[\]\\]+\.[^\s@,;<>"()[\]\\]+$/.test(addr)
  );
}

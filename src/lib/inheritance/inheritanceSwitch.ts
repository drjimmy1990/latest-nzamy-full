/**
 * The inheritance calculator's switch (T18-P1-39, batch l11). OFF by default:
 * `NZAMY_INHERITANCE_CALC=on` in the server env opens /ai/inheritance to
 * everyone. While it is off, only an admin sees the page (marked as a preview)
 * so the owner can review sample results before it is published (R14#70).
 * Read at request time: flipping it needs a restart, never a rebuild.
 */
export function inheritanceCalcEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.NZAMY_INHERITANCE_CALC ?? "").trim().toLowerCase() === "on";
}

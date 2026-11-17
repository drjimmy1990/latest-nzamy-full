/**
 * _restriction.ts — the pure half of /api/v1/cases/[id]/restriction
 * (N01-19, migration 20261125_40). No imports, so `node --test` loads it.
 */

/** The column / functions of 20261125_40 are not on this database yet. */
export function restrictionFeatureMissing(code: string | null | undefined): boolean {
  return code === "42703" || code === "42883" || code === "PGRST202" || code === "PGRST204";
}

/** Postgres error of public.set_case_restricted → HTTP status + Arabic. */
export function restrictionErrorResponse(code: string | null | undefined): { status: number; message: string } {
  if (restrictionFeatureMissing(code)) {
    return { status: 503, message: "تقييد القضايا غير مفعّل بعد على هذه المنصة." };
  }
  if (code === "42501") {
    return {
      status: 403,
      message: "لا يقيّد القضية أو يفتحها إلا صاحب المكتب أو الشريك المدير أو المحامي المسؤول عنها.",
    };
  }
  if (code === "22023") {
    return { status: 400, message: "التقييد للقضايا التابعة لمكتب فقط." };
  }
  if (code === "P0002") {
    return { status: 404, message: "القضية غير موجودة أو لا تملك صلاحية قراءتها." };
  }
  return { status: 500, message: "تعذّر حفظ حالة التقييد." };
}

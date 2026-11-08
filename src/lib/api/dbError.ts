import { NextResponse } from "next/server";
import { DB_ERROR_AR, dbErrorBody, logDbError } from "@/lib/api/dbErrorCore";

export { DB_ERROR_AR, logDbError } from "@/lib/api/dbErrorCore";

/**
 * Log a failed database / storage call server-side and answer the client with
 * a fixed message (SAST-06). The raw error text, code, details and hint never
 * reach the response body.
 *
 *   if (error) return dbErrorJson("chat/rooms GET", error);
 *
 * `status` defaults to 500; pass the route's existing status to keep it.
 * `message` replaces the default Arabic sentence when the route already had
 * its own fixed text. `extra` adds the route's own fields (never error text).
 *
 * Not to be confused with the route-local `dbErrorResponse` mappers in
 * lawyer/contracts, lawyer/work-sessions and research/items: those map known
 * SQLSTATE codes to {status, message} and stay as they are.
 */
export function dbErrorJson(
  tag: string,
  err: unknown,
  status = 500,
  opts: { message?: string; extra?: Record<string, unknown>; headers?: HeadersInit } = {},
): NextResponse {
  logDbError(tag, err);
  return NextResponse.json(dbErrorBody(opts.message ?? DB_ERROR_AR, opts.extra), {
    status,
    ...(opts.headers ? { headers: opts.headers } : {}),
  });
}

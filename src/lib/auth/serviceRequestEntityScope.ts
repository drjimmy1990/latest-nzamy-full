import { isSharedClientIntakePath } from "./routeAccess.ts";

export type ServiceRequestEntityKind = "firm" | "business";

export interface ServiceRequestEntityScopeInput {
  requestedScope?: unknown;
  sourcePath?: unknown;
  userType?: string | null;
  firmId: string | null;
  businessId: string | null;
}

export interface ServiceRequestEntityScope {
  firmId: string | null;
  businessId: string | null;
  error: "invalid_scope" | "unauthorized_scope" | null;
}

const EMPTY_SCOPE: ServiceRequestEntityScope = {
  firmId: null,
  businessId: null,
  error: null,
};

/**
 * Selects exactly one server-proven entity for a new request.
 *
 * A caller can choose only an entity for which the API already found an active
 * membership/ownership row. Contextual defaults never attach a personal
 * client request to an office merely because its owner also works there.
 */
export function resolveServiceRequestEntityScope(
  input: ServiceRequestEntityScopeInput,
): ServiceRequestEntityScope {
  const { requestedScope, firmId, businessId } = input;

  if (requestedScope !== undefined && requestedScope !== null && requestedScope !== "") {
    if (requestedScope !== "firm" && requestedScope !== "business") {
      return { ...EMPTY_SCOPE, error: "invalid_scope" };
    }
    if (requestedScope === "firm") {
      return firmId
        ? { firmId, businessId: null, error: null }
        : { ...EMPTY_SCOPE, error: "unauthorized_scope" };
    }
    return businessId
      ? { firmId: null, businessId, error: null }
      : { ...EMPTY_SCOPE, error: "unauthorized_scope" };
  }

  const sourcePath = typeof input.sourcePath === "string" ? input.sourcePath : "";

  // The shared client-prefixed order/consultation forms are the approved
  // company intake. If the caller has a business membership, this is company
  // work even when their base account type is lawyer/individual.
  if (
    businessId &&
    (isSharedClientIntakePath(sourcePath) || sourcePath.startsWith("/dashboard/business"))
  ) {
    return { firmId: null, businessId, error: null };
  }

  if (input.userType === "corporate" && businessId) {
    return { firmId: null, businessId, error: null };
  }

  if (
    firmId &&
    (input.userType === "firm" || input.userType === "lawyer") &&
    !isSharedClientIntakePath(sourcePath)
  ) {
    return { firmId, businessId: null, error: null };
  }

  return EMPTY_SCOPE;
}

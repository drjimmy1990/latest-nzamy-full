# Adversarial Challenge Report

## Challenge Summary

**Overall risk assessment**: LOW

The proposed remediations in `production_readiness_audit.md` are robust and target identified edge-case bugs. However, minor failure modes exist in database constraints and API integration payloads under high concurrency or external API outages (e.g. Resend/Evolution API).

---

## Challenges

### [Low] Challenge 1: Nullable `request_id` Cascade Deletes on `attachments`
- **Assumption challenged**: Dropping the `NOT NULL` constraint on `attachments.request_id` makes document uploads safe, but the table definition contains `on delete cascade`.
- **Attack scenario**: If a service request is deleted, all general documents not linked to any service request (where `request_id` is null) will survive, but any documents uploaded under a request will be deleted automatically. If the user expects to keep attachments even after a service request is canceled/deleted, they will lose files.
- **Blast radius**: User documents deleted unexpectedly.
- **Mitigation**: Update the foreign key constraint on `attachments` to `on delete set null` instead of `on delete cascade` if document retention is desired.

### [Low] Challenge 2: Evolution API Instance Latency/Outages
- **Assumption challenged**: Workflows 1.1, 2.1, 2.2, 3.1, 4.1, 4.2, 4.3, 5.1, and 5.2 depend on the Evolution API for WhatsApp notifications.
- **Attack scenario**: If the WhatsApp API instance goes down or experiences rate limits, the n8n execution blocks. In non-parallel flows, this can cause the audit logging or email dispatch nodes to fail to execute, or fail the entire workflow.
- **Blast radius**: User notifications and audit logs are not stored/sent.
- **Mitigation**: Place the Evolution API nodes in a parallel path or use n8n's "Continue on Fail" error-handling option.

---

## Stress Test Results

- **Lawyer Marketplace RLS Policy** → Allow unassigned requests to be seen by verified lawyers only → Works as intended (non-verified lawyers or clients cannot see other users' unassigned requests) → **PASS**
- **CamelCase to SnakeCase PATCH mapping** → Update payload with mixed camelCase and snake_case fields → Maps correctly in remediation code → **PASS**

---

## Unchallenged Areas

- **OAuth2 Token Expiration** — Reason not challenged: Out of scope for document-level database/API readiness review.

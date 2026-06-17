# 📘 NZAMY — Complete Project Guide
> Last Updated: 2026-06-17 | Version: 3.0

---

## 🏗️ Architecture Overview

| Layer | Tech | Status |
|-------|------|--------|
| Frontend | Next.js 16 + React 19 + Tailwind 4 | ✅ Live |
| Backend | Supabase (Auth + DB + Storage + RLS) | ✅ Live |
| Automation | n8n (self-hosted) | ⬜ Not started |
| WhatsApp | Evolution API | ⬜ Not connected |
| Payments | TBD (Moyasar / Tap / HyperPay) | ⬜ Not decided |
| Hosting | VPS with aaPanel + PM2 + Nginx | ⬜ Not deployed |

---

## 👥 The 9 User Types

### مزودو الخدمة (Service Providers)

| Type | Code | Dashboard | Pages | DB Table | Integration |
|------|------|-----------|-------|----------|------------|
| **محامي** (Lawyer) | `lawyer` | `/dashboard/lawyer/` | 21 pages | `lawyer_profiles` | ✅ **~12/21 wired** |
| **مكتب محاماة** (Law Firm) | `firm` | `/dashboard/firm/` | 32 pages | `firm_profiles` + `firm_members` | 🔴 **0% — ALL MOCK** |
| **مزود خدمة** (Provider: notary/arbitrator/bailiff) | `provider` | `/dashboard/provider/` | 10 pages | `provider_profiles` | 🔴 **0% — ALL MOCK** |

### طالبو الخدمة (Service Requesters)

| Type | Code | Dashboard | Pages | DB Table | Integration |
|------|------|-----------|-------|----------|------------|
| **فرد** (Individual Client) | `individual` | `/dashboard/client/` | 15 pages | `profiles` | ✅ **~10/15 wired** |
| **شركة** (Business/Corporate) | `corporate` | `/dashboard/business/` | 18 pages | `business_profiles` + `business_members` | 🔴 **0% — ALL MOCK** |
| **مؤسسة صغيرة** (Micro Business) | `micro` | `/dashboard/micro/` | 7 pages | `micro_profiles` | 🔴 **0% — ALL MOCK** |
| **جهة حكومية** (Government) | `government` | `/dashboard/government/` | 5 pages | `government_profiles` + `government_members` | 🔴 **0% — ALL MOCK** |
| **جمعية خيرية** (NGO) | `ngo` | `/dashboard/ngo/` | 8 pages | `ngo_profiles` + `ngo_members` | 🔴 **0% — ALL MOCK** |

### إدارة المنصة (Platform Admin)

| Type | Code | Dashboard | Pages | Integration |
|------|------|-----------|-------|------------|
| **مدير** (Admin) | `admin` | `/dashboard/admin/` | 26 pages | 🔴 **0% — ALL MOCK** (adminService.ts exists but NOT used) |

---

## ✅ What's DONE

### Client Dashboard (طالب الخدمة — فرد)

| Page | Status | Notes |
|------|--------|-------|
| Main dashboard | ✅ Wired | `getDashboardSummary()` |
| Cases list | ✅ Wired | Via workflow service |
| Cases detail `[id]` | ✅ Wired | `getCaseDetail()` + mock fallback |
| Consultation list | ✅ Wired | `getConsultations()` |
| Find Lawyer | ✅ Wired | `getLawyers()` + mock fallback |
| Documents | ✅ Wired | `getDocuments()` |
| Contracts | ✅ Wired | Via workflow service |
| Messages | ✅ Wired | `useChat()` hook |
| My Group | ✅ Wired | `getGroupState()` |
| Wallet | 🟡 Partial | API wired, demo banner still shows |
| Consultation `[id]` detail | 🔴 Mock | `MOCK_CONSULTATIONS` + `MOCK_MESSAGES` primary |
| Consultation/new | 🟡 Mock | Uses `MOCK_LAWYERS` from shared data |
| Referral | 🔴 Mock | Hardcoded referral data |
| Celebrity features | 🔴 Mock | `MOCK_REFERRALS`, hardcoded code |
| Services catalog | 🟡 Static | Uses `CLIENT_SERVICE_CATALOG` constant |

### Lawyer Dashboard (مزود الخدمة — محامي)

| Page | Status | Notes |
|------|--------|-------|
| Main dashboard | ✅ Wired | `getLawyerDashboardSummary()` |
| Cases | ✅ Wired | Via workflow service |
| Consultations | ✅ Wired | Via workflow service |
| Contracts | ✅ Wired | Via workflow service |
| Documents | ✅ Wired | `getDocuments()` |
| Tasks | ✅ Wired | `getLawyerTasks()` |
| Clients list | ✅ Wired | `getLawyerClients()` |
| Clients `[id]` | ✅ Wired | API fetch + mock fallback |
| Hearings | ✅ Wired | Via workflow service |
| Finance | ✅ Wired | Direct `apiGet()` + demo banner |
| Profile | ✅ Wired | `/api/v1/profile` + mock fallback |
| Activity | ✅ Wired | `getLawyerActivity()` + mock fallback |
| Reviews | 🔴 Mock | API stub commented out, no endpoint |
| Network | 🔴 Mock | `MOCK_TEAM`, `MOCK_SECONDMENTS` |
| Analytics | 🟡 Demo | Demo banner, inline charts |
| Secondment | 🟡 Demo | Demo banner only |
| Promotions | 🟡 Demo | Demo banner only |
| Archive | 🟡 Demo | Demo banner only |
| Marketplace | 🔴 Mock | Shared mock data |

### Database & Infrastructure

| Item | Status |
|------|--------|
| 58 Supabase tables | ✅ All created |
| 11 SQL migrations | ✅ All executed |
| RLS policies (core) | ✅ Fixed |
| Auth + session management | ✅ Working |
| `handle_new_user` trigger | ✅ Creates all profile types on signup |
| 18 API route groups (~53 handlers) | ✅ All column names verified correct |
| 17 service files | ✅ All using dual-mode pattern |
| TypeScript types | ✅ Zero errors |

---

## 🔴 What's REMAINING

### Phase 2.5B — Sector Dashboard Migration (Firm/Business/Provider/Admin/Gov/Micro/NGO)

> **106 pages across 7 dashboards** have ZERO backend integration.

#### Priority Order:

| Priority | Dashboard | Pages | Effort |
|----------|-----------|-------|--------|
| 🔴 P1 | **Firm** | 32 | ~5 days |
| 🔴 P1 | **Business** | 18 | ~3 days |
| 🟡 P2 | **Provider** | 10 | ~2 days |
| 🟡 P2 | **Admin** | 26 | ~4 days |
| 🟢 P3 | **Micro** | 7 | ~1 day |
| 🟢 P3 | **Government** | 5 | ~1 day |
| 🟢 P3 | **NGO** | 8 | ~1.5 days |

#### Reusable API Routes (already built):

| Existing Route | Can Serve |
|---------------|-----------|
| `/api/v1/service-requests` | ALL dashboard cases/requests |
| `/api/v1/documents` | ALL dashboards |
| `/api/v1/consultations` | Firm, Business, Provider |
| `/api/v1/profile` | ALL dashboards |
| `/api/v1/notifications` | ALL dashboards |
| `/api/v1/wallet` | Firm, Business, Micro, Provider |
| `/api/v1/chat` | ALL dashboards |

#### NEW API Routes Needed:

| Route | Serves |
|-------|--------|
| `/api/v1/firm/members` | Firm team + roles |
| `/api/v1/firm/branches` | Branch management |
| `/api/v1/firm/compliance` | KYC, conflict checks |
| `/api/v1/business/departments` | Department CRUD |
| `/api/v1/business/employees` | Employee contracts |
| `/api/v1/provider/requests` | Notary/arbitration requests |
| `/api/v1/provider/earnings` | Revenue tracking |
| `/api/v1/admin/users` | User management |
| `/api/v1/admin/analytics` | Platform metrics |
| `/api/v1/government/cases` | Government case tracking |
| `/api/v1/ngo/programs` | Program management |
| `/api/v1/micro/requirements` | Legal requirements |

---

### Phase 3 — Payments & Billing (25 items)

> **BLOCKED** — waiting for payment gateway decision (Moyasar / Tap / HyperPay)

---

### Phase 4 — n8n Automation (20 workflows)

| Group | Count | Status |
|-------|-------|--------|
| Critical workflows | 7 | ⬜ Build NOW |
| Payment-dependent | 4 | ⬜ After Phase 3 |
| Operational | 7 | ⬜ Build LATER |
| Wallet + Referral | 2 | ⬜ After wallet |

---

### Phase 5 — Security & Beta Teardown (22 items)

Server-side RBAC, Zod validation, rate limiting, delete demo files, PDPL compliance

---

### Phase 6 — Deployment (23 items)

VPS setup, SSL, Sentry, CI/CD, SEO

# 🔍 Client Dashboard — Dummy Data Audit & Services Report

> **Last Updated**: 2026-06-04 (Post-Migration)
> **What this is**: Complete inventory of all client dashboard pages, their data sources, and current status.

---

## 📊 Quick Overview

```
✅ REAL DATA (wired to backend)    — 11 pages
⏸️ DEFERRED (demo data + banner)   —  2 pages (Wallet, Referral)
```

| Status | Pages |
|--------|-------|
| ✅ Real | Requests, Services Catalog, Letters, **Cases, Consultation, Groups, Messages, Contracts, Documents, Find Lawyer, Main Dashboard** |
| ⏸️ Deferred | Wallet (needs payment gateway), Referral (needs new system) |

---

## ✅ All Pages With REAL Data (11 pages)

| # | Page | Data Source | Loading State |
|---|------|------------|---------------|
| 1 | `/dashboard/client/requests` | `clientWorkflowRepository` → `workflowService` | ✅ |
| 2 | `/dashboard/client/services` | `useClientPricingCatalog()` → catalog | ✅ |
| 3 | `/dashboard/client/letters` | `<ClientLetterWorkflow />` + `useUser()` | ✅ |
| 4 | `/dashboard/client` (main) | `dashboardService.getDashboardSummary()` → `/api/v1/dashboard/summary` | ✅ `DashboardPageSkeleton` |
| 5 | `/dashboard/client/cases` | `casesService.getActiveCases()` → `/api/v1/cases` | ✅ `SkeletonList` |
| 6 | `/dashboard/client/consultation` | `casesService.getConsultations()` + `listClientWorkflowRequests()` | ✅ `SkeletonList` |
| 7 | `/dashboard/client/my-group` | `groupService.getGroupState()` + `getGroupMembers()` | ✅ `SkeletonCard` |
| 8 | `/dashboard/client/messages` | `useChat()` hook → `chatService` (real-time) | ✅ `SkeletonThreadList` |
| 9 | `/dashboard/client/contracts` | `listClientWorkflowRequests()` (type=ai_draft only) | ✅ `SkeletonList` |
| 10 | `/dashboard/client/find-lawyer` | `lawyerService.getLawyers()` → `/api/v1/lawyers` (MOCK fallback) | ✅ `SkeletonList` |
| 11 | `/dashboard/client/documents` | `documentService.getDocuments()` → `/api/v1/documents` | ✅ `SkeletonList` |

---

## ⏸️ Deferred Pages — Still Demo Data (2 pages)

> Both show an amber "بيانات تجريبية" banner informing the user.

### `/dashboard/client/wallet` ⏸️
- **Status**: Mock data remains (balance, transactions, coupons)
- **Why**: Waiting for payment gateway provider approval (Phase 3)
- **Banner**: "المحفظة ستعمل بشكل كامل بعد ربط بوابة الدفع"
- **Needs**: `/api/v1/wallet/*` routes + payment gateway integration

### `/dashboard/client/referral` ⏸️
- **Status**: Mock data remains (referral URL, friends, stats)
- **Why**: Needs new `referrals` table + tracking system
- **Banner**: "نظام الإحالة سيعمل بشكل كامل قريباً"
- **Needs**: New referral database table + API routes

---

## 📋 All 27 Services in the Catalog

> These are the real services in `CLIENT_SERVICE_CATALOG` — this is NOT dummy data, this is the actual product catalog.

### Category 1: استشارة قانونية (Consultation) — 5 services
| # | Service | Price | Type | Route Working? |
|---|---------|-------|------|----------------|
| 1 | سؤال AI فوري | Free (1/day) | 🤖 AI | ✅ `/ai/consult` |
| 2 | استشارة مرئية 30 دقيقة | ٥٠٠ SAR | 👨‍⚖️ Human | ⚠️ Route exists, no booking flow |
| 3 | استشارة مرئية 60 دقيقة | ٥٠٠ SAR | 👨‍⚖️ Human | ⚠️ Route exists, no booking flow |
| 4 | استشارة حضورية 60 دقيقة | ٧٠٠ SAR | 👨‍⚖️ Human | ⚠️ Route exists, no booking flow |
| 5 | رأي قانوني مكتوب | ٢٥٠ SAR | 👨‍⚖️ Human | ⚠️ Route exists, no booking flow |

### Category 2: عقود ووثائق (Contracts) — 4 services
| # | Service | Price | Type | Route Working? |
|---|---------|-------|------|----------------|
| 6 | صياغة عقد مخصص | ٩٩ SAR / included | 🤖 AI | ✅ `/ai/contract-drafter` |
| 7 | صياغة خطاب رسمي AI | ٤٩ SAR / included | 🤖 AI | ✅ `/dashboard/client/letters` |
| 8 | تحليل عقد وكشف المخاطر | ٧٩ SAR / included | 🤖 AI | ✅ `/ai/analyze?mode=doc` |
| 9 | مراجعة من محام متخصص | ٨٠٠+ SAR | 👨‍⚖️ Human | ⚠️ Route exists, no booking flow |

### Category 3: دراسة وتقييم القضية (Case Study) — 4 services
| # | Service | Price | Type | Route Working? |
|---|---------|-------|------|----------------|
| 10 | تقييم أولي بالذكاء الاصطناعي | Free / ٧٩ SAR | 🤖 AI | ✅ `/ai/analyze?mode=eval` |
| 11 | دراسة قضية كاملة | ١٦٠٠+ SAR | 👨‍⚖️ Human | ⚠️ Creates workflow request |
| 12 | رأي ثان في قضية قائمة | ٦٠٠+ SAR | 👨‍⚖️ Human | ⚠️ Creates workflow request |
| 13 | بحث قانوني متخصص | ٨٠٠+ SAR | 👨‍⚖️ Human | ⚠️ Creates workflow request |

### Category 4: تحرير دعوى أو مذكرة (Legal Filing) — 5 services
| # | Service | Price | Type | Route Working? |
|---|---------|-------|------|----------------|
| 14 | لائحة دعوى ابتدائية | ١٦٠٠+ SAR | 👨‍⚖️ Human | ⚠️ Creates workflow request |
| 15 | مذكرة استئناف | ٢٠٠٠+ SAR | 👨‍⚖️ Human | ⚠️ Creates workflow request |
| 16 | مذكرة نقض / التماس | ٣٠٠٠+ SAR | 👨‍⚖️ Human | ⚠️ Creates workflow request |
| 17 | مذكرة رد أو دفاع | ١٠٠٠+ SAR | 👨‍⚖️ Human | ⚠️ Creates workflow request |
| 18 | اعتراض على قرار إداري | ٨٠٠+ SAR | 👨‍⚖️ Human | ⚠️ Creates workflow request |

### Category 5: تحكيم ووساطة (Arbitration) — 3 services
| # | Service | Price | Type | Route Working? |
|---|---------|-------|------|----------------|
| 19 | جلسة وساطة | ٨٠٠+ SAR | 👨‍⚖️ Human | ⚠️ Creates workflow request |
| 20 | تحكيم تجاري كامل | ٣٠٠٠+ SAR | 👨‍⚖️ Human | ⚠️ Creates workflow request |
| 21 | صياغة اتفاقية تسوية | ٣٩٩+ SAR | 👨‍⚖️ Human | ⚠️ Creates workflow request |

### Category 6: خدمات خاصة (Special Services) — 6 services
| # | Service | Price | Type | Route Working? |
|---|---------|-------|------|----------------|
| 22 | إنذار قانوني رسمي | ٤٠٠+ SAR | 👨‍⚖️ Human | ⚠️ Creates workflow request |
| 23 | توثيق وكالة قانونية | ٦٠٠+ SAR | 👨‍⚖️ Human | ⚠️ Creates workflow request |
| 24 | قسمة تركة وحصر الورثة | ١٠٠٠+ SAR | 👨‍⚖️ Human | ⚠️ Creates workflow request |
| 25 | متابعة تنفيذ حكم | ١٢٠٠+ SAR | 👨‍⚖️ Human | ⚠️ Creates workflow request |
| 26 | ترجمة قانونية معتمدة | ١٥٠+ SAR/page | 👨‍⚖️ Human | ⚠️ Creates workflow request |
| 27 | طلب عام | ٥٠٠+ SAR | 👨‍⚖️ Human | Internal only |

---

## 🎯 Service Status Summary

| Type | Count | Status |
|------|-------|--------|
| 🤖 **AI Services** (fully working) | **5** | ✅ Routes work, AI responds |
| 👨‍⚖️ **Human Services** (creates request) | **21** | ⚠️ Request form works → but no lawyer matching, payment, or booking flow yet |
| 🔒 **Internal** | **1** | Hidden from users |

---

## 📌 Migration Summary (Completed 2026-06-04)

### ✅ ALL DONE — No Mock Data (11 pages)
| Section | Data Source | New Files Created |
|---------|------------|-------------------|
| Main Dashboard | `dashboardService.getDashboardSummary()` | `dashboardService.ts`, `/api/v1/dashboard/summary` |
| Cases | `casesService.getActiveCases()` | — (existing service) |
| Consultation | `casesService.getConsultations()` + workflow | — (existing service) |
| Groups | `groupService.getGroupState()` | — (existing service) |
| Messages | `useChat()` hook (real-time) | — (existing hook) |
| Contracts | `listClientWorkflowRequests()` | — (existing service) |
| Find Lawyer | `lawyerService.getLawyers()` | `lawyerService.ts`, `/api/v1/lawyers` |
| Documents | `documentService.getDocuments()` | `documentService.ts`, `/api/v1/documents` |
| Requests | `clientWorkflowRepository` | — (already done) |
| Services Catalog | `useClientPricingCatalog()` | — (already done) |
| Letters | `<ClientLetterWorkflow />` | — (already done) |

### ⏸️ DEFERRED (2 pages — Phase 3+)
| Section | Reason | Banner Added |
|---------|--------|--------------|
| Wallet | Payment gateway not decided | ✅ "بيانات تجريبية" |
| Referral | Needs new referral system | ✅ "بيانات تجريبية" |

### 🗂️ `_data.ts` Cleanup
- **Removed**: `MY_CASES`, `NEXT_APPOINTMENT`, `RECENT_MESSAGES`, `USER_PLAN`, `QUICK_SERVICES`, `COMMUNITY_PREVIEW`
- **Kept**: `STATUS_COLOR`, `fadeUp`, `ClientCase` type

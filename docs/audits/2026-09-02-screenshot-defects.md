# عيوب اللقطات — ٢٦١ ملاحظة لا يسجّلها أي بند من الـ١٩٥

**المصدر:** ٣٤ لقطة في `lasttest/screenshots` · جولة تحقق ٢ سبتمبر ٢٠٢٦ · وكيل لكل لقطة.
**الفرز:** كل سطر هنا فُحص ضد المصفوفة الكاملة ولم يُطابق أي بند — لذلك هو **إضافي** على الـ١٩٥.

`الإنتاج` = اللقطة تُظهر `nezamy.sa` فعلاً · `غير محدَّد` = لا يظهر شريط عنوان في الإطار.

**الإجمالي:** 261 ملاحظة على 34 لقطة · 12 لقطة من الإنتاج المباشر.

| اللقطة | البيئة | بنود المصفوفة | إضافي |
|---|:--:|---|:--:|
| `01_cases_usememo_filter_bug.png` | الإنتاج | 1·86 | 9 |
| `02_cases_empty_state_initial_load.png` | الإنتاج | 1 | 4 |
| `03_tasks_flat_list_missing_drawer.png` | غير محدَّد | 3·72·97 | 11 |
| `04_share_profile_broken_link_and_74pct.png` | غير محدَّد | 4·130·192 | 9 |
| `05_mock_graph_contract_123.png` | غير محدَّد | 2 | 13 |
| `06_tasks_unclickable_case_link.png` | الإنتاج | 3·72 | 17 |
| `07_admin_users_missing_plan_filter.png` | غير محدَّد | 34·102 | 11 |
| `08_flash_of_free_tier_banner.png` | غير محدَّد | 5·154 | 8 |
| `09_procedures_huge_whitespace_gap.png` | الإنتاج | 35 | 11 |
| `10_procedures_double_layout_loading_flash.png` | الإنتاج | 35·154 | 3 |
| `11_direction_support_redundant_filters.png` | الإنتاج | 41·85·86 | 6 |
| `12_client_dashboard_mock_data_and_spam.png` | غير محدَّد | 17·50·52 | 6 |
| `13_referrals_fake_stats_mock_data.png` | غير محدَّد | 50 | 5 |
| `14_client_sidebar_library_removal.png` | غير محدَّد | 50·51·52 | 5 |
| `15_ashraf_author_credentials_fix.png` | غير محدَّد | 54 | 6 |
| `16_client_letters_workflow_step1.png` | غير محدَّد | 56·52 | 10 |
| `17_fouc_broken_navbar_and_skip_link.png` | غير محدَّد | 59 | 6 |
| `18_client_pricing_redirect_to_public_page.png` | الإنتاج | 60·168 | 9 |
| `19_lawyer_hearings_calendar_double_click_and_backend.png` | الإنتاج | 64 | 14 |
| `20_lawyer_add_hearing_modal_missing_case_dropdown.png` | الإنتاج | 70 | 9 |
| `21_lawyer_case_overview_empty_dashboard.png` | غير محدَّد | 65·2 (evidenced: the «الجراف» tab exists on the case file)·86 (evidenced: a «قريباً» badge is used on an incomplete AI feature) | 11 |
| `22_lawyer_case_hearings_tab_disabled_add_button.png` | غير محدَّد | 66·65 (evidenced: same impoverished case-file shell) | 3 |
| `23_lawyer_case_documents_missing_delete_button.png` | غير محدَّد | 67·68 (evidenced: no case-name / central-vault link and no trash tab on this row)·186 (evidenced: no category, no source, no soft-delete affordance on the row) | 5 |
| `24_lawyer_hearings_and_appointments_sidebar_naming.png` | غير محدَّد | 64·70 (evidenced: the page's only creation CTA is «موعد جديد», with no hearing-specific path)·163-168 (evidenced: the floating WhatsApp button is present on a logged-in lawyer page) | 5 |
| `25_lawyer_add_appointment_judicial_vs_non_judicial_modal.png` | غير محدَّد | 70·168 (evidenced: the WhatsApp FAB renders above the modal backdrop) | 8 |
| `26_lawyer_task_tracker_subtasks_gamification.png` | غير محدَّد | 72·97·102 | 9 |
| `27_public_landing_fake_stats_social_proof.png` | غير محدَّد | 75 | 6 |
| `28_public_landing_community_and_blog_section.png` | غير محدَّد | 76 | 8 |
| `29_public_landing_business_section_fake_stats.png` | غير محدَّد | 77 | 4 |
| `30_public_landing_navbar_and_service_naming.png` | غير محدَّد | 78 | 6 |
| `31_lawyer_add_client_modal_step1_individual_vs_company.png` | غير محدَّد | 80 | 4 |
| `32_lawyer_add_client_modal_step3_tags_and_save_failure.png` | الإنتاج | 79 | 7 |
| `33_navbar_logo_shows_letter_noon_instead_of_official_logo.png` | الإنتاج | 101·168 | 8 |
| `34_lawyer_consultations_management_view.png` | الإنتاج | 108·112·118 | 5 |

---

## `01_cases_usememo_filter_bug.png`

**البيئة:** الإنتاج · **بنود المصفوفة المرتبطة:** 1·86 · **إضافي:** 9

> Lawyer dashboard, "ملف القضايا" (all-cases file) on route /dashboard/lawyer/cases, list view ("قائمة") with the "الكل" status tab active and the case list rendering an empty state. Account type is lawyer: the right-hand sidebar shows user "محمد جمالب" with a subscription-tier subtitle, a lawyer-only nav (الجلسات القادمة / جميع القضايا / مهامي / سجل النشاط / نظامي AI tools), and the sidebar density toggle set to "كاملة". The sidebar is cut off at the right frame edge, so the app logo area is NOT in frame (this shot cannot evidence the «ن»-logo item).

1. Empty-state copy blames search/filter criteria when no search term is entered and the broadest tab is active — the message itself is wrong, independent of the underlying filter bug that matrix row ١ describes.
2. The empty-state CTA ("إضافة قضية") and the header button ("قضية جديدة") use two different labels for the same action.
3. Ownership sub-buckets all read 0 while "جميع القضايا" reads ٩ — no matrix row records this counter inconsistency.
4. Status chips sum to 7 against a stated total of ٩, and no chip covers closed/archived cases — no matrix row records this.
5. Arabic-Indic and Western numerals are mixed within one line and between two widgets showing the same count ("انتظار ٧" vs "انتظار: 7") — no matrix row addresses numeral-system consistency.
6. Four stacked filtering surfaces plus a search box on a single list screen; the bottom summary bar duplicates the status chips. Matrix row ٤١ names redundant filters only for the direction-support screen (11_...), not for the cases list.
7. The bottom bar mixes counters with two unrelated tool links (محاكي خصم, صياغة مذكرة) in the same strip.
8. A "PRO" badge on "عصارة المرفقات" in a sidebar that identifies the account as free, with no upgrade context shown.
9. Latin "AI" and the transliteration "لايت" inside the Arabic sidebar chrome — no matrix row covers mixed-script nav labels.

## `02_cases_empty_state_initial_load.png`

**البيئة:** الإنتاج · **بنود المصفوفة المرتبطة:** 1 · **إضافي:** 4

> The same lawyer screen as 01 — "ملف القضايا" at /dashboard/lawyer/cases — captured in a Chrome Incognito window with full browser chrome and bookmarks bar visible. Same lawyer account (محمد جمالب, "كاملة" sidebar density), "الكل" tab active, empty state rendered. Totals differ from 01: this capture shows ٤ cases where 01 showed ٩.

10. Status chips sum to 3 against a total of ٤ — the same unrecorded counter inconsistency as in 01, reproduced at a different data volume, which shows it is not a one-off.
11. Numeral-system mixing between the chip row (Arabic-Indic) and the bottom summary bar (Western) for the identical counts.
12. Empty-state copy blaming search criteria when nothing is filtered.
13. This screenshot is cited by NO matrix row by filename; master_log.md:109 attaches it to defect #1 alongside 01, which maps to matrix row ١.

## `03_tasks_flat_list_missing_drawer.png`

**البيئة:** غير محدَّد · **بنود المصفوفة المرتبطة:** 3·72·97 · **إضافي:** 11

> Lawyer dashboard, "قائمة المهام" (task list) — the sidebar's "مهامي" entry is highlighted, so this is the lawyer's own task board. Header summary reads "4 معلقة · 0 قيد التنفيذ · 2 مكتملة · 2 مؤرشفة". Above the list sit a productivity-score card, a four-tile KPI row, and a peer-comparison card; below sit three filter bars and a grouped flat list (معلقة section, then مكتملة section). Lawyer account, same sidebar as 01/02. No browser chrome anywhere in frame.

14. Production task board is populated with test junk — "12341234", "1223123123", "sdfgsdfg", "سيبلسيبل" twice, and a gibberish Arabic string. No matrix row records junk/test data sitting in live records.
15. Two widgets on the same screen disagree: header "2 مكتملة" vs KPI "المهام المنجزة 3 مهمة".
16. Fabricated national percentile: "أنت في أعلى 54% ضمن محامو المملكة". The matrix records fake statistics only for the public landing page (rows ٧٥, ٧٧) and referrals (row ٥٠) — nothing covers a fabricated peer benchmark inside the lawyer's own task dashboard.
17. Fabricated city/kingdom benchmark bars (−0.4س, −1.5س) whose fill length is meaningless — both draw as near-full red bars.
18. Arabic plural agreement is broken throughout the KPI row (6 جلسة / 3 مهمة / 2 قضية).
19. Grammar error "ضمن محامو المملكة".
20. "جلسات بومودورو" collides with the app's own legal meaning of "جلسة" (court hearing). Matrix row ٧٢ endorses Pomodoro for billable hours but says nothing about this terminology collision.
21. Inconsistent count badges on the scope chips (only مهام الفريق has one).
22. Three stacked filter bars and no search field on a task list.
23. Cross-screen contradiction with the cases page: "القضايا النشطة 2" here vs "0 نشطة" there.
24. Struck-through completed rows still carry the same blue priority dot as pending rows.

## `04_share_profile_broken_link_and_74pct.png`

**البيئة:** غير محدَّد · **بنود المصفوفة المرتبطة:** 4·130·192 · **إضافي:** 9

> The "تخصيص المشاركة" modal ("اختر ما يظهر في بطاقتك المهنية") over a blurred lawyer profile page — a lawyer account customising what appears on the public professional card. Six toggle rows, a share-link field with a copy button, and two share actions. The page behind shows a dark-green hero band; no browser chrome is in frame, only a Windows taskbar strip at the very bottom edge.

25. "تقييمات الموكلين — 0 تقييم" defaults ON, so the card broadcasts a zero rating count. Matrix row ١٩٢ demands real reviews first but says nothing about a default-ON toggle publishing an empty count.
26. "مستوى الإنتاجية ( ⬜ فضة )" renders a blank square where a tier glyph belongs — an unrendered icon/emoji in shipped UI.
27. An internal productivity tier computed from cumulative work hours is published on a lawyer's public professional card.
28. "التحليلات المالية" is offered as a shareable item on a public professional card.
29. "مخفية بالافتراضي" — non-idiomatic Arabic.
30. WhatsApp share uses a generic speech-bubble emoji and the spelling "واتسآب".
31. A sparkle emoji (✨) on the primary "مشاركة البطاقة" action.
32. No preview of the card being customised. (The missing QR code is already covered by matrix row ١٣٠.)
33. Five of six toggles default ON, including the fabricated and the empty metric — no matrix row addresses the default privacy posture of this modal.

## `05_mock_graph_contract_123.png`

**البيئة:** غير محدَّد · **بنود المصفوفة المرتبطة:** 2 · **إضافي:** 13

> A lawyer case file with the "الجراف" tab active, showing "الجراف البصري للقضية — 12341234". Above the tabs sits the case status stepper ("الحالة الحالية" with the value "انتظار", and four stages تقديم / قيد التدقيق / مراجعة / إغلاق). Tab strip: نظرة عامة / المهام / الجلسات / المستندات / الفريق / الجراف / الملاحظات. The canvas holds five connected nodes and a floating toolbar. Lawyer account. No browser chrome in frame; only a dark taskbar strip at the bottom edge.

34. The case name itself is junk test data ("12341234"), matching the junk task titles in screenshot 03 — no matrix row records test junk in live case records.
35. The demo node is badged "مقترح من نظامي AI" — hardcoded mock content presented to the lawyer as an AI suggestion. Matrix row ٢ orders MOCK_NODES deleted but never mentions that the mock is dressed as AI output.
36. "المادة (٧٧) من نظام…" cites a statute article while eliding the law's name behind an ellipsis.
37. The rightmost node is clipped by the canvas frame.
38. "● مساحة محفوظة" tells the user the canvas is persisted.
39. Raw keyboard shortcuts ("Ctrl+C نسخ · Del حذف") rendered as permanent LTR chrome inside an RTL toolbar.
40. "تصدير(1)" with an unexplained count.
41. Latin "AI" embedded in the "تحليل AI" button and the "نظامي AI" pill.
42. The status stepper's four stages (تقديم / قيد التدقيق / مراجعة / إغلاق) do not include the status value it is displaying ("انتظار") — two different status vocabularies in one strip.
43. The tab and panel are named with the transliteration "الجراف" instead of an Arabic term.
44. Western and Arabic-Indic numerals mixed inside one view (case title vs node labels).
45. Coloured node-type icon chips and edge labels with no legend; no delete/expand affordance on any node.
46. The edge label "تم إثبا…" is clipped behind an adjacent node card.

## `06_tasks_unclickable_case_link.png`

**البيئة:** الإنتاج · **بنود المصفوفة المرتبطة:** 3·72 · **إضافي:** 17

> Lawyer dashboard → «مهامي» (My Tasks). URL bar reads nezamy.sa/dashboard/lawyer/tasks, so production. Light theme, RTL. Account type = lawyer (sidebar reads «محمد جمالب / إعدادات محامي» and the nav has الجلسات القادمة / جميع القضايا / مهامي). The dark bar along the bottom is the Windows taskbar, not a browser status bar. NOTE: no matrix row cites this filename — grep of matrix_rows.md returns nothing; it appears only at master_log.md:114, which is the master-log entry behind matrix row 3.

47. All 8 tasks in production are junk/test data: «الحب الحب», «سيؤسيشى», «12341234», «1223123123», «سيبلسبيل» (twice), «سسيشسيب», «sdfgsdfg».
48. «سيبلسبيل» appears twice as two separate pending rows — duplicate tasks.
49. An unlabeled blue dot sits at the far (left) end of every row, identical for all 8 tasks — no legend, no meaning.
50. Mixed numeral systems on one screen: the KPI tiles use Western digits (4.7, 3, 2, 6) while the group headers, the archive chip and the date pill use Arabic-Indic (٦, ٢, ٢٦/٨, ١٢ ربيع).
51. Possible count contradiction: KPI «المهام المنجزة 3 مهمة» vs the list group header «مكتملة (٢)» with the period filter on «الكل». Reconcilable only if one of the ٢ archived tasks also counts as completed — not verifiable from the image.
52. Fabricated national benchmark card: «مقارنة سياقية — أنت في أعلى ٤٤% ضمن محامو المملكة» with an «عرض التحليل الكامل ←» button — a percentile against a population of Saudi lawyers that the platform does not have.
53. The two benchmark bars («محامو الرياض», «محامو المملكة») render as ~90-95% full RED fills, which reads as an error / over-limit state inside a productivity-comparison card.
54. The small red delta labels above those two bars render at roughly 6px and are illegible at source resolution (approximately «٥.٤٠م» / «٥.١٠م»).
55. «أنت في أعلى ٤٤%» is framed as praise, but the 44th percentile is below the median — the copy contradicts the number it reports.
56. Productivity score «75 %» labelled «متقدم» with a green delta pill and a gold progress bar — no basis, source or period shown for the score.
57. Arabic plural agreement wrong in the KPI units: «3 مهمة» (should be مهام), «6 جلسة» (should be جلسات), «2 قضية».
58. Sidebar gating badges use three different vocabularies for the same «not included» idea: «جديد» (ParaLegal, سؤال قانوني سريع, المجمع البحثي), «PRO» (عصارة المرفقات), «مدفوع» (المحاكي الشامل).
59. A heavy dark scrollbar thumb is painted over the sidebar nav content.
60. The marketing WhatsApp floating button is rendered inside the authenticated lawyer dashboard (bottom-left, clipped by the viewport).
61. Date pill «☀ الأربعاء | ١٢ ربيع | ٢٦/٨»: the Hijri month is truncated to «ربيع» (ambiguous between ربيع الأول and ربيع الآخر) and neither the Hijri nor the Gregorian half carries a year.
62. Two stacked filter rows with inconsistent control styling: a pill group (الكل/اليوم/الأسبوع/هذا الشهر/هذا الربع/هذه السنة) above a tab-style row (حالة المهمة/الأولوية/النوع/الموعد) with a detached «الأرشيف (٢)» chip.
63. The sidebar name renders «محمد جمالب» with a small dark rectangular box painted over the letters (possible missing-glyph / tofu); the admin user list in 07 records this same account as «mohamed gamal».

## `07_admin_users_missing_plan_filter.png`

**البيئة:** غير محدَّد · **بنود المصفوفة المرتبطة:** 34·102 · **إضافي:** 11

> Admin console → «إدارة المستخدمين» (all-users list), dark theme, RTL. Account type = admin (sidebar reads «نظامي / ADMIN PANEL», identity card «مدير النظام — admin@nzamy.sa», active nav item «جميع المستخدمين»). ENVIRONMENT UNDETERMINED: the 1024x494 image contains no browser chrome at all — no URL bar, no tab strip, no status bar — so neither production nor localhost can be established from the pixels.

64. Count contradiction on one screen: the chip «الكل 17» vs the page subtitle «10 مستخدم · 0 نشط · 10 بانتظار التحقق» and the KPI tile literally labelled «إجمالي» showing 10 — the «total» tile is reporting the filtered subset, not the total.
65. Six account-type chips all read 0 and are still rendered as clickable filters: مكتب محاماة 0، شركة 0، منشأة صغيرة 0، مزود خدمة 0، جهة حكومية 0، منظمة غير ربحية 0.
66. «نشط 0» — zero active users, with all 10 sitting in «بانتظار التحقق»; the verification queue has never been worked and there is no bulk-approve control, only a per-row «تحقق».
67. The floating WhatsApp marketing button is rendered inside the admin panel and physically overlaps the third user row (غدير عسيري), covering its «...» overflow menu and part of its «تحقق» button.
68. Mixed numeral systems: the chips, the KPI tiles and «0 طلب AI» all use Western digits while the join dates use Arabic-Indic («انضم: ٢٢ أغسطس ٢٠٢٦», «١٨ أغسطس ٢٠٢٦»).
69. Arabic number agreement: «10 مستخدم» should be «10 مستخدمين», and the banner «يوجد 10 مستخدم ... من هويته الوظيفية» uses a singular pronoun for 10 users.
70. The banner verb appears to render as «بنتظر» rather than «ينتظر» — the dot count under the initial letter is NOT resolvable at source resolution, so this is a possible typo, not a confirmed one.
71. Every listed user shows «0 طلب AI» — the admin console has no usage data at all behind it.
72. Each row's plan is rendered as plain small gray text («مجاني») while type and status are colored pills — inconsistent affordance for the very field the screen cannot filter on.
73. The notification bell carries a red «3» badge with no way on this screen to see what the three items are.
74. OBSERVATION, not asserted as a defect: the admin identity line reads admin@nzamy.sa while the site elsewhere is served from nezamy.sa — the repo itself is named nzamy-website, so this spelling difference may be intentional.

## `08_flash_of_free_tier_banner.png`

**البيئة:** غير محدَّد · **بنود المصفوفة المرتبطة:** 5·154 · **إضافي:** 8

> A 1024x116 horizontal STRIP cropped from the top of the lawyer dashboard home (greeting «مرحباً،» + «نظرة سريعة على أعمالك وقضاياك اليوم», quick actions «+ قضية جديدة / الصائغ القانوني / نشر في السوق», and the gold free-tier upgrade banner). Account type = lawyer (right rail shows «إعدادات محامي»; the banner names lawyer tools). ENVIRONMENT UNDETERMINED: no browser chrome in the crop. Because it is a narrow top-of-page strip, the ABSENCE of content below is not evidence of anything.

75. Direct contradiction inside the same strip: the «الصائغ القانوني» quick action is rendered as an ENABLED dark-green primary button while the banner immediately below it declares «الصائغ القانوني ... غير متاحين» on this plan.
76. The greeting reads «مرحباً،» — a trailing comma with an empty name slot; the user's name was never interpolated.
77. The right-rail user block shows an EMPTY dark-green avatar square (no initial, no photo) and no name line above the «إعدادات محامي» subtitle — a second visible symptom of the same un-hydrated state (compare 09, where «محمد جمالب» and its avatar render normally).
78. «باقة مجاني» is ungrammatical Arabic — should be «الباقة المجانية» or «باقة مجانية»; it reads like a raw enum value dropped into a sentence.
79. «حد الاشتراك: ٣ قضايا · ٦ استشارة» — «٦ استشارة» should be «٦ استشارات».
80. Date pill «☀ الأربعاء | ١٢ ربيع | ٢٦/٨»: Hijri month truncated to «ربيع» (ambiguous), and no year on either the Hijri or the Gregorian half — the same defect as in 06.
81. The upgrade CTA is duplicated inside one banner: a crown icon, the inline text «ترقّ للاحترافي أو المميز للوصول الكامل», AND a «ترقية الباقة →» button — three upgrade prompts in one 40px bar.
82. Tier naming is inconsistent within the banner: the current plan is named with a noun («باقة مجاني») while the paid tiers are named with bare adjectives («الاحترافي», «المميز»), with no plan noun attached to either.

## `09_procedures_huge_whitespace_gap.png`

**البيئة:** الإنتاج · **بنود المصفوفة المرتبطة:** 35 · **إضافي:** 11

> «المرشد القضائي» AI tool, fully loaded. URL bar reads nezamy.sa/ai/procedures, so production. Light theme, RTL. Account type = lawyer (right rail shows «محمد جمالب / إعدادات محامي» and the lawyer AI nav). Subtitle: «إجراءات · دوائر قضائية · ذكاء مجتمعي من المحامين».

83. No duplicated block is actually visible in this frame — the gap is genuinely empty. The pixels show a container that reserves height and renders nothing, not a repeated block (matrix row 35 prescribes «حذف الكتل المكررة»).
84. The «ابحث» primary button is rendered desaturated / disabled-looking (muted gray-green) while the search input sits empty.
85. Each court card carries an outer «›» chevron pointing RIGHT while the same card's inner call-to-action reads «عرض الخطوات ←» pointing LEFT — two opposite directional affordances on one card.
86. No procedure counts on any court card: five courts (المحكمة التجارية، المحكمة العمالية، المحكمة العامة، محكمة الاستئناف، المحكمة الإدارية) with no indication of how many procedures each holds, or whether any exist at all.
87. The fifth card (المحكمة الإدارية) sits alone in the right column of a two-column grid, leaving a visibly empty cell beside it.
88. A green freshness badge reading «محدثة ٢٠٢...» sits next to the title; the year digits are unreadable at source resolution and the badge asserts currency with no actual date.
89. The content column is a narrow centered band (~520px) inside an ~880px content area, leaving wide empty margins on both sides.
90. The «الدوائر القضائية» tab is inactive and carries no count; nothing on the page evidences the «ذكاء مجتمعي من المحامين» claim made in the subtitle.
91. The marketing WhatsApp floating button is rendered on this authenticated AI tool page (bottom-left).
92. A heavy dark scrollbar thumb is painted over the sidebar nav content — same as in 06.
93. Sidebar gating badges again use three vocabularies for one idea: «جديد», «PRO» (عصارة المرفقات، الرأي الفصل), «مدفوع» (المحاكي الشامل); and «المزيد (3)» uses a Western digit while the date pill on the same rail uses Arabic-Indic.

## `10_procedures_double_layout_loading_flash.png`

**البيئة:** الإنتاج · **بنود المصفوفة المرتبطة:** 35·154 · **إضافي:** 3

> A mid-navigation loading state of the AI section: an entirely blank white viewport with one centered spinner and «جارِ التحميل...». Production — the URL bar reads nezamy.sa/ai. Account type NOT inferable: no sidebar, no header, no user chrome has rendered. NOTE: the URL bar reads /ai, NOT /ai/procedures as the filename implies — what is loading is the /ai index route itself.

94. The spinner is an unbranded rotating rounded-square blob with a green-to-olive/gold gradient — not the platform mark, and it reads as an unfinished placeholder shape rather than a designed loader.
95. The marketing WhatsApp floating button is ALREADY fully painted at bottom-left while the application itself has rendered nothing — the third-party widget mounts ahead of the app.
96. The URL bar reads nezamy.sa/ai, not /ai/procedures as the filename implies, so the flash occurs on the AI layout route itself, not only on the procedures child route.

## `11_direction_support_redundant_filters.png`

**البيئة:** الإنتاج · **بنود المصفوفة المرتبطة:** 41·85·86 · **إضافي:** 6

> The AI tool «داعم الاتجاه» (Direction Support) wizard, step 1 «ماذا تريد البحث عنه؟» + step 2 «اكتب الاتجاه الذي تريد دعمه», rendered inside the LAWYER dashboard shell. Chrome IS visible: URL bar reads nezamy.sa/ai/direction-support (production). Sidebar user card reads «محمد جمالب» / «إعدادات محامي» with avatar letter «م», and the nav carries lawyer-only tools (محترف العقود، المحاكي الشامل، عصارة المرفقات، الرأي الفصل، دليل العملاء، مدير العقود). Breadcrumb: نظامي AI › داعم الاتجاه, title badged «جديد».

97. The «٨٥٪ موضوعياً» hard-coded similarity figure on the سوابق قضائية card. No matrix row mentions it — greps for تشابه / دقة return nothing, and the نسبة hits are unrelated (row 4 = the 74% win rate, row 77 = 98%/500 companies on the landing page). Row 41 concerns only the six-source structure.
98. The red «20 حرف إضافي على الأقل» error firing on an empty, untouched textarea. No row covers it (الحد الأدنى / التحقق / حرف return nothing relevant).
99. The greeting chip: truncated Hijri month «ربيع» with no الأول/الآخر. No row mentions the chip at all (ربيع / التقويم / الترحيب / أم القرى return only deadline-engine rows 48/180 and calendar row 64).
100. Cross-shot proof that the chip's weekday is wrong: shot 11 = الأربعاء / ١٤ ربيع / ٢٧/٨ and shot 14 = الأحد / ١٧ ربيع / ٣٠/٨. Both the Hijri day and the Gregorian day advance by exactly 3, so the weekday must advance by 3 — الأربعاء + 3 = السبت, not الأحد. One of the two labels is wrong, provable from the pixels without knowing the year. (Inference only, if the year is 2026: 30/8/2026 is a Sunday, which makes shot 11's الأربعاء the wrong one.)
101. Latin «PRO» tier badges inside the Arabic RTL sidebar — no matrix row covers tier badging in the nav.
102. The لايت/كاملة toggle here versus «محترف العقود لايت» as a baked-in label in the client sidebar — two naming conventions for one tool across roles, uncovered by any row.

## `12_client_dashboard_mock_data_and_spam.png`

**البيئة:** غير محدَّد · **بنود المصفوفة المرتبطة:** 17·50·52 · **إضافي:** 6

> A mid-page crop of the CLIENT dashboard (sidebar user card reads «TEST 1» / «إعدادات عميل»). Three stacked blocks are in frame: the tail of a documents card (first row clipped at y=0), the wallet banner «رصيد محفظتك», and the «المجتمع القانوني» card. No browser chrome, no URL bar, no status bar — environment cannot be established from the pixels. Sidebar is cut mid-label but legible entries include استشاراتي، عقودي، مستنداتي، رسائلي، المستشار الذكي، محترف العقود لايت، الفاحص الذكي، صائغ الخطابات، المجتمع القانوني، المكتبة القانونية.

103. The community search placeholder shipping an internal SEO note («…مفهرسة على Google — تساعد نظامي في السيو») as user-facing copy. Row 17 says «تنظيف المجتمع» (clean the community) but names only the mock content, not this string.
104. Both zero-answer questions carrying an orange verified/solved-style badge, and the vote count rendering as an empty placeholder dash — a state contradiction no row mentions.
105. The card header promising «محامون معتمدون» answer these questions while both rows show ٠ إجابة.
106. Internal date inconsistency inside the mock documents themselves: case numbers stamped ٢٠٢٥ against document dates in ٢٠٢٦.
107. Latin «1000» and Arabic-Indic «٣» in the same sentence of the wallet banner — no row covers numeral-system consistency.
108. The wallet banner attributing its 1000 ر.س to referrals while shot 14 states referrals are not recorded and no reward accrues. Grep for إحالة / الإحالة over the matrix returns nothing — no row states this cross-screen contradiction (row 50 bans only the fake counters).

## `13_referrals_fake_stats_mock_data.png`

**البيئة:** غير محدَّد · **بنود المصفوفة المرتبطة:** 50 · **إضافي:** 5

> Account settings → the «دعوة الأصدقاء» tab, for the client account «TEST 1» (settings nav: الملف الشخصي، الأمان، الإشعارات، الخصوصية، المدفوعات، دعوة الأصدقاء، المساعدة، تسجيل الخروج). Top navbar shows the real نظامي wordmark + emblem, لوحة التحكم / الخدمات / قضاياي / المستندات / نظامي AI, an SA flag, a globe, a dark-mode moon and a bell. No browser chrome or status bar is in frame, so the environment is not established by the pixels — the page CONTENT does show a production URL, «https://nezamy.sa/join?ref=NZM-TEST», but referral links are commonly built from a hard-coded base URL, so that is not proof of the host.

109. Three incompatible reward definitions on one screen (subscription discount vs 50 ر.س wallet credit vs a free month). Row 50 bans the fake counters and the unwired `ref`; it says nothing about the reward copy contradicting itself.
110. The earned balance here (350 ر.س) contradicts the wallet balance in shot 12 (1000 ر.س), which claims the same referral provenance. No row reconciles the two.
111. This settings tab remaining fully functional while the dedicated referral route declares the program off — the two-route contradiction is uncovered (row 50 offers «أو التعطيل» as an option but never notes that one surface was disabled and the other was not).
112. The duplicated referent in «يحصل من تدعوه على / شهر مجاني لصديقك».
113. Latin digits throughout an Arabic-Indic interface.

## `14_client_sidebar_library_removal.png`

**البيئة:** غير محدَّد · **بنود المصفوفة المرتبطة:** 50·51·52 · **إضافي:** 5

> The CLIENT dashboard (user card «TEST 1» / «إعدادات عميل») with the «برنامج الإحالة» sidebar item selected and highlighted; the main panel is a single centered empty state saying the referral program does not exist yet. No browser chrome or status bar in frame — environment not established. Sidebar entries legible: نظامي AI group (المستشار الذكي، محترف العقود لايت، الفاحص الذكي، صائغ الخطابات), then محفظتي، المجتمع القانوني، المكتبة القانونية، برنامج الإحالة، ميديا نظامي، الإشعارات، الإعدادات, plus a «ابحث عن أداة… ⌘K» box and an «عندك فكرة جديدة؟» prompt.

114. No matrix row proposes removing or badging the «برنامج الإحالة» sidebar entry itself. Rows 126 and 134 do exactly that for two other قريباً-template pages (الشبكة المهنية، العروض الترويجية); this one was missed, so the nav keeps advertising a feature its own page disowns.
115. The contradiction between this page and shot 13's settings tab — one surface disabled, the other left live — is stated by no row.
116. Greeting-chip weekday inconsistency, provable across shots 11 and 14 without a calendar: both the Hijri day (١٤→١٧) and the Gregorian day (٢٧/٨→٣٠/٨) advance by exactly 3, yet the weekday advances by 4 (الأربعاء→الأحد). One label is wrong.
117. Truncated Hijri month «ربيع» in the chip — uncovered by any row.
118. The hard-hat placeholder icon as the visual for an unfinished feature.

## `15_ashraf_author_credentials_fix.png`

**البيئة:** غير محدَّد · **بنود المصفوفة المرتبطة:** 54 · **إضافي:** 6

> The foot of a public blog article on the marketing site, logged in as «TEST 1» (top navbar shows the real نظامي logo, لوحة التحكم / الخدمات / قضاياي / المستندات / نظامي AI). In frame: the credits + disclaimer block, the like/save/share row, the author card for «أ.د/ أشرف عبدالرازق إبراهيم ويح», a «مقالات ذات صلة» rail on the left, an article-outline rail above it, and the site footer. A Windows taskbar (weather 33°) is visible along the bottom, but no browser URL bar or status bar is in frame — environment not established.

119. Dual attribution on one article — a «فريق نظامي القانوني» team byline in the credits block against an individual author card below. Row 54 addresses only the credentials line and the CTA.
120. Identical hard-coded «6 دقائق قراءة» on all three related articles. Grep for دقائق over the matrix returns nothing.
121. «0 إعجاب» rendered publicly on a live article — no row covers article engagement counters (grep إعجاب returns nothing).
122. The share row using the retired Twitter bird logo and offering only three networks — no row covers the article share widget (grep مشاركة returns only rows 4, 36, 130, all about profile/circuit sharing).
123. The public footer advertising «التمثيل القضائي» and «التوثيق» as platform services, plus «سوق المهنيين» — no row audits the public footer's service links (greps for الفوتر / التذييل / سوق المهنيين return nothing).
124. All related-article thumbnails falling back to the same generic placeholder icon instead of cover images.

## `16_client_letters_workflow_step1.png`

**البيئة:** غير محدَّد · **بنود المصفوفة المرتبطة:** 56·52 · **إضافي:** 10

> Client dashboard → «صانع الخطابات» (letter builder), step 1 of 4 «نوع الخطاب». Account is a client test account: sidebar shows «TEST 1» / «إعدادات عميل» with a «T» avatar. No browser chrome, URL bar or tab strip is in the capture (page appears full-screen; only the Windows taskbar with a 33° weather widget is visible at the bottom), so the host cannot be determined — the visual design matches the confirmed-production shots 18/19. MATRIX EVIDENCE SPLIT — row 56 asks for legal-basis pillars (سند نظامي + مهلة ذكية + منصة إرسال) and 6 government templates; this frame shows only the step-1 category picker, so row 56 is NEITHER confirmed NOR refuted by these pixels (the pillars and templates would live at steps 2-4). What the frame DOES independently evidence is row 52: «المكتبة القانونية» is still present in the individual client's sidebar. Note also the 6 grouped categories look like the grouping row 42 asked for, i.e. this frame may show row 42 already done — not listed as a defect.

125. Emoji used as product iconography (red octagon 🛑 / 🚫 / 📢) instead of the platform icon set.
126. A «رجوع» button exists on step 1 of the wizard where there is no prior step.
127. «التالي» is disabled with no hint text saying what unlocks it.
128. Mixed arrow directions (→ and ←) for navigation inside one RTL screen.
129. The lawyer-review upsell is placed at step 1, before any letter content exists.
130. ~250px of dead left-hand gutter — the content column never uses the full width.
131. Mixed Western and Arabic-Indic numerals on the same screen.
132. Hijri month rendered as bare «ربيع» with no أول/ثاني, and Gregorian date with no year.
133. Sidebar nav scroll region clips its last item mid-glyph.
134. «جديد» badge on «ميديا نظامي», a page the matrix itself flags as mock.

## `17_fouc_broken_navbar_and_skip_link.png`

**البيئة:** غير محدَّد · **بنود المصفوفة المرتبطة:** 59 · **إضافي:** 6

> The public landing page (nezamy.sa home / hero with the blindfolded-justice statue) captured mid-load with the stylesheet not yet applied — a flash of unstyled content. No browser chrome, URL bar or tab title is in the capture (only the page and a native OS scrollbar on the right), so production vs localhost cannot be determined from the pixels. MATRIX EVIDENCE SPLIT — row 59 names three things (FOUC, navbar collapse, skip link); all three are directly visible here, so row 59 is affirmatively evidenced by this frame. Several further defects in the same frame are outside row 59's wording.

135. The locale flag renders as a blank white flag glyph instead of the Saudi flag (font fallback failure).
136. «دخول» and «سجّل مجاناً» run together with no separator.
137. The theme toggle and language switch are each duplicated on screen — an unstyled pair plus a styled floating pair.
138. «تخطى» is the wrong verb form for a skip link (should be «تخطَّ» / «انتقل»).
139. The hero image is not full-bleed: black bands remain at the top, left and right edges.
140. The dropdown caret for «المعرفة القانونية» is rendered as inline text.

## `18_client_pricing_redirect_to_public_page.png`

**البيئة:** الإنتاج · **بنود المصفوفة المرتبطة:** 60·168 · **إضافي:** 9

> Production — the URL bar reads nezamy.sa/dashboard/client. Client dashboard home for an account greeted as «خالد» (sidebar subtitle «إعدادات عميل»). Browser is a Chromium-family browser in dark chrome with an «Update» button. MATRIX EVIDENCE SPLIT — row 60 is about the packages button redirecting to the generic public pricing page; this frame shows only the «الباقات والأسعار → عرض الباقات» card, NOT its destination, so row 60 is NOT evidenced by these pixels either way. What the frame DOES evidence is row 168: the floating WhatsApp button sits over the bottom-left and overlaps the «صياغة عقد» service card.

141. Two stacked welcome banners on the same dashboard.
142. Greeting copy presumes an existing case and an assigned lawyer («قضيتك في أيدٍ أمينة … التواصل مع محاميك»).
143. Sidebar avatar is blank and the account's display name is missing, while the page body greets «خالد».
144. «احجز استشارة» is offered three times and the AI tool is named two different ways («اسأل نظامي AI» vs «المجيب السريع») on one screen.
145. Cards on the same page have inconsistent widths — the greeting card leaves a large empty gutter.
146. The ⚡ icon does double duty for the services heading and the pricing button.
147. Hijri month shown as bare «ربيع» with no أول/ثاني; Gregorian date has no year.
148. The pinned search box overlaps the last sidebar item.
149. The banner close «×» is on the left in an RTL layout, inconsistent with the modal close elsewhere.

## `19_lawyer_hearings_calendar_double_click_and_backend.png`

**البيئة:** الإنتاج · **بنود المصفوفة المرتبطة:** 64 · **إضافي:** 14

> Production — the URL bar reads nezamy.sa/dashboard/lawyer/hearings. Lawyer dashboard, hearings/appointments calendar, month view for أغسطس 2026, zero records. Account is a lawyer («إعدادات محامي», avatar «م»); the date pill reads «الاثنين [١٨ or ١٩] ربيع ٣١/٨» — the Hijri day glyph is below the resolution limit of this capture and is NOT determinable, so no claim is made about it. MATRIX EVIDENCE SPLIT — row 64 has three parts. (a) «تفعيل Double Click لفتح المودال» is a click behaviour and CANNOT be evidenced by a static frame — unevidenced. (b) The sidebar/header naming mismatch IS evidenced: the sidebar item is «الجلسات القادمة» while the page header is «المواعيد والجلسات». (c) The «شريط الفرز العلوي» that row 64 asks to be added appears to ALREADY EXIST — a search field plus «الفرز المتقدم» sit at the top of the card, so that third of the row may be done.

150. Three redundant empty-state messages on one screen.
151. The empty-state text says the «موعد جديد» button is «أعلاه» when it is in fact below the card.
152. The calendar defaults to a selected day (4 August) that is neither today (31 August) nor the first of the month.
153. Western and Arabic-Indic digits mixed inside a single calendar widget.
154. Weekday headers inconsistently truncated («أحد» full, the rest clipped).
155. Hijri day sub-labels are rendered too small to read.
156. «0 مجدولة» uses a Western zero in an Arabic heading.
157. Search + «الفرز المتقدم» rendered active over an empty dataset.
158. «ParaLegal» is untranslated Latin script in an Arabic sidebar.
159. Four simultaneous «جديد» badges dilute the badge.
160. Sidebar's last item is clipped mid-glyph behind the pinned search box.
161. «كاملة / لايت» switch is unexplained.
162. Hijri month shown as bare «ربيع» with no أول/ثاني.
163. The full-width empty-state card pushes the calendar below the fold.

## `20_lawyer_add_hearing_modal_missing_case_dropdown.png`

**البيئة:** الإنتاج · **بنود المصفوفة المرتبطة:** 70 · **إضافي:** 9

> Production — the URL bar reads nezamy.sa/dashboard/lawyer/hearings, the same lawyer hearings page as shot 19, with the «إضافة موعد / جلسة جديدة» modal open over a heavily blurred page. Step 1 of a multi-step flow (the primary button reads «الخطوة التالية»). MATRIX EVIDENCE SPLIT — this is the one frame in the set that affirmatively confirms its row. Row 70 (judicial hearing path vs professional appointment path) is directly evidenced: there is a single «نوع الموعد» select defaulting to «أخرى», the case/client field is free text and optional, and there are no court, circuit, case-number or preparation-task fields — the two paths are not separated.

164. The date input renders the US «mm/dd/yyyy» pattern, LTR and in Latin script, inside an Arabic RTL modal.
165. The time input uses a 12-hour AM/PM English-locale format.
166. No Hijri date entry option in a Saudi court-hearing form.
167. The disabled «الخطوة التالية» button's label fails contrast (pale text on washed sage).
168. The reason the button is disabled is printed BELOW the button in pale micro-type instead of next to the date field.
169. The multi-step flow shows no step indicator.
170. The required-field asterisk is on the LTR side of the label in an RTL modal.
171. The two half-width fields have unequal widths and misaligned labels.
172. The backdrop blurs the whole application with no dimming scrim, making the page behind look broken.

## `21_lawyer_case_overview_empty_dashboard.png`

**البيئة:** غير محدَّد · **بنود المصفوفة المرتبطة:** 65·2 (evidenced: the «الجراف» tab exists on the case file)·86 (evidenced: a «قريباً» badge is used on an incomplete AI feature) · **إضافي:** 11

> Lawyer dashboard, case-file detail page, «نظرة عامة» (Overview) tab. Breadcrumb «← ملف القضايا» at top. Case header card + tab strip + two content cards. Right-hand RTL sidebar is the lawyer dashboard nav (account «محمد جمال…», role line «إعدادات محامي», active item «جميع القضايا»). Account type: lawyer. NO browser chrome, URL bar, tab title, or OS status bar was captured — the shot is viewport-only (I zoomed the bottom-left strip and the top strip to check), so the environment cannot be determined from pixels.

173. Raw English enum badge «service» printed on the case header next to the Arabic status chip. Grep of matrix_rows.md for "service" returns only service_requests / service_role / "Services Ben" rows (79, 94, 160, 169, 178, 181) — none is about this badge.
174. Case title is junk test data «12341234» and the «وقائع القضية» body is «123412341234». Grep for "12341234" in matrix_rows.md = 0 hits. No row flags junk case titles/facts in the lawyer case file (rows 2/17/73/75/76 are about MOCK arrays on other screens).
175. Status vocabulary mismatch: current state «انتظار» is not one of the four pipeline stages (تقديم/قيد التداول/مراجعة/إغلاق), and the value is rendered at the opposite edge of the card from its «الحالة الحالية» caption. Grep for "الحالة الحالية" and "شريط التقدم" = 0 hits.
176. Terminology split «الطلب» vs «القضية» on the same case screen (timeline event reads «إنشاء الطلب»). Grep for "المخطط الزمني" = 0 hits.
177. Tab label «الجراف» is a transliteration of English "graph". Matrix row 2 is about MOCK_NODES / fake graph DATA, not the label — no row addresses the naming.
178. Transliterated / Latin UI strings in the lawyer sidebar: «لايت» for Lite, «ParaLegal» in Latin script, «نظامي AI». Grep for "لايت", "ParaLegal", "التعريب", "الإنجليزي" = 0 hits each.
179. Mac ⌘-style shortcut chip in the tool search, with the modifier and letter reversed by RTL. Grep for "اختصار" / ⌘ = 0 hits.
180. Truncated Hijri month «١٨ ربيع» with no الأول/الآخر in the sidebar date pill. Grep for "ربيع" = 0 hits, "الهجري" = 0 hits.
181. The sticky sidebar search box overlaps and clips the last visible nav item (half a row is cut off and unreadable). No matrix row covers sidebar scroll clipping.
182. The three overview counters have no heading naming what they count, and mix Western digits with the Arabic-Indic digits used for dates on the same screen. Grep for "الأرقام الهندية" / "الهندية" = 0 hits (rows 50 and 77 are about fabricated marketing numbers, a different issue).
183. «مُسندة إلى محامٍ» shows no lawyer name and reuses the client's person icon, making the two meta fields indistinguishable.

## `22_lawyer_case_hearings_tab_disabled_add_button.png`

**البيئة:** غير محدَّد · **بنود المصفوفة المرتبطة:** 66·65 (evidenced: same impoverished case-file shell) · **إضافي:** 3

> Same lawyer case-file page, «الجلسات» (Hearings) tab selected. Same case header (12341234, service, انتظار) and same RTL lawyer sidebar with «جميع القضايا» active. Account type: lawyer. NO browser chrome, URL bar, tab title, or status bar captured — environment not determinable from pixels.

184. The empty state actively tells the user to add a hearing («ستظهر الجلسات هنا عند إضافتها») while the add button is disabled with «قريباً». Matrix 66 covers only the disabled button; no row covers the contradictory empty-state copy.
185. «0 جلسات مسجّلة» — Western digit beside Arabic-Indic dates on the same screen, plus wrong Arabic plural agreement for a zero count. No matrix row covers numeral-system consistency or plural agreement.
186. The hearings tab offers no filter, no sort and no cross-link to the global hearings calendar. Matrix 64 asks for a sort bar on the *calendar* page, not inside the case file.

## `23_lawyer_case_documents_missing_delete_button.png`

**البيئة:** غير محدَّد · **بنود المصفوفة المرتبطة:** 67·68 (evidenced: no case-name / central-vault link and no trash tab on this row)·186 (evidenced: no category, no source, no soft-delete affordance on the row) · **إضافي:** 5

> Same lawyer case-file page, «المستندات» (Documents) tab selected. One document row listed. Same case header and same RTL lawyer sidebar with «جميع القضايا» active. Account type: lawyer. NO browser chrome, URL bar, tab title, or status bar captured (I zoomed the bottom-left strip to check) — environment not determinable from pixels.

187. The document row lacks a DOWNLOAD and a PREVIEW/open button, not just a delete button. Matrix 67 asks only for a trash icon; matrix 186 assumes downloads already exist (it asks for «سجل تدقيق للفتح والتنزيل»). Grep for "تنزيل"/"معاينة" returns nothing describing this row as missing them.
188. An internal dev artefact «TASK_TRACKER.md» is stored as a case document. Grep for "TASK_TRACKER" in matrix_rows.md = 0 hits. No row flags junk uploads or the absence of file-type restriction on case documents.
189. «1 مستندات» — Western digit plus wrong Arabic plural agreement for a count of one; and «1.1 KB» beside «٢٦ أغسطس ٢٠٢٦» in the same line. No matrix row covers numeral/grammar consistency.
190. The document row shows no category, no source and no uploader, so the list cannot be triaged. Matrix 186 asks for these as DB columns; no row observes that the UI row itself displays none of them.
191. ~80% of the document row is empty white space with all content pushed to the right edge.

## `24_lawyer_hearings_and_appointments_sidebar_naming.png`

**البيئة:** غير محدَّد · **بنود المصفوفة المرتبطة:** 64·70 (evidenced: the page's only creation CTA is «موعد جديد», with no hearing-specific path)·163-168 (evidenced: the floating WhatsApp button is present on a logged-in lawyer page) · **إضافي:** 5

> Lawyer dashboard, the global hearings/appointments page titled «المواعيد والجلسات» with count «0 مجدولة». Search bar + «الفرز المتقدم» control, a «+ موعد جديد» primary button and two view-toggle icons (calendar / list). Empty state below. RTL lawyer sidebar with «الجلسات القادمة» highlighted as the active item. Green WhatsApp FAB at bottom-left. Account type: lawyer. NO browser chrome, URL bar, tab title, or status bar captured — environment not determinable from pixels.

192. The empty state says «لا توجد مواعيد مطابقة للفلتر المختار» when no filter is set and the true count is zero. Grep for "الفلتر" in matrix_rows.md = 0 hits. This is wrong empty-state copy that will send the lawyer hunting for a filter that does not exist.
193. «0 مجدولة» — Western digit and wrong Arabic plural agreement, beside Arabic-Indic digits in the sidebar. No matrix row covers this.
194. «الفرز المتقدم» has no visual affordance (no chevron, no button chrome). Worth noting against matrix 64, whose third ask («شريط الفرز العلوي») already appears to be PRESENT on this page — so 64 is only partly outstanding.
195. This page renders with no top header/breadcrumb/logo while sibling pages have one, and with a noticeably narrower content column — two layout inconsistencies inside the same dashboard. No matrix row covers page-shell consistency.
196. The floating WhatsApp button is present here but absent on shots 21-23, i.e. the support widget is not applied consistently across lawyer pages. Rows 163-168 discuss the button's behaviour and placement but not its inconsistent presence.

## `25_lawyer_add_appointment_judicial_vs_non_judicial_modal.png`

**البيئة:** غير محدَّد · **بنود المصفوفة المرتبطة:** 70·168 (evidenced: the WhatsApp FAB renders above the modal backdrop) · **إضافي:** 8

> The «إضافة موعد / جلسة جديدة» modal opened over the «المواعيد والجلسات» page (shot 24's screen, dimmed behind a dark backdrop). Modal fields: نوع الموعد (select), القضية / الموكل (اختياري) (text input), التاريخ (required, native date input), الوقت (native time input), primary button «الخطوة التالية» (disabled), helper line beneath it. Account type: lawyer. NO browser chrome, URL bar, tab title, or status bar captured (I zoomed the top strip — it is the modal overlay tint, not a browser bar) — environment not determinable from pixels.

197. Native en-US «mm/dd/yyyy» date input, with the calendar icon on the left in an RTL form and the year segment rendering in Arabic-Indic while mm/dd stay Latin, plus no Hijri option. Grep for "mm/dd", "الميلادي", "الهجري" in matrix_rows.md = 0 hits each. For a Saudi court-hearing form this is a data-entry hazard (day/month transposition), not a cosmetic issue.
198. Native 12-hour AM/PM time input, and the time field is NOT required — a hearing can be scheduled with a date but no time. No matrix row covers this.
199. Label «نوع الموعد» vs placeholder «اختر التصنيف...» — two different words for the same field. Grep for "نوع الموعد" and "التصنيف" = 0 hits.
200. The required-field message sits below the submit button rather than under the التاريخ field, and the disabled primary gives no inline indication of which field blocks it. Grep for "الخطوة التالية" = 0 hits.
201. «الخطوة التالية» promises a multi-step flow with no step indicator anywhere in the modal.
202. The modal collects no court, no case number, no location/room, no duration, no reminder and no attendees. Matrix 70 asks for the judicial/non-judicial split and a preparation task, but does not enumerate these missing hearing fields.
203. The close «⊗» control has very low contrast.
204. (Adjacent, not strictly new) The WhatsApp FAB sits at full opacity ABOVE the modal backdrop. Matrix 168 asks for the button to be positioned so it does not obscure action buttons; this is the same fault in a more severe form — it escapes the modal's stacking context entirely.

## `26_lawyer_task_tracker_subtasks_gamification.png`

**البيئة:** غير محدَّد · **بنود المصفوفة المرتبطة:** 72·97·102 · **إضافي:** 9

> Lawyer dashboard task-list screen — title «قائمة المهام», subtitle «7 معلقة · 0 قيد التنفيذ · 2 مكتملة · 2 مؤرشفة», with the lawyer SharedSidebar pinned on the right (user «محمد جمالب», label «إعدادات محامي», nav: نظرة عامة / الجلسات القادمة / جميع القضايا / مهامي (active) / سجل النشاط / نظامي AI › ParaLegal / سؤال قانوني سريع / الصائغ القانوني / المجتمع البحثي). Account type = lawyer. No browser address bar, tab strip or status bar in the frame — only a dark slate strip along the very top edge — so no route or host is readable.

205. Junk/test task titles in a live task list («12341234», «1223123123», «سيبلسيبل», «سيؤسبيشى», «sdvdsf», «الحب الحب») — no matrix row mentions data pollution on this screen; row 72 asks only for subtask/gamification engineering
206. Mixed Arabic-Indic vs Western numerals inside one list («معلقة (٧)» vs «مكتملة (2)»)
207. Task rows render with no due date, priority, case link or assignee — a lone blue dot in a wide empty row
208. Two stacked filter bars (period row + attribute row) on one screen
209. Blank sidebar header with no logo or brand mark in frame — this is what matrix row 102 (تعميم الشعار الرسمي في كافة اللوحات) describes, and row 102 cites no screenshot
210. Sidebar nav clipped behind the pinned search box, with the scrollbar overlaying content
211. Untranslated «ParaLegal» in an Arabic sidebar
212. Truncated Hijri month name in the date pill («١٨ ربيع»)
213. Floating green action button clipped in half by the viewport edge

## `27_public_landing_fake_stats_social_proof.png`

**البيئة:** غير محدَّد · **بنود المصفوفة المرتبطة:** 75 · **إضافي:** 6

> Public (pre-login) landing page — the social-proof band: a white stats card with four counters, then the «يثق بنا أكثر من ٣٢,٠٠٠ عميل وشركة» line and a scrolling client strip. Anonymous visitor view. No address bar, tab title or status bar in the frame, so the route and host are not readable.

214. «٣٢,٠٠٠» in the trust line contradicts «+٣٢,٦٠٠» in the counter immediately above — two different totals for the same claim on one screen; matrix row 75 names only the ٣٢ ألف figure, not the conflict
215. The fake clients are rendered as generic stock icons rather than any brand mark, with two duplicate building glyphs — row 75 says delete the fake logos but does not record that they are placeholder iconography
216. Misaligned beige highlight blocks behind/through the numbers, clipping the captions at inconsistent widths
217. The client strip is captured clipped at both edges mid-scroll
218. Bidi/typography slip in «عقد تم تحليله بال AI» (dangling Arabic article before the Latin token)
219. Unevenly spaced dividers in the four-stat row

## `28_public_landing_community_and_blog_section.png`

**البيئة:** غير محدَّد · **بنود المصفوفة المرتبطة:** 76 · **إضافي:** 8

> Public (pre-login) landing page — community and knowledge band: «المجتمع بالأرقام» stat card, «أكثر المحامين تفاعلاً» card, «أبرز أسئلة المجتمع» list (3 questions + «اطرح سؤالك على المجتمع» CTA), and «أبرز المدونات القانونية» with three article cards. Anonymous visitor view. No address bar; the browser status bar at the bottom-left shows a hovered link target whose visible tail is «…mmunity/q/q2» (the leading part, including the host, is cut off by the screenshot crop), so the host is not readable.

220. Static hard-coded relative timestamps on the mock questions («منذ ساعتين» etc.) — row 76 names the mock arrays and the vote counts but not the frozen times
221. Fabricated blog view counts and persona author bylines — row 76 asks only to link real articles, it does not record that the counts and authors shown are invented
222. All three «latest» blog articles are dated مارس 2026, i.e. months stale
223. Article cards render with no cover image; the top of each card is blank
224. Mixed Arabic-Indic and Western numerals inside a single question meta row (and again on the blog cards)
225. Lawyer avatars are initials placeholders with inconsistent colors that imply a ranking the ratings contradict
226. Inconsistent «see all» affordances across the three sibling cards («الكل» with no arrow vs «كل الأسئلة ←» / «كل المقالات ←»)
227. The community CTA is styled as a dashed placeholder box rather than a button

## `29_public_landing_business_section_fake_stats.png`

**البيئة:** غير محدَّد · **بنود المصفوفة المرتبطة:** 77 · **إضافي:** 4

> Public (pre-login) landing page — corporate/business band: a dark green card with eyebrow «لماذا نظامي للأعمال؟», heading «شريكك القانوني الاستراتيجي», a one-line pitch, four feature chips (سرعة تامة · استجابة ٢٤/٧ · امتثال مضمون · AI قانوني متقدم) and a 2×2 stat grid. Anonymous visitor view. No address bar or status bar in the frame, so the route and host are not readable.

228. «٢٤ س متوسط وقت الاستجابة» — a fourth invented statistic that matrix row 77 does not list (row 77 names only 98%, 500 companies and the 40% saving), and it directly contradicts «استجابة ٢٤/٧» and «سرعة تامة» printed on the same card
229. Icon/label mismatch: a padlock icon on the «سرعة تامة» (speed) chip
230. «امتثال مضمون» — an unqualified guarantee of compliance with no scope or disclaimer
231. Unbalanced layout: text column and stat grid off-baseline, leaving an empty band across the bottom third of the card

## `30_public_landing_navbar_and_service_naming.png`

**البيئة:** غير محدَّد · **بنود المصفوفة المرتبطة:** 78 · **إضافي:** 6

> Public (pre-login) landing page — the floating navbar strip only (a 95px-tall crop): gold «نظامي» wordmark and emblem, nav items الرئيسية / خدمات الأفراد / الشركات / المحامين / نظامي AI / الاشتراكات / المعرفة القانونية ⌄, then an «SA + flag» pill, a globe icon, a moon (dark-mode) icon, a «دخول» text link and a green «سجل مجاناً» CTA. Anonymous visitor view. No address bar, tab title or status bar in the frame — only a dark slate strip along the top edge — so the route and host are not readable. The Services Bento cards named by matrix row 78 are not in this frame.

232. Only one of the seven nav items has a dropdown — «خدمات الأفراد» and «الشركات» are flat links with no sub-menu, so the service pillars row 78 wants unified are not exposed in the nav at all
233. «نظامي AI» mixes Latin script into the Arabic nav row
234. Duplicated locale affordances: an «SA + flag» pill and a globe icon adjacent to each other
235. The flag glyph renders as a generic green flag rather than the Saudi flag
236. No search entry point in the public navbar
237. «دخول» rendered as an unstyled text link with an orphaned divider rule beside the icon cluster

## `31_lawyer_add_client_modal_step1_individual_vs_company.png`

**البيئة:** غير محدَّد · **بنود المصفوفة المرتبطة:** 80 · **إضافي:** 4

> The "إضافة موكّل جديد" (Add new client) modal, "الخطوة 1 من 3 — البيانات الأساسية" (Step 1 of 3 — Basic data), open over the lawyer clients page (heading «الموكلون» visible behind a heavy backdrop blur). Lawyer dashboard sidebar on the right. ENVIRONMENT: the browser URL bar is cropped out of frame — only the Chrome bookmarks bar (montage · montage · claude · الضرائب · بحث · VEO3 · law · VIBE CODING · حماية حقوق المساهم… · header-logo · Online Audio Conve…) is in the shot. The bookmarks bar is pixel-identical to images 32 and 34, and the blurred page behind the modal is the same clients page image 32 shows at nezamy.sa/dashboard/lawyer/clients — so this is almost certainly the same production session, but the image itself carries no host string, so I mark it undetermined rather than guess.

238. The step label says «البيانات الأساسية» but a three-field form is all the wizard's first step contains; combined with image 32 (step 3 = tags only), a three-step wizard captures three data fields.
239. Two different conventions for optionality inside one three-field form: the two required fields are marked with a bare asterisk (الاسم الكامل *, رقم الجوال *) while the third spells it out in the label text (البريد الإلكتروني (اختياري)).
240. The phone placeholder «+966 5X XXX XXXX» renders LTR and sits flush against the LEFT edge of its RTL input, while the name field's content sits at the RIGHT edge — the two inputs in the same form align their contents to opposite sides.
241. «التالي» is rendered disabled (washed-out sage green) with no inline validation text and no hint as to which required field is blocking it; the only cue is the asterisk on رقم الجوال.

## `32_lawyer_add_client_modal_step3_tags_and_save_failure.png`

**البيئة:** الإنتاج · **بنود المصفوفة المرتبطة:** 79 · **إضافي:** 7

> Same "إضافة موكّل جديد" modal at "الخطوة 3 من 3 — التصنيفات" (Step 3 of 3 — Classifications), over the lawyer clients page. URL bar reads nezamy.sa/dashboard/lawyer/clients — production, lawyer account. Body: prompt «اختر التصنيفات المناسبة للموكّل:» and eight tag chips in two rows — 👑 VIP · 💸 متأخر بالسداد · ⚠️ تعامل صعب · 🆕 جديد / 🤝 دائم · 🔴 قضية حرجة · 🏢 شركة · 💤 غير نشط. Footer: «السابق» (right) and «✓ إضافة الموكّل» (left).

242. NO ERROR MESSAGE IS VISIBLE ANYWHERE IN THE FRAME. The filename and matrix row 79 (and master_log.md:931) both assert a red «تعذّر حفظ الموكّل. حاول مرة أخرى.». I zoomed the modal body, the modal footer, and the strip of page immediately below the modal where a toast would sit — that strip contains only the blurred dark-green «+ إضافة موكل» button of the page underneath. There is no red text, no inline error, no toast. Either the shot predates the click, or the failure surfaced nothing on screen.
243. Roughly 55% of the modal body is empty white space — the eight chips occupy two rows at the top and everything from there down to the footer divider is blank.
244. The final step of an "add client" wizard collects nothing but eight optional emoji tags — no notes field, no fee agreement, no case link, no free-text tag entry, and no way to create a tag outside the fixed list of eight.
245. «🏢 شركة» is offered as a TAG here although «شركة» is already a client-TYPE toggle in step 1 (image 31) — the same attribute is captured twice, in two places, with nothing coupling them.
246. The primary CTA «✓ إضافة الموكّل» is a bright emerald green that does not match the dark forest green used by every other primary control in the product, including the «فرد» toggle inside this same modal, the «+ جدولة استشارة» button in image 34, and the sidebar «كاملة» pill. Two different brand greens appear in one modal.
247. All eight classifications are emoji-led in a professional legal CRM, and two of them are derogatory labels stored against a named client: «⚠️ تعامل صعب» (difficult to deal with) and «💸 متأخر بالسداد» (late payer).
248. «متأخر بالسداد» appears to render with no visible word gap («متأخربالسداد») — possible missing space. Low confidence: the source glyphs are ~6px tall and this may be tight kerning rather than a missing character.

## `33_navbar_logo_shows_letter_noon_instead_of_official_logo.png`

**البيئة:** الإنتاج · **بنود المصفوفة المرتبطة:** 101·168 · **إضافي:** 8

> The «طلباتي» (My Requests) list, rendered at a high page zoom so the narrow/medium header is in use. Header: ☰ hamburger + 🔔 bell on the LEFT; on the RIGHT the wordmark «نظامي» beside a dark-green rounded square containing a gold letter «ن». Nine request cards visible: خطاب رسمي — إخطار رسمي (الرأي الفصل · ٢٠٢٦/٨/٢٥) جاهز; خطاب رسمي — إنذار قانوني (الرأي الفصل · ٢٠٢٦/٨/٢٣) قيد التنفيذ; المحاكي الشامل — نظام العمل (المحاكي الشامل · ٢٠٢٦/٨/٢٣) قيد التنفيذ; محترف العقود — مراجعة عقد (محترف العقود · ٢٠٢٦/٨/٢٣) بانتظار الاستلام; محترف العقود — صياغة عقد (محترف العقود · ٢٠٢٦/٨/٢٣) جاهز; محترف العقود — صياغة عقد (محترف العقود · ٢٠٢٦/٨/٢٣) ملغى; خطاب رسمي — إخطار رسمي (الرأي الفصل · ٢٠٢٦/٨/١٩) بانتظار الاستلام; المحاكي الشامل — مدني (المحاكي الشامل · ٢٠٢٦/٨/١٧) بانتظار الاستلام. ENVIRONMENT: the URL bar is cropped at the very top, but the browser status bar at the bottom-left reads «nezamy.sa/.../2e1e3417-b8b7-4284…» (a hovered link to a request UUID) — production. Account type not directly shown; the page is a consumer request log, so client-side rather than the lawyer dashboard.

249. Rows 5 and 6 are INDISTINGUISHABLE: identical title («محترف العقود — صياغة عقد»), identical source, identical date (٢٠٢٦/٨/٢٣), one «جاهز» and one «ملغى». There is no reference number, no time-of-day and no other disambiguator, so the user cannot tell which request is which.
250. On the three «خطاب رسمي» rows the source line names a different tool than the title — the title says «خطاب رسمي — إخطار رسمي» / «خطاب رسمي — إنذار قانوني» while the source reads «الرأي الفصل». On the «المحاكي الشامل» and «محترف العقود» rows the title and the source name the same tool. Stated as an observation only: «الرأي الفصل» is the platform's own product name (master_log.md:1022) and the letter tool is documented as being built on its pillars (master_log.md:607, :1140), so whether this is a wrong label or intended attribution cannot be decided from pixels.
251. Every card's second line simply repeats the tool name already in its title (e.g. «محترف العقود — صياغة عقد» / «محترف العقود · ٢٠٢٦/٨/٢٣») — the metadata row carries no information the title doesn't.
252. The list has no search, no filter, no status tabs, no sort and no total count — unlike the consultations page in image 34, which renders four status chips and a search box over ZERO rows while this page renders nine rows with no controls at all.
253. The cards carry no action affordance — no «عرض»/«تحميل» button, no chevron, no icon. The only evidence the card is clickable is the browser status bar exposing a raw UUID URL on hover.
254. Three of nine requests sit at «بانتظار الاستلام» (awaiting collection), the oldest dated ٢٠٢٦/٨/١٧ — around two weeks old at the ٨/٣١ capture date, with nothing on the card saying whether the wait is on the user or the platform.
255. Dates are Gregorian in Arabic-Indic digits with no time component (٢٠٢٦/٨/٢٥), while the lawyer sidebar in image 34 leads with a Hijri date pill — date presentation is not consistent across the product.
256. The header is nearly empty at this viewport: a hamburger and a bell and nothing else. No user avatar or account menu, no breadcrumb, no back control.

## `34_lawyer_consultations_management_view.png`

**البيئة:** الإنتاج · **بنود المصفوفة المرتبطة:** 108·112·118 · **إضافي:** 5

> The lawyer consultations page. URL bar reads nezamy.sa/dashboard/lawyer/consultations — production. Account is a lawyer: sidebar shows «محمد جمالب» / «إعدادات محامي» with a «م» avatar. Main column: heading «الاستشارات» with «٠ قادمة · ٠ إجمالاً», a «+ جدولة استشارة» button, three stat cards (قادمة ٠ · مكتملة ٠ · ملغاة ٠), a search box «بحث...» with four filter chips (الكل active + three status chips), an empty state (calendar icon + «لم تصلك استشارات بعد»), and an amber banner at the bottom. Sidebar: «لايت | كاملة» density toggle, «طلبات التزكية», collapsed «المزيد (٥)», groups العملاء / العقود والمستندات / الماليات / أدوات إضافية, items دليل العملاء · الاستشارات (active) · مدير العقود · المستندات · الأرشيف الموحد [قريباً badge] · الإيرادات والفواتير · المرشد القضائي, a «ابحث عن أداة...» ⌘K search, and «💡 هل عندك فكرة جديدة؟».

257. Duplicated filtering in ~60px of vertical space: the three stat cards (قادمة / مكتملة / ملغاة) and the four filter chips directly beneath them (الكل plus those same three statuses) present the identical status breakdown twice.
258. A search box and four filter chips are rendered above an empty list — controls that filter and search zero rows.
259. The page contradicts itself about what a consultation is: the primary CTA is «+ جدولة استشارة» (the lawyer schedules one) while the empty state says «لم تصلك استشارات بعد» (you have not RECEIVED any consultations yet). Outbound scheduling and inbound booking are mixed in one screen.
260. The sidebar Hijri date pill reads «الاثنين ١٨ ربيع ٣١/٨» — the Hijri month is truncated to «ربيع» with no الأول or الآخر, leaving the Hijri date ambiguous (two different months share that name).
261. The sidebar carries a «لايت | كاملة» density toggle, a collapsed «المزيد (٥)» group, up/down scroll arrows and its own ⌘K «ابحث عن أداة...» search box — a navigation menu that needs paging and a search engine of its own to be usable.


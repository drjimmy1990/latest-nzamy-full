-- 20260706_articles_seed.sql
-- Seed public.articles with the existing static blog content so the current
-- blog survives the DB cutover. Source of truth:
--   src/constants/platformContent.ts  (PLATFORM_BLOG_ARTICLES — full markdown body)
--   src/app/blog/page.tsx             (ARTICLES — same 6 slugs)
-- Mapping: slug, title, title_en, excerpt, excerpt_en, category, cover,
--   body (= content markdown), status='published', featured, published_at,
--   read_time, author_name.
-- ON CONFLICT (slug) DO NOTHING so re-running is safe and admin edits are never
-- clobbered. `articles` table is created in 20260706_content_and_ops.sql.

insert into public.articles
  (slug, title, title_en, excerpt, excerpt_en, category, cover, body, status, featured, published_at, read_time, author_name)
values
  (
    'wrongful-termination-rights',
    'حقوق العمال في حالة الفصل التعسفي - دليلك الشامل',
    'Workers'' Rights in Wrongful Termination - Complete Guide',
    'استعراض مبسط لما يكفله نظام العمل السعودي عند الفصل التعسفي، وكيف يبدأ العامل في حفظ حقوقه وإثبات الضرر.',
    'A practical overview of Saudi labor protections in wrongful termination cases and the first steps to preserve rights.',
    'labor',
    null,
    E'\n## ما هو الفصل التعسفي؟\n\nالفصل التعسفي هو إنهاء عقد العمل دون سبب مشروع كاف، أو دون اتباع الإجراءات النظامية المقررة. في هذه الحالة لا تنحصر حقوق العامل في الراتب المتأخر فقط، بل تمتد إلى التعويض ومكافأة نهاية الخدمة وما يرتبط بفترة الإشعار.\n\n## ما الحقوق الأساسية؟\n\n1. **مكافأة نهاية الخدمة** بحسب مدة العلاقة ونوع العقد.\n2. **تعويض عادل** عند ثبوت عدم مشروعية الإنهاء.\n3. **أجر فترة الإشعار** إذا لم يلتزم صاحب العمل بها.\n4. **توثيق المخاطبات** ورسائل البريد والقرارات الداخلية لإثبات التسلسل الزمني.\n\n## ماذا تفعل أولاً؟\n\nابدأ بطلب نسخة مكتوبة من قرار الإنهاء وسبب الفصل، ثم راجع عقدك ومسير الرواتب والمخاطبات. إذا لم يتم الحل ودياً، فالمسار الطبيعي يبدأ بتسوية عمالية ثم دعوى أمام المحكمة العمالية عند الحاجة.\n',
    'published',
    true,
    '2026-02-15T00:00:00Z',
    '٧ دقائق',
    'أ. أحمد محمد الغامدي'
  ),
  (
    'commercial-disputes',
    'كيف تحمي شركتك من النزاعات التجارية قبل فوات الأوان؟',
    'How to Protect Your Business from Commercial Disputes Before It Is Too Late',
    'إجراءات وقائية في العقود والمراسلات وإدارة المخاطر تقلل تكلفة النزاع قبل أن يتحول إلى مطالبة قضائية.',
    'Preventive steps in contracts, correspondence, and risk management before disputes become litigation.',
    'commercial',
    null,
    E'\n## الوقاية تبدأ قبل التوقيع\n\nأغلب النزاعات التجارية تبدأ من بند غامض أو مراسلة غير موثقة. لذلك يجب أن يكون نطاق العمل، آلية التسليم، الجزاءات، الاختصاص، وحالات القوة القاهرة مكتوبة بوضوح.\n\n## إدارة المراسلات\n\nاجعل كل تعديل جوهري في العقد موثقاً كتابة، وتجنب الاعتماد على الاتفاقات الشفهية. البريد الرسمي وسجل المحاضر الداخلية قد يحسمان النزاع قبل المحكمة.\n\n## متى تستشير محامياً؟\n\nاستشر مبكراً عند ظهور تأخير متكرر أو رفض دفع أو تغيير نطاق العمل. التدخل المبكر غالباً أقل تكلفة من معالجة نزاع مكتمل.\n',
    'published',
    true,
    '2026-01-20T00:00:00Z',
    '٩ دقائق',
    'أ. خالد المطيري'
  ),
  (
    'lease-contracts-guide',
    'دليلك الكامل لعقود الإيجار في السعودية ٢٠٢٦',
    'Complete Guide to Lease Contracts in KSA 2026',
    'أهم البنود التي يجب مراجعتها في عقد الإيجار قبل التوقيع، من مدة العقد إلى الصيانة والإخلاء والتعويض.',
    'Key lease clauses to review before signing, from term and maintenance to eviction and compensation.',
    'civil',
    null,
    E'\n## عقد الإيجار ليس نموذجاً واحداً\n\nتختلف المخاطر بحسب نوع العين المؤجرة والغرض من الانتفاع. راجع مدة العقد، التمديد، الصيانة، الالتزامات المالية، وحالات الإخلاء قبل التوقيع.\n\n## نقطة عملية\n\nلا تترك بند الصيانة عاماً. حدد من يتحمل الصيانة الدورية، ومن يتحمل الإصلاحات الجوهرية، وكيف يتم الإخطار والمهلة.\n',
    'published',
    false,
    '2025-12-12T00:00:00Z',
    '٦ دقائق',
    'أ. سارة العتيبي'
  ),
  (
    'end-of-service-calculator',
    'كيف تحسب مكافأة نهاية الخدمة بدقة؟',
    'How to Calculate End-of-Service Accurately',
    'شرح مبسط لعوامل حساب مكافأة نهاية الخدمة، وما الذي يغير النتيجة بين الاستقالة والإنهاء.',
    'A clear explanation of end-of-service calculation factors and what changes between resignation and termination.',
    'labor',
    null,
    E'\n## عوامل الحساب\n\nيعتمد الحساب على الأجر الأخير، مدة الخدمة، سبب انتهاء العلاقة، ونوع العقد. لذلك لا يصح حساب المكافأة بمعزل عن ملف العلاقة العمالية كاملاً.\n',
    'published',
    false,
    '2025-11-18T00:00:00Z',
    '٥ دقائق',
    'أ. أحمد محمد الغامدي'
  ),
  (
    'custody-procedures',
    'إجراءات الحضانة في المملكة - ما تحتاج معرفته',
    'Custody Procedures in Saudi Arabia - What You Need to Know',
    'نظرة عملية على معايير الحضانة، ومتى تكون مصلحة المحضون هي محور القرار.',
    'A practical look at custody standards and how the child''s best interest guides the decision.',
    'family',
    null,
    E'\n## معيار المصلحة\n\nقضايا الحضانة لا تدور حول رغبة أحد الطرفين فقط، بل حول مصلحة المحضون واستقرار رعايته وسلامته.\n',
    'published',
    false,
    '2025-10-22T00:00:00Z',
    '٨ دقائق',
    'أ. سارة العتيبي'
  ),
  (
    'company-data-protection',
    'حماية البيانات للشركات في ضوء الأنظمة السعودية',
    'Data Protection for Companies Under Saudi Regulations',
    'التزامات عملية على الشركات عند جمع البيانات الشخصية ومعالجتها ومشاركتها.',
    'Operational duties for companies collecting, processing, and sharing personal data.',
    'commercial',
    null,
    E'\n## الامتثال ليس سياسة ورقية\n\nحماية البيانات تبدأ من تحديد الأساس النظامي للمعالجة، ثم تنظيم الموافقات، الحفظ، صلاحيات الوصول، وآلية الاستجابة للطلبات.\n',
    'published',
    false,
    '2025-09-09T00:00:00Z',
    '١٠ دقائق',
    'أ. خالد المطيري'
  )
on conflict (slug) do nothing;

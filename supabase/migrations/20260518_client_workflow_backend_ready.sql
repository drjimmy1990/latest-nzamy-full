-- Client workflow backend-ready schema for Nzamy.
-- Run after Supabase Auth is enabled. RLS policies assume authenticated users.

create table if not exists public.service_requests (
  id text primary key,
  requester_user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('service', 'consultation', 'business_case', 'ngo_volunteer', 'ai_draft')),
  title text not null,
  description text not null default '',
  requester jsonb not null default '{}'::jsonb,
  receiver text not null check (receiver in ('lawyer', 'firm', 'provider', 'business_legal', 'ngo_admin', 'government_reviewer', 'ai_workspace')),
  assigned_to uuid references auth.users(id) on delete set null,
  status text not null check (status in ('draft', 'pending_payment', 'pending_assignment', 'assigned', 'in_review', 'completed', 'cancelled')),
  payment jsonb not null default '{"amount":0,"status":"not_required"}'::jsonb,
  source_path text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.request_events (
  id bigserial primary key,
  request_id text not null references public.service_requests(id) on delete cascade,
  event text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text not null default 'system',
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id text primary key,
  request_id text not null references public.service_requests(id) on delete cascade,
  provider text not null default 'stub',
  amount numeric(12,2) not null default 0,
  currency text not null default 'SAR',
  status text not null check (status in ('not_required', 'requires_payment', 'paid', 'failed', 'refunded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.attachments (
  id bigserial primary key,
  request_id text not null references public.service_requests(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.consultations (
  id text primary key,
  request_id text not null unique references public.service_requests(id) on delete cascade,
  requester_user_id uuid references auth.users(id) on delete set null,
  lawyer_user_id uuid references auth.users(id) on delete set null,
  mode text not null check (mode in ('ai', 'video', 'voice', 'text', 'in-person')),
  specialty text,
  scheduled_at timestamptz,
  status text not null default 'pending_assignment',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cases (
  id text primary key,
  request_id text unique references public.service_requests(id) on delete set null,
  client_user_id uuid references auth.users(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  title text not null,
  status text not null default 'open',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contracts (
  id text primary key,
  request_id text unique references public.service_requests(id) on delete set null,
  client_user_id uuid references auth.users(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  contract_type text not null default 'general',
  status text not null default 'draft',
  document_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id bigserial primary key,
  request_id text not null references public.service_requests(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete set null,
  receiver_user_id uuid references auth.users(id) on delete set null,
  body text not null default '',
  attachment_id bigint references public.attachments(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_pricing_catalog (
  service_id text primary key,
  audience text not null default 'individual',
  category_id text not null,
  label_ar text not null,
  base_price numeric(12,2) not null default 0,
  price_mode text not null,
  receiver_type text not null,
  beta_visibility text not null default 'public',
  requires_payment boolean not null default true,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text references public.service_requests(id) on delete set null,
  amount numeric(12,2) not null,
  kind text not null check (kind in ('credit', 'debit', 'pending', 'reversal')),
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null default '',
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.service_requests enable row level security;
alter table public.request_events enable row level security;
alter table public.payments enable row level security;
alter table public.attachments enable row level security;
alter table public.consultations enable row level security;
alter table public.cases enable row level security;
alter table public.contracts enable row level security;
alter table public.messages enable row level security;
alter table public.admin_pricing_catalog enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.notifications enable row level security;

create policy "clients read their own service requests"
  on public.service_requests for select
  using (requester_user_id = auth.uid() or assigned_to = auth.uid());

create policy "clients create their own service requests"
  on public.service_requests for insert
  with check (requester_user_id = auth.uid());

create policy "participants update service requests"
  on public.service_requests for update
  using (requester_user_id = auth.uid() or assigned_to = auth.uid())
  with check (requester_user_id = auth.uid() or assigned_to = auth.uid());

create policy "participants read request events"
  on public.request_events for select
  using (
    exists (
      select 1 from public.service_requests sr
      where sr.id = request_events.request_id
      and (sr.requester_user_id = auth.uid() or sr.assigned_to = auth.uid())
    )
  );

create policy "participants create request events"
  on public.request_events for insert
  with check (
    exists (
      select 1 from public.service_requests sr
      where sr.id = request_events.request_id
      and (sr.requester_user_id = auth.uid() or sr.assigned_to = auth.uid())
    )
  );

create policy "participants read payments"
  on public.payments for select
  using (
    exists (
      select 1 from public.service_requests sr
      where sr.id = payments.request_id
      and (sr.requester_user_id = auth.uid() or sr.assigned_to = auth.uid())
    )
  );

create policy "participants read attachments"
  on public.attachments for select
  using (
    exists (
      select 1 from public.service_requests sr
      where sr.id = attachments.request_id
      and (sr.requester_user_id = auth.uid() or sr.assigned_to = auth.uid())
    )
  );

create policy "participants create attachments"
  on public.attachments for insert
  with check (
    exists (
      select 1 from public.service_requests sr
      where sr.id = attachments.request_id
      and sr.requester_user_id = auth.uid()
    )
  );

create policy "participants read consultations"
  on public.consultations for select
  using (requester_user_id = auth.uid() or lawyer_user_id = auth.uid());

create policy "participants read cases"
  on public.cases for select
  using (client_user_id = auth.uid() or assigned_user_id = auth.uid());

create policy "participants read contracts"
  on public.contracts for select
  using (client_user_id = auth.uid() or assigned_user_id = auth.uid());

create policy "participants read messages"
  on public.messages for select
  using (
    exists (
      select 1 from public.service_requests sr
      where sr.id = messages.request_id
      and (sr.requester_user_id = auth.uid() or sr.assigned_to = auth.uid())
    )
  );

create policy "participants create messages"
  on public.messages for insert
  with check (
    exists (
      select 1 from public.service_requests sr
      where sr.id = messages.request_id
      and (sr.requester_user_id = auth.uid() or sr.assigned_to = auth.uid())
    )
  );

create policy "users read own wallet transactions"
  on public.wallet_transactions for select
  using (user_id = auth.uid());

create policy "users read own notifications"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "public read enabled individual pricing"
  on public.admin_pricing_catalog for select
  using (enabled = true and audience = 'individual');

insert into public.admin_pricing_catalog
  (service_id, audience, category_id, label_ar, base_price, price_mode, receiver_type, beta_visibility, requires_payment, enabled, metadata)
values
  ('ai-consult', 'individual', 'consultation', 'سؤال AI فوري', 49, 'free', 'ai_workspace', 'public', false, true,
    '{"route":"/ai/consult","icon":"Robot","requestType":"consultation","priceNote":"لك سؤال واحد مجانا يوميا أو 49 ر.س إضافي","includedByPlan":"free_daily","aiPowered":true}'::jsonb),
  ('video-short', 'individual', 'consultation', 'استشارة مرئية مختصرة (30 دقيقة)', 500, 'fixed', 'lawyer', 'public', true, true,
    '{"route":"/dashboard/client/consultation/new?type=video-short","icon":"VideoCamera","requestType":"consultation","priceNote":"مرئية أونلاين - 30 دقيقة","humanService":true}'::jsonb),
  ('video-full', 'individual', 'consultation', 'استشارة مرئية كاملة (60 دقيقة)', 500, 'fixed', 'lawyer', 'public', true, true,
    '{"route":"/dashboard/client/consultation/new?type=video-full","icon":"VideoCamera","requestType":"consultation","priceNote":"مرئية أونلاين - 60 دقيقة","tag":"الأشمل","humanService":true}'::jsonb),
  ('in-person', 'individual', 'consultation', 'استشارة حضورية (60 دقيقة)', 700, 'fixed', 'lawyer', 'public', true, true,
    '{"route":"/dashboard/client/consultation/new?type=in-person","icon":"Users","requestType":"consultation","priceNote":"حضوري في مكتب المحامي","humanService":true}'::jsonb),
  ('written-opinion', 'individual', 'consultation', 'رأي قانوني مكتوب', 250, 'fixed', 'lawyer', 'public', true, true,
    '{"route":"/dashboard/client/consultation/new?type=written-opinion","icon":"FileText","requestType":"consultation","priceNote":"يسلم خلال 2-3 أيام عمل","humanService":true}'::jsonb),
  ('contract-draft', 'individual', 'contracts', 'صياغة عقد مخصص', 99, 'included', 'ai_workspace', 'public', false, true,
    '{"route":"/ai/contract-drafter","icon":"PencilSimple","requestType":"ai_draft","priceNote":"أو ابتداء من 99 ر.س للطلب","includedByPlan":"ai_individual","tag":"الأكثر طلبا","aiPowered":true}'::jsonb),
  ('contract-analyze', 'individual', 'contracts', 'تحليل عقد وكشف المخاطر', 79, 'included', 'ai_workspace', 'public', false, true,
    '{"route":"/ai/analyze?mode=doc","icon":"Scan","requestType":"ai_draft","priceNote":"أو 79 ر.س للتحليل المفصل","includedByPlan":"ai_individual","aiPowered":true}'::jsonb),
  ('contract-review', 'individual', 'contracts', 'مراجعة من محام متخصص', 800, 'starting_from', 'lawyer', 'public', true, true,
    '{"route":"/dashboard/client/requests/new?type=contract-review","icon":"MagnifyingGlass","requestType":"service","priceNote":"2x سعر مراجعة المحامي","humanService":true}'::jsonb),
  ('ai-case-eval', 'individual', 'case-study', 'تقييم أولي بالذكاء الاصطناعي', 79, 'free', 'ai_workspace', 'public', false, true,
    '{"route":"/ai/analyze?mode=eval","icon":"Robot","requestType":"ai_draft","priceNote":"مشمول في الباقة أو 79 ر.س","includedByPlan":"free_daily","tag":"جديد","aiPowered":true}'::jsonb),
  ('case-study', 'individual', 'case-study', 'دراسة قضية كاملة', 1600, 'starting_from', 'lawyer', 'public', true, true,
    '{"route":"/dashboard/client/requests/new?type=case-study","icon":"Scales","requestType":"service","priceNote":"2x سعر المحامي الأساسي","tag":"موصى به","humanService":true}'::jsonb),
  ('second-opinion', 'individual', 'case-study', 'رأي ثان في قضية قائمة', 600, 'starting_from', 'lawyer', 'public', true, true,
    '{"route":"/dashboard/client/requests/new?type=second-opinion","icon":"Users","requestType":"service","priceNote":"2x سعر الرأي القانوني المكتوب","humanService":true}'::jsonb),
  ('legal-research', 'individual', 'case-study', 'بحث قانوني متخصص', 800, 'starting_from', 'lawyer', 'public', true, true,
    '{"route":"/dashboard/client/requests/new?type=legal-research","icon":"MagnifyingGlass","requestType":"service","priceNote":"2x سعر البحث القانوني","humanService":true}'::jsonb),
  ('file-lawsuit', 'individual', 'legal-filing', 'لائحة دعوى ابتدائية', 1600, 'starting_from', 'lawyer', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=file-lawsuit","icon":"Gavel","requestType":"service","priceNote":"2x سعر المحامي الأساسي","humanService":true}'::jsonb),
  ('appeal', 'individual', 'legal-filing', 'مذكرة استئناف', 2000, 'starting_from', 'lawyer', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=appeal","icon":"Scales","requestType":"service","priceNote":"2x سعر المحامي","tag":"شائع","humanService":true}'::jsonb),
  ('cassation', 'individual', 'legal-filing', 'مذكرة نقض / التماس', 3000, 'starting_from', 'lawyer', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=cassation","icon":"Scales","requestType":"service","priceNote":"2x سعر المحامي","humanService":true}'::jsonb),
  ('defense', 'individual', 'legal-filing', 'مذكرة رد أو دفاع', 1000, 'starting_from', 'lawyer', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=defense","icon":"FileText","requestType":"service","priceNote":"2x سعر المحامي","humanService":true}'::jsonb),
  ('admin-objection', 'individual', 'legal-filing', 'اعتراض على قرار إداري', 800, 'starting_from', 'lawyer', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=admin-objection","icon":"Buildings","requestType":"service","priceNote":"حسب تعقيد الاعتراض","humanService":true}'::jsonb),
  ('mediation', 'individual', 'arbitration', 'جلسة وساطة', 800, 'starting_from', 'provider', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=mediation","icon":"Users","requestType":"service","priceNote":"يشمل جلستين + وثيقة التسوية","tag":"موصى به","humanService":true}'::jsonb),
  ('full-arbitration', 'individual', 'arbitration', 'تحكيم تجاري كامل', 3000, 'custom', 'provider', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=full-arbitration","icon":"Gavel","requestType":"service","priceNote":"حسب تقييم المحكم","humanService":true}'::jsonb),
  ('settlement', 'individual', 'arbitration', 'صياغة اتفاقية تسوية', 399, 'starting_from', 'lawyer', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=settlement","icon":"CheckCircle","requestType":"service","humanService":true}'::jsonb),
  ('ai-letter', 'individual', 'special', 'صياغة خطاب رسمي بالذكاء الاصطناعي', 49, 'free', 'ai_workspace', 'beta_hidden', false, false,
    '{"route":"/dashboard/client/letters","icon":"Envelope","requestType":"ai_draft","priceNote":"مشمول في الباقة أو 49 ر.س بالعمل القانوني","includedByPlan":"ai_individual","tag":"الأسرع","aiPowered":true}'::jsonb),
  ('legal-notice', 'individual', 'special', 'إنذار قانوني رسمي', 400, 'starting_from', 'lawyer', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=legal-notice","icon":"Receipt","requestType":"service","tag":"الأسرع","humanService":true}'::jsonb),
  ('power-of-attorney', 'individual', 'special', 'توثيق وكالة قانونية', 600, 'starting_from', 'provider', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=power-of-attorney","icon":"Stamp","requestType":"service","humanService":true}'::jsonb),
  ('inheritance', 'individual', 'special', 'قسمة تركة وحصر الورثة', 1000, 'starting_from', 'lawyer', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=inheritance","icon":"Users","requestType":"service","humanService":true}'::jsonb),
  ('enforce-judgment', 'individual', 'special', 'متابعة تنفيذ حكم', 1200, 'starting_from', 'provider', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=enforce-judgment","icon":"Gavel","requestType":"service","priceNote":"إجراء تنفيذي - يختلف عن الصياغة","humanService":true}'::jsonb),
  ('translation', 'individual', 'special', 'ترجمة قانونية معتمدة', 300, 'per_page', 'provider', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=translation","icon":"Translate","requestType":"service","priceNote":"يبدأ من 150 ر.س / صفحة","humanService":true}'::jsonb),
  ('general', 'individual', 'special', 'طلب عام', 500, 'starting_from', 'lawyer', 'internal', true, false,
    '{"route":"/dashboard/client/requests/new?type=general","icon":"ShieldStar","requestType":"service","humanService":true}'::jsonb)
on conflict (service_id) do update set
  audience = excluded.audience,
  category_id = excluded.category_id,
  label_ar = excluded.label_ar,
  base_price = excluded.base_price,
  price_mode = excluded.price_mode,
  receiver_type = excluded.receiver_type,
  beta_visibility = excluded.beta_visibility,
  requires_payment = excluded.requires_payment,
  enabled = excluded.enabled,
  metadata = excluded.metadata,
  updated_at = now();

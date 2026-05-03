create table if not exists public.sales_report_documents (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid references auth.users(id) on delete set null,
  file_name text not null,
  file_type text not null,
  file_size integer not null check (file_size >= 0),
  storage_bucket text not null default 'sales-report-documents',
  storage_path text not null unique,
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'auto_published', 'needs_review', 'published', 'failed')
  ),
  confidence_score numeric(4,3),
  raw_extraction jsonb,
  extraction_errors text[],
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_sales_reports (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references public.sales_report_documents(id) on delete cascade,
  report_date date not null,
  cashier_name text,
  shift_start_at timestamptz,
  shift_end_at timestamptz,
  topup_register_amount numeric(12,2),
  freebies numeric(12,2),
  deducted_amount numeric(12,2),
  refund_balance numeric(12,2),
  cashier_m_plus numeric(12,2),
  cashier_user_m_plus numeric(12,2),
  items_sales numeric(12,2),
  user_purchase numeric(12,2),
  free_items numeric(12,2),
  point_redemption numeric(12,2),
  cash_stock_in numeric(12,2),
  received_from_last_shift numeric(12,2),
  reserve_to_next_duty numeric(12,2),
  reload_coupon numeric(12,2),
  card_fee_registered numeric(12,2),
  other_expenses numeric(12,2),
  shift_income numeric(12,2),
  total_cash numeric(12,2),
  off_duty_amount numeric(12,2),
  gross_sales numeric(12,2),
  net_sales numeric(12,2),
  discounts numeric(12,2),
  tax numeric(12,2),
  refunds numeric(12,2),
  transaction_count integer check (transaction_count is null or transaction_count >= 0),
  payment_breakdown jsonb not null default '{}'::jsonb,
  notes text,
  confidence_score numeric(4,3),
  validation_warnings text[] not null default '{}',
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_document_id)
);

alter table public.daily_sales_reports
  add column if not exists cashier_name text,
  add column if not exists shift_start_at timestamptz,
  add column if not exists shift_end_at timestamptz,
  add column if not exists topup_register_amount numeric(12,2),
  add column if not exists freebies numeric(12,2),
  add column if not exists deducted_amount numeric(12,2),
  add column if not exists refund_balance numeric(12,2),
  add column if not exists cashier_m_plus numeric(12,2),
  add column if not exists cashier_user_m_plus numeric(12,2),
  add column if not exists items_sales numeric(12,2),
  add column if not exists user_purchase numeric(12,2),
  add column if not exists free_items numeric(12,2),
  add column if not exists point_redemption numeric(12,2),
  add column if not exists cash_stock_in numeric(12,2),
  add column if not exists received_from_last_shift numeric(12,2),
  add column if not exists reserve_to_next_duty numeric(12,2),
  add column if not exists reload_coupon numeric(12,2),
  add column if not exists card_fee_registered numeric(12,2),
  add column if not exists other_expenses numeric(12,2),
  add column if not exists shift_income numeric(12,2),
  add column if not exists total_cash numeric(12,2),
  add column if not exists off_duty_amount numeric(12,2);

create unique index if not exists daily_sales_reports_one_published_per_date
  on public.daily_sales_reports (report_date)
  where is_published = true;

create index if not exists sales_report_documents_status_created_idx
  on public.sales_report_documents (status, created_at desc);

create index if not exists daily_sales_reports_published_date_idx
  on public.daily_sales_reports (report_date desc)
  where is_published = true;

insert into storage.buckets (id, name, public)
values ('sales-report-documents', 'sales-report-documents', false)
on conflict (id) do nothing;

alter table public.sales_report_documents enable row level security;
alter table public.daily_sales_reports enable row level security;

drop policy if exists "Authenticated admins can manage sales report documents" on public.sales_report_documents;
create policy "Authenticated admins can manage sales report documents"
on public.sales_report_documents
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Authenticated admins can manage daily sales reports" on public.daily_sales_reports;
create policy "Authenticated admins can manage daily sales reports"
on public.daily_sales_reports
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Authenticated admins can manage sales report files" on storage.objects;
create policy "Authenticated admins can manage sales report files"
on storage.objects
for all
to authenticated
using (bucket_id = 'sales-report-documents' and public.is_admin())
with check (bucket_id = 'sales-report-documents' and public.is_admin());

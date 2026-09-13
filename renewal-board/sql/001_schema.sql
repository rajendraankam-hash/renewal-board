-- Renewal & Lead Follow-Up Board - table, RLS and policies
-- Run once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  record_type text not null
    check (record_type in ('policy_renewal', 'loan_file', 'cold_lead')),
  customer_name text not null,
  product text not null,

  due_date date,                 -- real deadline for renewals and loans
  next_contact_date date,        -- used for cold leads
  handler text not null,         -- the relationship manager
  amount_at_risk_paise bigint,   -- money in paise; null when not known

  status text not null default 'open'
    check (status in ('open', 'contacted', 'won', 'lost', 'closed')),

  last_activity_at timestamptz,
  last_activity_type text check (last_activity_type in ('call', 'visit')),
  activity_count integer not null default 0
);

comment on column public.records.amount_at_risk_paise is
  'Amount at risk in paise (Rs 1 = 100 paise). NULL means not known yet.';

create index if not exists records_handler_due_idx on public.records (handler, due_date);
create index if not exists records_product_due_idx on public.records (product, due_date);

alter table public.records enable row level security;

drop policy if exists records_select on public.records;
drop policy if exists records_insert on public.records;
drop policy if exists records_update on public.records;
drop policy if exists records_delete on public.records;

create policy records_select on public.records for select using (true);
create policy records_insert on public.records for insert with check (true);
create policy records_update on public.records for update using (true) with check (true);
create policy records_delete on public.records for delete using (true);

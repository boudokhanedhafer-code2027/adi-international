-- ADI INTERNATIONAL — Supabase database preparation
-- PREPARATION ONLY: this file has NOT been run against a Supabase project.
-- Review and test in a separate project before production use.
-- Never place the Supabase service_role key in GitHub or browser code.

create extension if not exists pgcrypto;

create table if not exists public.supplier_offers (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  source_url text not null,
  product_name text not null,
  model_variant text,
  condition text,
  moq integer check (moq is null or moq > 0),
  supplier_price numeric(12,2) check (supplier_price is null or supplier_price >= 0),
  supplier_currency char(3),
  stock_status text not null default 'unknown'
    check (stock_status in ('unknown','in_stock','out_of_stock','limited','unconfirmed')),
  shipping_cost numeric(12,2) check (shipping_cost is null or shipping_cost >= 0),
  shipping_currency char(3),
  destination_country text,
  shipping_status text not null default 'unconfirmed'
    check (shipping_status in ('unconfirmed','confirmed','unavailable')),
  delivery_estimate_days integer check (delivery_estimate_days is null or delivery_estimate_days >= 0),
  other_fees numeric(12,2) check (other_fees is null or other_fees >= 0),
  tax_duty_status text not null default 'unknown'
    check (tax_duty_status in ('unknown','confirmed','not_applicable')),
  checked_at timestamptz,
  verification_status text not null default 'imported'
    check (verification_status in (
      'imported','verification_pending','verified_pending_approval',
      'rejected','approved_for_publication','published'
    )),
  human_approval text not null default 'not_approved'
    check (human_approval in ('not_approved','approved','rejected')),
  adi_sale_price_eur numeric(12,2) check (adi_sale_price_eur is null or adi_sale_price_eur >= 0),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notes text,
  constraint approval_consistency check (
    (human_approval <> 'approved' and verification_status <> 'published')
    or
    (human_approval = 'approved' and verification_status in ('approved_for_publication','published'))
  )
);

create table if not exists public.supplier_offer_audit (
  id bigint generated always as identity primary key,
  offer_id uuid not null references public.supplier_offers(id) on delete restrict,
  actor_id uuid references auth.users(id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.supplier_offers enable row level security;
alter table public.supplier_offer_audit enable row level security;

-- Admin role must be assigned by a trusted server process in auth app_metadata.
-- Do not let users assign their own admin role from user-editable metadata.
create policy "admins can read supplier offers"
on public.supplier_offers for select
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "admins can insert supplier offers"
on public.supplier_offers for insert
to authenticated
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "admins can update supplier offers"
on public.supplier_offers for update
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "admins can read audit log"
on public.supplier_offer_audit for select
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "admins can add audit entries"
on public.supplier_offer_audit for insert
to authenticated
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Intentionally no anonymous/public policies.
-- Intentionally no payment, purchase, supplier-order, or auto-publication functions.
-- Production hardening still required: server-side role provisioning, immutable audit
-- entries, validation of source data, backups, rate limits, and tested approval endpoints.

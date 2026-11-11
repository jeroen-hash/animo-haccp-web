-- ANIMO HACCP: isolated food-waste reporting module.
-- Target for later test deployment only: xwjcwravfeldndwlugai.
-- This migration is intentionally NOT applied by this commit.
begin;

create table public.food_waste_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  client_id uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  employee_name text not null default '',
  product_name text not null check (length(btrim(product_name)) > 0),
  stock_item_id text,
  recipe_id text,
  quantity numeric(14,3) not null check (quantity > 0),
  input_unit text not null check (input_unit in ('g', 'kg', 'ml', 'cl', 'l', 'stuk')),
  reason text not null check (reason in (
    'Houdbaarheid verstreken',
    'Product bedorven',
    'Te veel bereid',
    'Verkeerd bereid',
    'Beschadigd product',
    'Restjes van klanten',
    'Temperatuurprobleem',
    'Product gevallen/verontreinigd',
    'Andere reden'
  )),
  note text not null default '',
  photo_path text not null,
  cost_unit text,
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  unit_cost_snapshot numeric(14,4) check (unit_cost_snapshot is null or unit_cost_snapshot >= 0),
  cost_value_snapshot numeric(14,2) check (cost_value_snapshot is null or cost_value_snapshot >= 0),
  cost_status text not null check (cost_status in ('calculated', 'unknown')),
  client_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text,
  constraint food_waste_entries_business_client_unique unique (business_id, client_id),
  constraint food_waste_entries_other_reason_note check (
    reason <> 'Andere reden' or length(btrim(note)) > 0
  ),
  constraint food_waste_entries_cost_snapshot_consistent check (
    (cost_status = 'calculated'
      and unit_cost_snapshot is not null
      and cost_value_snapshot is not null)
    or
    (cost_status = 'unknown'
      and unit_cost_snapshot is null
      and cost_value_snapshot is null)
  ),
  constraint food_waste_entries_void_consistent check (
    (voided_at is null and void_reason is null)
    or
    (voided_at is not null and void_reason is not null
      and length(btrim(void_reason)) > 0)
  )
);

comment on table public.food_waste_entries is
  'ANIMO HACCP food-waste registrations. Reporting-only: does not change stock.';
comment on column public.food_waste_entries.client_id is
  'Stable client-generated UUID used for idempotent offline synchronization.';
comment on column public.food_waste_entries.cost_value_snapshot is
  'Historical waste cost at registration time; never recalculated from current stock prices.';
comment on column public.food_waste_entries.photo_path is
  'Private Storage path: business_id/uploader_user_id/client_id.extension.';

create index food_waste_entries_business_created_idx
  on public.food_waste_entries (business_id, created_at desc);
create index food_waste_entries_business_employee_created_idx
  on public.food_waste_entries (business_id, created_by, created_at desc);

alter table public.food_waste_entries enable row level security;

-- New public tables are not automatically exposed by current Supabase defaults.
-- Grant only the operations needed by the authenticated app.
revoke all on table public.food_waste_entries from public, anon;
grant select, insert on table public.food_waste_entries to authenticated;
grant update (voided_at, void_reason) on table public.food_waste_entries to authenticated;
grant all on table public.food_waste_entries to service_role;

create policy "food waste members read permitted entries"
on public.food_waste_entries
for select
to authenticated
using (
  exists (
    select 1
    from public.business_members bm
    where bm.business_id = food_waste_entries.business_id
      and bm.user_id = (select auth.uid())
      and bm.active is true
      and private.can_access_business(bm.business_id)
      and (
        bm.role in ('owner', 'manager')
        or food_waste_entries.created_by = (select auth.uid())
      )
  )
);

create policy "food waste active members create own entries"
on public.food_waste_entries
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and photo_path like (
    business_id::text || '/' || (select auth.uid())::text || '/' || client_id::text || '.%'
  )
  and lower(photo_path) ~ '\.(jpg|jpeg|png|webp)$'
  and exists (
    select 1
    from public.business_members bm
    where bm.business_id = food_waste_entries.business_id
      and bm.user_id = (select auth.uid())
      and bm.active is true
      and private.can_access_business(bm.business_id)
  )
);

-- Only owners/managers may void/correct a registration. Column-level grants
-- prevent them from rewriting product, employee, photo or historical cost data.
create policy "food waste owners managers void entries"
on public.food_waste_entries
for update
to authenticated
using (
  exists (
    select 1
    from public.business_members bm
    where bm.business_id = food_waste_entries.business_id
      and bm.user_id = (select auth.uid())
      and bm.active is true
      and bm.role in ('owner', 'manager')
      and private.can_access_business(bm.business_id)
  )
)
with check (
  exists (
    select 1
    from public.business_members bm
    where bm.business_id = food_waste_entries.business_id
      and bm.user_id = (select auth.uid())
      and bm.active is true
      and bm.role in ('owner', 'manager')
      and private.can_access_business(bm.business_id)
  )
);

-- Private photo bucket. Do not modify any existing bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'food-waste-photos',
  'food-waste-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do nothing;

-- Storage path: business_id/uploader_user_id/client_id.extension.
-- Employees may read their own photos; owners/managers may read all photos
-- belonging to their own business. Uploads and retries stay uploader-owned.
create policy "food waste photos read permitted business photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'food-waste-photos'
  and array_length(storage.foldername(name), 1) = 2
  and exists (
    select 1
    from public.business_members bm
    where bm.business_id::text = (storage.foldername(name))[1]
      and bm.user_id = (select auth.uid())
      and bm.active is true
      and private.can_access_business(bm.business_id)
      and (
        (storage.foldername(name))[2] = (select auth.uid())::text
        or bm.role in ('owner', 'manager')
      )
  )
);

create policy "food waste photos insert own business photo"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'food-waste-photos'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.business_members bm
    where bm.business_id::text = (storage.foldername(name))[1]
      and bm.user_id = (select auth.uid())
      and bm.active is true
      and private.can_access_business(bm.business_id)
  )
);

-- Needed for Storage upsert retries. The SELECT policy above is also required.
create policy "food waste photos update own uploaded photo"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'food-waste-photos'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.business_members bm
    where bm.business_id::text = (storage.foldername(name))[1]
      and bm.user_id = (select auth.uid())
      and bm.active is true
      and private.can_access_business(bm.business_id)
  )
)
with check (
  bucket_id = 'food-waste-photos'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.business_members bm
    where bm.business_id::text = (storage.foldername(name))[1]
      and bm.user_id = (select auth.uid())
      and bm.active is true
      and private.can_access_business(bm.business_id)
  )
);

commit;

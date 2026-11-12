-- Store menu prices and POS sales separately from app_data.
-- app_data is readable by active employees, so this table has stricter manager-only RLS.

create table public.menu_profitability_data (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.menu_profitability_data is
  'Private menu prices, POS imports and historical ingredient-cost snapshots. Accessible only to active owners/managers of the same business.';
comment on column public.menu_profitability_data.payload is
  'JSON object containing menu price settings, POS import metadata, product mappings and historical sale rows.';

alter table public.menu_profitability_data enable row level security;

revoke all on table public.menu_profitability_data from public, anon, authenticated;
grant select, insert, update on table public.menu_profitability_data to authenticated;

create or replace function private.touch_menu_profitability_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' and (
    new.business_id is distinct from old.business_id
    or new.created_by is distinct from old.created_by
  ) then
    raise exception 'business_id and created_by cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists touch_menu_profitability_updated_at
  on public.menu_profitability_data;

create trigger touch_menu_profitability_updated_at
before update on public.menu_profitability_data
for each row
execute function private.touch_menu_profitability_updated_at();

create policy "menu profitability owners managers read"
on public.menu_profitability_data
for select to authenticated
using (
  (select private.can_access_business(business_id))
  and exists (
    select 1 from public.business_members bm
    where bm.business_id = menu_profitability_data.business_id
      and bm.user_id = (select auth.uid())
      and bm.active is true
      and bm.role in ('owner', 'manager')
  )
);

create policy "menu profitability owners managers insert"
on public.menu_profitability_data
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.can_access_business(business_id))
  and exists (
    select 1 from public.business_members bm
    where bm.business_id = menu_profitability_data.business_id
      and bm.user_id = (select auth.uid())
      and bm.active is true
      and bm.role in ('owner', 'manager')
  )
);

create policy "menu profitability owners managers update"
on public.menu_profitability_data
for update to authenticated
using (
  (select private.can_access_business(business_id))
  and exists (
    select 1 from public.business_members bm
    where bm.business_id = menu_profitability_data.business_id
      and bm.user_id = (select auth.uid())
      and bm.active is true
      and bm.role in ('owner', 'manager')
  )
)
with check (
  created_by = (select auth.uid())
  and (select private.can_access_business(business_id))
  and exists (
    select 1 from public.business_members bm
    where bm.business_id = menu_profitability_data.business_id
      and bm.user_id = (select auth.uid())
      and bm.active is true
      and bm.role in ('owner', 'manager')
  )
);

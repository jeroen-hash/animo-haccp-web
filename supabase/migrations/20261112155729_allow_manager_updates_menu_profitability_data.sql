-- Allow every active owner or manager of the business to update its menu profitability payload.
-- created_by remains immutable and is protected by the table trigger.

drop policy if exists "menu profitability owners managers update"
  on public.menu_profitability_data;

create policy "menu profitability owners managers update"
on public.menu_profitability_data
for update
to authenticated
using (
  (select private.can_access_business(business_id))
  and exists (
    select 1
    from public.business_members bm
    where bm.business_id = menu_profitability_data.business_id
      and bm.user_id = (select auth.uid())
      and bm.active is true
      and bm.role in ('owner', 'manager')
  )
)
with check (
  (select private.can_access_business(business_id))
  and exists (
    select 1
    from public.business_members bm
    where bm.business_id = menu_profitability_data.business_id
      and bm.user_id = (select auth.uid())
      and bm.active is true
      and bm.role in ('owner', 'manager')
  )
);


-- Prevent one manager from silently overwriting another manager's newer settings.
-- This invoker-security RPC is still subject to the table's RLS policies.
create or replace function public.save_menu_profitability_data(
  p_business_id uuid,
  p_payload jsonb,
  p_expected_updated_at timestamptz default null
)
returns timestamptz
language plpgsql
set search_path = ''
as $function$
declare
  saved_updated_at timestamptz;
begin
  if p_business_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Ongeldige menurendabiliteitsgegevens'
      using errcode = '22023';
  end if;

  if p_expected_updated_at is null then
    insert into public.menu_profitability_data (business_id, payload)
    values (p_business_id, p_payload)
    on conflict (business_id) do nothing
    returning updated_at into saved_updated_at;
  else
    update public.menu_profitability_data
       set payload = p_payload
     where business_id = p_business_id
       and updated_at = p_expected_updated_at
    returning updated_at into saved_updated_at;
  end if;

  if saved_updated_at is null then
    raise exception 'Menurendabiliteit is intussen door een andere manager gewijzigd. Laad de gegevens opnieuw en probeer opnieuw.'
      using errcode = '40001';
  end if;

  return saved_updated_at;
end;
$function$;

revoke all on function public.save_menu_profitability_data(uuid, jsonb, timestamptz)
  from public, anon;
grant execute on function public.save_menu_profitability_data(uuid, jsonb, timestamptz)
  to authenticated;

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

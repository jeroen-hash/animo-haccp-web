drop policy if exists "Business owners can view subscription" on public.subscriptions;

create policy "Owners and managers can view subscription"
on public.subscriptions
for select
to authenticated
using (
  exists (
    select 1
    from public.business_members bm
    where bm.business_id = subscriptions.business_id
      and bm.user_id = (select auth.uid())
      and bm.active is true
      and bm.role in ('owner', 'manager')
  )
);

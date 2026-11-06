-- Enforce access to app data only while the business trial or paid subscription is valid.
create or replace function public.can_access_business(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members bm
    join public.businesses b on b.id = bm.business_id
    where bm.business_id = p_business_id
      and bm.user_id = (select auth.uid())
      and bm.active is true
      and (
        b.lifetime_free is true
        or (
          b.trial_started_at is not null
          and b.trial_started_at <= now()
          and b.trial_ends_at is not null
          and b.trial_ends_at > now()
        )
        or exists (
          select 1
          from public.subscriptions s
          where s.business_id = b.id
            and s.status = 'active'
            and s.current_period_end is not null
            and s.current_period_end > now()
        )
      )
  );
$$;

revoke all on function public.can_access_business(uuid) from public, anon;
grant execute on function public.can_access_business(uuid) to authenticated;

drop policy if exists "ANIMO members delete shared app data" on public.app_data;
drop policy if exists "ANIMO members insert shared app data" on public.app_data;
drop policy if exists "ANIMO members read shared app data" on public.app_data;
drop policy if exists "ANIMO members update shared app data" on public.app_data;
drop policy if exists "members insert app data" on public.app_data;
drop policy if exists "members read app data" on public.app_data;
drop policy if exists "members update app data" on public.app_data;

create policy "ANIMO subscribed members read app data"
on public.app_data for select to authenticated
using (public.can_access_business(business_id));

create policy "ANIMO subscribed members insert app data"
on public.app_data for insert to authenticated
with check (public.can_access_business(business_id));

create policy "ANIMO subscribed members update app data"
on public.app_data for update to authenticated
using (public.can_access_business(business_id))
with check (public.can_access_business(business_id));

create policy "ANIMO subscribed members delete app data"
on public.app_data for delete to authenticated
using (public.can_access_business(business_id));

drop policy if exists "audit_log_select" on public.audit_log;
drop policy if exists "audit_log_insert" on public.audit_log;

create policy "ANIMO subscribed members read audit log"
on public.audit_log for select to authenticated
using (public.can_access_business(business_id));

create policy "ANIMO subscribed members insert audit log"
on public.audit_log for insert to authenticated
with check (public.can_access_business(business_id) and user_id = (select auth.uid()));

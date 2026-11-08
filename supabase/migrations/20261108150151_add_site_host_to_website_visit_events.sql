alter table public.website_visit_events
  add column if not exists site_host text not null default 'legacy';

alter table public.website_visit_events
  drop constraint if exists website_visit_events_site_host_check;

alter table public.website_visit_events
  add constraint website_visit_events_site_host_check
  check (site_host in ('legacy', 'www.animo-apps.com', 'start.animo-apps.com'));

create index if not exists website_visit_events_site_host_created_at_idx
  on public.website_visit_events (site_host, created_at desc);

create or replace function public.get_platform_website_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_today date := (now() at time zone 'Europe/Brussels')::date;
  v_week_start timestamp := date_trunc('week', now() at time zone 'Europe/Brussels');
  v_month_start timestamp := date_trunc('month', now() at time zone 'Europe/Brussels');
  v_result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.platform_admins pa where pa.user_id = auth.uid()
  ) then
    raise exception 'Niet gemachtigd om website-analytics te bekijken'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'today', (
      select count(*) from public.website_visit_events e
      where e.site_host = 'start.animo-apps.com'
        and e.created_at >= (v_today::timestamp at time zone 'Europe/Brussels')
        and e.created_at < ((v_today + 1)::timestamp at time zone 'Europe/Brussels')
    ),
    'week', (
      select count(*) from public.website_visit_events e
      where e.site_host = 'start.animo-apps.com'
        and e.created_at >= (v_week_start at time zone 'Europe/Brussels')
        and e.created_at < ((v_week_start + interval '1 week') at time zone 'Europe/Brussels')
    ),
    'month', (
      select count(*) from public.website_visit_events e
      where e.site_host = 'start.animo-apps.com'
        and e.created_at >= (v_month_start at time zone 'Europe/Brussels')
        and e.created_at < ((v_month_start + interval '1 month') at time zone 'Europe/Brussels')
    ),
    'daily', coalesce((
      select jsonb_agg(
        jsonb_build_object('date', d.day::text, 'visits', coalesce(x.visits, 0))
        order by d.day
      )
      from generate_series(v_today - 29, v_today, interval '1 day') as d(day)
      left join (
        select (e.created_at at time zone 'Europe/Brussels')::date as visit_day, count(*) as visits
        from public.website_visit_events e
        where e.site_host = 'start.animo-apps.com'
          and e.created_at >= ((v_today - 29)::timestamp at time zone 'Europe/Brussels')
          and e.created_at < ((v_today + 1)::timestamp at time zone 'Europe/Brussels')
        group by 1
      ) x on x.visit_day = d.day::date
    ), '[]'::jsonb),
    'timezone', 'Europe/Brussels',
    'metric', 'page_views',
    'site_host', 'start.animo-apps.com'
  ) into v_result;

  return v_result;
end;
$function$;

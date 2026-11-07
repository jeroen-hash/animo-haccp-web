-- Read-only billing summary for the private platform admin dashboard.
-- Revenue figures are estimates based on the configured ANIMO plan prices;
-- Stripe invoice/payment history is not stored in this database.
create or replace function public.get_platform_billing_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Geen toegang tot het platformbillingoverzicht';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'summary', jsonb_build_object(
      'subscriptions_total', count(*),
      'active_subscriptions', count(*) filter (where lower(coalesce(status, '')) = 'active'),
      'trialing_subscriptions', count(*) filter (where lower(coalesce(status, '')) in ('trialing', 'trial')),
      'past_due_subscriptions', count(*) filter (where lower(coalesce(status, '')) in ('past_due', 'unpaid', 'incomplete')),
      'canceled_subscriptions', count(*) filter (where lower(coalesce(status, '')) in ('canceled', 'cancelled')),
      'renewals_next_30d', count(*) filter (
        where lower(coalesce(status, '')) = 'active'
          and coalesce(cancel_at_period_end, false) = false
          and current_period_end >= now()
          and current_period_end < now() + interval '30 days'
      ),
      'mrr_estimate_eur', round(coalesce(sum(
        case
          when lower(coalesce(status, '')) = 'active' and lower(coalesce(plan, '')) in ('monthly', 'month', 'monthly_plan') then 55::numeric
          when lower(coalesce(status, '')) = 'active' and lower(coalesce(plan, '')) in ('yearly', 'annual', 'year', 'yearly_plan') then (550::numeric / 12)
          else 0::numeric
        end
      ), 0), 2),
      'arr_estimate_eur', round(coalesce(sum(
        case
          when lower(coalesce(status, '')) = 'active' and lower(coalesce(plan, '')) in ('monthly', 'month', 'monthly_plan') then 660::numeric
          when lower(coalesce(status, '')) = 'active' and lower(coalesce(plan, '')) in ('yearly', 'annual', 'year', 'yearly_plan') then 550::numeric
          else 0::numeric
        end
      ), 0), 2)
    )
  )
  into result
  from public.subscriptions;

  result := result || jsonb_build_object(
    'businesses',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'business_id', subscription.business_id,
          'business_name', business.name,
          'plan', subscription.plan,
          'status', subscription.status,
          'current_period_start', subscription.current_period_start,
          'current_period_end', subscription.current_period_end,
          'cancel_at_period_end', subscription.cancel_at_period_end,
          'updated_at', subscription.updated_at
        )
        order by subscription.updated_at desc nulls last
      )
      from public.subscriptions as subscription
      left join public.businesses as business
        on business.id = subscription.business_id
    ), '[]'::jsonb)
  );

  return result;
end;
$function$;

revoke all on function public.get_platform_billing_summary() from public;
revoke all on function public.get_platform_billing_summary() from anon;
grant execute on function public.get_platform_billing_summary() to authenticated;

-- Extend Stripe reporting so one-time onboarding invoices appear beside subscription invoices.
alter table public.billing_invoices
  add column if not exists source_type text not null default 'subscription',
  add column if not exists source_reference text;

create index if not exists billing_invoices_source_reference_idx
  on public.billing_invoices (source_type, source_reference)
  where source_reference is not null;

create or replace function public.get_platform_billing_summary()
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'auth'
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
      'renewals_next_30d', count(*) filter (where lower(coalesce(status, '')) = 'active' and coalesce(cancel_at_period_end, false) = false and current_period_end >= now() and current_period_end < now() + interval '30 days'),
      'mrr_estimate_eur', round(coalesce(sum(case
        when lower(coalesce(status, '')) = 'active' and lower(coalesce(plan, '')) in ('monthly', 'month', 'monthly_plan') then 55::numeric
        when lower(coalesce(status, '')) = 'active' and lower(coalesce(plan, '')) in ('yearly', 'annual', 'year', 'yearly_plan') then 550::numeric / 12
        else 0::numeric end), 0), 2),
      'arr_estimate_eur', round(coalesce(sum(case
        when lower(coalesce(status, '')) = 'active' and lower(coalesce(plan, '')) in ('monthly', 'month', 'monthly_plan') then 660::numeric
        when lower(coalesce(status, '')) = 'active' and lower(coalesce(plan, '')) in ('yearly', 'annual', 'year', 'yearly_plan') then 550::numeric
        else 0::numeric end), 0), 2)
    )
  ) into result
  from public.subscriptions;

  result := result || jsonb_build_object(
    'businesses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'business_id', s.business_id, 'business_name', b.name, 'plan', s.plan,
        'status', s.status, 'current_period_start', s.current_period_start,
        'current_period_end', s.current_period_end, 'cancel_at_period_end', s.cancel_at_period_end,
        'updated_at', s.updated_at
      ) order by s.updated_at desc nulls last)
      from public.subscriptions s
      left join public.businesses b on b.id = s.business_id
    ), '[]'::jsonb),
    'invoice_summary', (select jsonb_build_object(
      'paid_amount_30d_eur', round(coalesce(sum(amount_paid) filter (where currency='eur' and status='paid' and paid_at >= now()-interval '30 days'),0)::numeric/100,2),
      'paid_count_30d', count(*) filter (where status='paid' and paid_at >= now()-interval '30 days'),
      'open_amount_eur', round(coalesce(sum(amount_remaining) filter (where currency='eur' and status='open'),0)::numeric/100,2),
      'failed_attempts_30d', count(*) filter (where currency='eur' and status='open' and attempted=true and attempt_count > 0 and synced_at >= now()-interval '30 days')
    ) from public.billing_invoices),
    'recent_invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'business_name', coalesce(b.name, l.business_name, 'Onbekende zaak'),
        'source_type', i.source_type,
        'invoice_number', i.invoice_number, 'status', i.status,
        'currency', i.currency, 'amount_due', i.amount_due, 'amount_paid', i.amount_paid,
        'amount_remaining', i.amount_remaining, 'stripe_created_at', i.stripe_created_at,
        'due_at', i.due_at, 'paid_at', i.paid_at, 'attempt_count', i.attempt_count,
        'last_event_type', i.last_event_type
      ) order by i.stripe_created_at desc)
      from (
        select * from public.billing_invoices
        order by stripe_created_at desc
        limit 50
      ) i
      left join public.businesses b on b.id = i.business_id
      left join public.onboarding_leads l
        on i.source_type = 'onboarding_fee'
       and l.id::text = i.source_reference
    ), '[]'::jsonb)
  );

  return result;
end;
$function$;

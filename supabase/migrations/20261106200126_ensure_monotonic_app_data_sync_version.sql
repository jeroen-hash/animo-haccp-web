create or replace function public.save_app_data_if_unchanged(
  p_business_id uuid,
  p_data jsonb,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.can_access_business(p_business_id) then
    raise exception 'Business access denied' using errcode = '42501';
  end if;
  if p_expected_updated_at is null then
    insert into public.app_data (business_id, data_type, data, created_by, updated_at)
    values (p_business_id, 'full_state', p_data, auth.uid(), clock_timestamp())
    on conflict (business_id, data_type) do nothing
    returning updated_at into v_updated_at;
    if v_updated_at is null then
      return jsonb_build_object('saved', false, 'conflict', true);
    end if;
  else
    update public.app_data
       set data = p_data,
           updated_at = greatest(clock_timestamp(), public.app_data.updated_at + interval '1 microsecond')
     where business_id = p_business_id
       and data_type = 'full_state'
       and updated_at = p_expected_updated_at
    returning updated_at into v_updated_at;
    if v_updated_at is null then
      return jsonb_build_object('saved', false, 'conflict', true);
    end if;
  end if;
  return jsonb_build_object('saved', true, 'conflict', false, 'updated_at', v_updated_at);
end;
$$;
revoke all on function public.save_app_data_if_unchanged(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.save_app_data_if_unchanged(uuid, jsonb, timestamptz) to authenticated;

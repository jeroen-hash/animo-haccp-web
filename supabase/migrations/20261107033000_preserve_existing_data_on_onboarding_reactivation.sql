-- Preserve customer-managed app data when a platform admin repeats onboarding activation.
-- Existing records from this same intake are replaced; unrelated records are retained.
CREATE OR REPLACE FUNCTION public.activate_platform_onboarding_complete(p_intake_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_intake public.onboarding_intakes%rowtype;
  v_prepared jsonb;
  v_state jsonb;
  v_existing jsonb;
  v_business_id uuid;
  v_uid uuid := auth.uid();
  v_cleaning jsonb := '[]'::jsonb;
  v_points jsonb := '[]'::jsonb;
  v_dishes jsonb := '[]'::jsonb;
  v_stock jsonb := '[]'::jsonb;
  v_invites jsonb := '[]'::jsonb;
begin
  if v_uid is null or not public.is_platform_admin() then
    raise exception 'Geen toegang tot onboardingactivatie';
  end if;

  select * into v_intake
  from public.onboarding_intakes
  where id = p_intake_id
  for update;

  if not found then raise exception 'Onboarding niet gevonden'; end if;

  v_business_id := v_intake.business_id;
  if v_business_id is null then raise exception 'Onboarding heeft geen gekoppelde horecazaak'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text, 0));
  v_prepared := coalesce(v_intake.payload -> 'prepared_setup', '{}'::jsonb);

  select coalesce(ad.data, '{}'::jsonb) into v_existing
  from public.app_data ad
  where ad.business_id = v_business_id and ad.data_type = 'full_state'
  limit 1;

  v_state := coalesce(v_existing, '{}'::jsonb);

  -- Verwijder alleen eerdere import uit dezelfde onboarding, behoud klantdata.
  v_state := jsonb_set(v_state, '{cleaning}', coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(v_state->'cleaning','[]'::jsonb)) x where coalesce(x->>'onboarding_intake_id','') <> p_intake_id::text),'[]'::jsonb), true);
  v_state := jsonb_set(v_state, '{dishes}', coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(v_state->'dishes','[]'::jsonb)) x where coalesce(x->>'onboarding_intake_id','') <> p_intake_id::text),'[]'::jsonb), true);
  v_state := jsonb_set(v_state, '{stock}', coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(v_state->'stock','[]'::jsonb)) x where coalesce(x->>'onboarding_intake_id','') <> p_intake_id::text),'[]'::jsonb), true);
  v_state := jsonb_set(v_state, '{temperaturePoints}', coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(v_state->'temperaturePoints','[]'::jsonb)) x where coalesce(x->>'onboarding_intake_id','') <> p_intake_id::text),'[]'::jsonb), true);
  v_state := jsonb_set(v_state, '{onboardingTemperaturePoints}', coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(v_state->'onboardingTemperaturePoints','[]'::jsonb)) x where coalesce(x->>'onboarding_intake_id','') <> p_intake_id::text),'[]'::jsonb), true);
  v_state := jsonb_set(v_state, '{pendingUserInvites}', coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(v_state->'pendingUserInvites','[]'::jsonb)) x where coalesce(x->>'onboarding_intake_id','') <> p_intake_id::text),'[]'::jsonb), true);
  v_state := jsonb_set(v_state, '{temperaturePoints}', coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(v_state->'temperaturePoints','[]'::jsonb)) x where coalesce(x->>'onboarding_intake_id','') <> p_intake_id::text),'[]'::jsonb), true);
  v_state := jsonb_set(v_state, '{onboardingTemperaturePoints}', coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(v_state->'onboardingTemperaturePoints','[]'::jsonb)) x where coalesce(x->>'onboarding_intake_id','') <> p_intake_id::text),'[]'::jsonb), true);
  v_state := jsonb_set(v_state, '{pendingUserInvites}', coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(v_state->'pendingUserInvites','[]'::jsonb)) x where coalesce(x->>'onboarding_intake_id','') <> p_intake_id::text),'[]'::jsonb), true);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', gen_random_uuid()::text,
    'task', nullif(trim(x->>'task'),''),
    'name', nullif(trim(x->>'task'),''),
    'zone', coalesce(nullif(trim(x->>'zone'),''),'Algemeen'),
    'frequency', coalesce(nullif(trim(x->>'frequency'),''),'Dagelijks'),
    'responsible', coalesce(nullif(trim(x->>'responsible'),''),'Medewerker'),
    'done', false,
    'active', true,
    'source', 'onboarding',
    'onboarding_intake_id', p_intake_id::text
  )),'[]'::jsonb) into v_cleaning
  from jsonb_array_elements(coalesce(v_prepared->'cleaning_plan','[]'::jsonb)) x
  where nullif(trim(x->>'task'),'') is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', gen_random_uuid()::text,
    'name', nullif(trim(x->>'name'),''),
    'device', nullif(trim(x->>'name'),''),
    'type', coalesce(nullif(trim(x->>'type'),''),'Koeling'),
    'min', case when (x->>'min') ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(x->>'min',',','.')::numeric else null end,
    'max', case when (x->>'max') ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(x->>'max',',','.')::numeric else null end,
    'frequency', coalesce(nullif(trim(x->>'frequency'),''),'Dagelijks'),
    'active', true,
    'source', 'onboarding',
    'onboarding_intake_id', p_intake_id::text
  )),'[]'::jsonb) into v_points
  from jsonb_array_elements(coalesce(v_prepared->'temperature_points','[]'::jsonb)) x
  where nullif(trim(x->>'name'),'') is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', gen_random_uuid()::text,
    'name', nullif(trim(x->>'name'),''),
    'category', 'Onboarding',
    'ingredientsText', coalesce(x->>'ingredients',''),
    'ingredients', coalesce((select jsonb_agg(jsonb_build_object('id',gen_random_uuid()::text,'name',trim(i),'quantity',null,'unit','','allergens','[]'::jsonb)) from unnest(string_to_array(coalesce(x->>'ingredients',''),',')) i where trim(i)<>''),'[]'::jsonb),
    'allergens', coalesce((select jsonb_agg(trim(a)) from unnest(string_to_array(coalesce(x->>'allergens',''),',')) a where trim(a)<>''),'[]'::jsonb),
    'status', coalesce(nullif(trim(x->>'status'),''),'Te controleren'),
    'active', true,
    'source', 'onboarding',
    'onboarding_intake_id', p_intake_id::text
  )),'[]'::jsonb) into v_dishes
  from jsonb_array_elements(coalesce(v_prepared->'dishes','[]'::jsonb)) x
  where nullif(trim(x->>'name'),'') is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', gen_random_uuid()::text,
    'name', nullif(trim(x->>'name'),''),
    'category', coalesce(nullif(trim(x->>'category'),''),'Overig'),
    'unit', coalesce(nullif(trim(x->>'unit'),''),'stuk'),
    'quantity', 0,
    'minimum', case when (x->>'minimum') ~ '^[0-9]+([.,][0-9]+)?$' then replace(x->>'minimum',',','.')::numeric else 0 end,
    'supplier', coalesce(x->>'supplier',''),
    'active', true,
    'source', 'onboarding',
    'onboarding_intake_id', p_intake_id::text
  )),'[]'::jsonb) into v_stock
  from jsonb_array_elements(coalesce(v_prepared->'stock','[]'::jsonb)) x
  where nullif(trim(x->>'name'),'') is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', gen_random_uuid()::text,
    'name', coalesce(x->>'name',''),
    'email', lower(trim(coalesce(x->>'email',''))),
    'role', case lower(trim(coalesce(x->>'role','employee'))) when 'manager' then 'manager' when 'eigenaar' then 'manager' else 'employee' end,
    'status', 'pending',
    'source', 'onboarding',
    'onboarding_intake_id', p_intake_id::text
  )),'[]'::jsonb) into v_invites
  from jsonb_array_elements(coalesce(v_prepared->'users','[]'::jsonb)) x
  where nullif(trim(x->>'email'),'') is not null;

  v_state := jsonb_set(v_state, '{cleaning}', coalesce(v_state->'cleaning','[]'::jsonb) || v_cleaning, true);
  v_state := jsonb_set(v_state, '{temperaturePoints}', coalesce(v_state->'temperaturePoints','[]'::jsonb) || v_points, true);
  v_state := jsonb_set(v_state, '{onboardingTemperaturePoints}', coalesce(v_state->'onboardingTemperaturePoints','[]'::jsonb) || v_points, true);
  v_state := jsonb_set(v_state, '{dishes}', coalesce(v_state->'dishes','[]'::jsonb) || v_dishes, true);
  v_state := jsonb_set(v_state, '{stock}', coalesce(v_state->'stock','[]'::jsonb) || v_stock, true);
  v_state := jsonb_set(v_state, '{pendingUserInvites}', coalesce(v_state->'pendingUserInvites','[]'::jsonb) || v_invites, true);
  v_state := jsonb_set(v_state, '{onboardingNotes}', to_jsonb(coalesce(v_prepared->>'notes','')), true);
  v_state := jsonb_set(v_state, '{onboardingActivatedAt}', to_jsonb(now()), true);

  insert into public.app_data(business_id,data_type,data,created_by,updated_at)
  values(v_business_id,'full_state',v_state,v_uid,now())
  on conflict(business_id,data_type) do update
  set data=excluded.data, updated_at=now();

  update public.onboarding_intakes
  set status='activated', activated_at=now(), reviewed_by=v_uid, reviewed_at=coalesce(reviewed_at,now()), updated_at=now()
  where id=p_intake_id;

  insert into public.audit_log(business_id,user_id,module,action,details)
  values(v_business_id,v_uid,'onboarding','activated',format('Onboarding geactiveerd: %s kuistaken, %s temperatuurpunten, %s gerechten, %s voorraadproducten en %s gebruikers klaar voor uitnodiging',jsonb_array_length(v_cleaning),jsonb_array_length(v_points),jsonb_array_length(v_dishes),jsonb_array_length(v_stock),jsonb_array_length(v_invites)));

  return jsonb_build_object('success',true,'business_id',v_business_id,'cleaning',jsonb_array_length(v_cleaning),'temperature_points',jsonb_array_length(v_points),'dishes',jsonb_array_length(v_dishes),'stock',jsonb_array_length(v_stock),'pending_users',jsonb_array_length(v_invites));
end;
$function$


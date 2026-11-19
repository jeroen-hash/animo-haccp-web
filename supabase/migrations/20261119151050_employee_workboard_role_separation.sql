-- ANIMO HACCP: gescheiden gegevensroute voor medewerkers en beheerrollen.
CREATE OR REPLACE FUNCTION private.employee_strip_financial_fields(p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $$
DECLARE v_result jsonb;
BEGIN
  IF p_value IS NULL THEN RETURN NULL; END IF;
  IF jsonb_typeof(p_value) = 'object' THEN
    SELECT COALESCE(jsonb_object_agg(e.key, private.employee_strip_financial_fields(e.value)), '{}'::jsonb)
    INTO v_result
    FROM jsonb_each(p_value) AS e
    WHERE lower(regexp_replace(e.key, '[^a-z0-9]', '', 'g'))
      !~ '(price|cost|margin|profit|revenue|turnover|invoice|payment|billing|subscription|purchase|foodcost|vat|tax|discount|financial|sales|payable|receivable|fee)';
    RETURN COALESCE(v_result, '{}'::jsonb);
  ELSIF jsonb_typeof(p_value) = 'array' THEN
    SELECT COALESCE(jsonb_agg(private.employee_strip_financial_fields(a.value)), '[]'::jsonb)
    INTO v_result FROM jsonb_array_elements(p_value) AS a(value);
    RETURN COALESCE(v_result, '[]'::jsonb);
  END IF;
  RETURN p_value;
END;
$$;

CREATE OR REPLACE FUNCTION private.employee_merge_batches(p_current jsonb, p_incoming jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_item jsonb; v_new jsonb; v_result jsonb := '[]'::jsonb;
BEGIN
  FOR v_item IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_current)='array' THEN p_current ELSE '[]'::jsonb END) LOOP
    SELECT value INTO v_new FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_incoming)='array' THEN p_incoming ELSE '[]'::jsonb END)
    WHERE value->>'id'=v_item->>'id' LIMIT 1;
    IF FOUND THEN v_item:=jsonb_set(v_item,'{quantity}',COALESCE(v_new->'quantity',v_item->'quantity','0'::jsonb),true); END IF;
    v_result:=v_result||jsonb_build_array(v_item);
  END LOOP;
  FOR v_new IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_incoming)='array' THEN p_incoming ELSE '[]'::jsonb END) LOOP
    IF v_new->>'id' IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_current)='array' THEN p_current ELSE '[]'::jsonb END) old
      WHERE old->>'id'=v_new->>'id'
    ) THEN v_result:=v_result||jsonb_build_array(v_new); END IF;
  END LOOP;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION private.employee_merge_records(p_current jsonb, p_incoming jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_item jsonb; v_new jsonb; v_result jsonb := '[]'::jsonb;
BEGIN
  FOR v_item IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_current)='array' THEN p_current ELSE '[]'::jsonb END) LOOP
    SELECT value INTO v_new FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_incoming)='array' THEN p_incoming ELSE '[]'::jsonb END)
    WHERE value->>'id'=v_item->>'id' LIMIT 1;
    IF FOUND THEN v_item:=v_item||v_new; END IF;
    v_result:=v_result||jsonb_build_array(v_item);
  END LOOP;
  FOR v_new IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_incoming)='array' THEN p_incoming ELSE '[]'::jsonb END) LOOP
    IF v_new->>'id' IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_current)='array' THEN p_current ELSE '[]'::jsonb END) old
      WHERE old->>'id'=v_new->>'id'
    ) THEN v_result:=v_result||jsonb_build_array(v_new); END IF;
  END LOOP;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION private.employee_merge_stock(p_current jsonb, p_incoming jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_item jsonb; v_new jsonb; v_result jsonb := '[]'::jsonb;
BEGIN
  FOR v_item IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_current)='array' THEN p_current ELSE '[]'::jsonb END) LOOP
    SELECT value INTO v_new FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_incoming)='array' THEN p_incoming ELSE '[]'::jsonb END)
    WHERE value->>'id'=v_item->>'id' LIMIT 1;
    IF FOUND THEN
      v_item:=jsonb_set(v_item,'{quantity}',COALESCE(v_new->'quantity',v_item->'quantity','0'::jsonb),true);
      v_item:=jsonb_set(v_item,'{batches}',private.employee_merge_batches(v_item->'batches',v_new->'batches'),true);
    END IF;
    v_result:=v_result||jsonb_build_array(v_item);
  END LOOP;
  FOR v_new IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_incoming)='array' THEN p_incoming ELSE '[]'::jsonb END) LOOP
    IF v_new->>'id' IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_current)='array' THEN p_current ELSE '[]'::jsonb END) old
      WHERE old->>'id'=v_new->>'id'
    ) THEN v_result:=v_result||jsonb_build_array(v_new); END IF;
  END LOOP;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION private.employee_safe_stock(p_stock jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.value->'id', 'name', s.value->'name', 'unit', s.value->'unit',
    'allergens', COALESCE(s.value->'allergens','[]'::jsonb),
    'quantity', COALESCE(s.value->'quantity','0'::jsonb),
    'batches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', b.value->'id', 'quantity', COALESCE(b.value->'quantity','0'::jsonb),
        'expiryDate', b.value->'expiryDate', 'receivedAt', b.value->'receivedAt'
      ))
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.value->'batches')='array' THEN s.value->'batches' ELSE '[]'::jsonb END) b(value)
    ),'[]'::jsonb)
  )),'[]'::jsonb)
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_stock)='array' THEN p_stock ELSE '[]'::jsonb END) s(value);
$$;

CREATE OR REPLACE FUNCTION private.employee_safe_state(p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $$
DECLARE v_result jsonb := '{}'::jsonb; v_key text;
BEGIN
  IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RETURN v_result; END IF;
  FOREACH v_key IN ARRAY ARRAY[
    'cleaning','temperatures','temperaturePoints','temperature_points',
    'temperatureMeetpunten','meetpunten','temperatureActions','actions',
    'dishes','goodsReceipts','recipes','productions','productLabels',
    'productLabelAudit','stockMovements'
  ] LOOP
    IF p_data ? v_key THEN
      v_result:=jsonb_set(v_result,ARRAY[v_key],private.employee_strip_financial_fields(p_data->v_key),true);
    END IF;
  END LOOP;
  v_result:=jsonb_set(v_result,'{stock}',private.employee_safe_stock(p_data->'stock'),true);
  IF jsonb_typeof(p_data->'businessProfile')='object' THEN
    v_result:=jsonb_set(v_result,'{businessProfile}',jsonb_build_object(
      'businessName',p_data->'businessProfile'->'businessName',
      'businessType',p_data->'businessProfile'->'businessType'
    ),true);
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.employee_get_app_state(p_business_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_role text; v_data jsonb; v_updated_at timestamptz;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT bm.role INTO v_role FROM public.business_members bm
  WHERE bm.business_id=p_business_id AND bm.user_id=(SELECT auth.uid()) AND bm.active IS TRUE;
  IF v_role IS DISTINCT FROM 'employee' THEN RAISE EXCEPTION 'Employee access required' USING ERRCODE='42501'; END IF;
  IF NOT private.can_access_business(p_business_id) THEN RAISE EXCEPTION 'Business access denied' USING ERRCODE='42501'; END IF;
  SELECT ad.data,ad.updated_at INTO v_data,v_updated_at FROM public.app_data ad
  WHERE ad.business_id=p_business_id AND ad.data_type='full_state';
  IF NOT FOUND THEN RETURN jsonb_build_object('data',NULL,'updated_at',NULL); END IF;
  RETURN jsonb_build_object('data',private.employee_safe_state(v_data),'updated_at',v_updated_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.employee_save_app_state_if_unchanged(
  p_business_id uuid, p_data jsonb, p_expected_updated_at timestamptz
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_role text; v_current jsonb; v_payload jsonb; v_merged jsonb;
  v_updated_at timestamptz; v_exists boolean; v_key text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT bm.role INTO v_role FROM public.business_members bm
  WHERE bm.business_id=p_business_id AND bm.user_id=(SELECT auth.uid()) AND bm.active IS TRUE;
  IF v_role IS DISTINCT FROM 'employee' THEN RAISE EXCEPTION 'Employee access required' USING ERRCODE='42501'; END IF;
  IF NOT private.can_access_business(p_business_id) THEN RAISE EXCEPTION 'Business access denied' USING ERRCODE='42501'; END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'Invalid employee state' USING ERRCODE='22023'; END IF;

  SELECT ad.data,ad.updated_at INTO v_current,v_updated_at
  FROM public.app_data ad WHERE ad.business_id=p_business_id AND ad.data_type='full_state' FOR UPDATE;
  v_exists:=FOUND;
  IF v_exists AND p_expected_updated_at IS DISTINCT FROM v_updated_at THEN
    RETURN jsonb_build_object('saved',false,'conflict',true,'updated_at',v_updated_at);
  ELSIF NOT v_exists AND p_expected_updated_at IS NOT NULL THEN
    RETURN jsonb_build_object('saved',false,'conflict',true,'updated_at',NULL);
  END IF;

  v_payload:=private.employee_safe_state(p_data)-'recipes'-'businessProfile';
  v_merged:=COALESCE(v_current,'{}'::jsonb);
  FOREACH v_key IN ARRAY ARRAY[
    'cleaning','temperatures','temperaturePoints','temperature_points',
    'temperatureMeetpunten','meetpunten','temperatureActions','actions',
    'dishes','goodsReceipts','productions','productLabels','productLabelAudit','stockMovements'
  ] LOOP
    IF v_payload ? v_key THEN
      v_merged:=jsonb_set(v_merged,ARRAY[v_key],private.employee_merge_records(v_merged->v_key,v_payload->v_key),true);
    END IF;
  END LOOP;
  IF v_payload ? 'stock' THEN
    v_merged:=jsonb_set(v_merged,'{stock}',private.employee_merge_stock(v_merged->'stock',v_payload->'stock'),true);
  END IF;

  IF v_exists THEN
    UPDATE public.app_data ad SET data=v_merged,
      updated_at=GREATEST(clock_timestamp(),ad.updated_at+interval '1 microsecond')
    WHERE ad.business_id=p_business_id AND ad.data_type='full_state' AND ad.updated_at=p_expected_updated_at
    RETURNING ad.updated_at INTO v_updated_at;
  ELSE
    INSERT INTO public.app_data(business_id,data_type,data,created_by,updated_at)
    VALUES(p_business_id,'full_state',v_merged,(SELECT auth.uid()),clock_timestamp())
    ON CONFLICT(business_id,data_type) DO NOTHING
    RETURNING updated_at INTO v_updated_at;
  END IF;
  IF v_updated_at IS NULL THEN RETURN jsonb_build_object('saved',false,'conflict',true,'updated_at',NULL); END IF;
  RETURN jsonb_build_object('saved',true,'conflict',false,'updated_at',v_updated_at);
END;
$$;

REVOKE ALL ON FUNCTION public.employee_get_app_state(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.employee_save_app_state_if_unchanged(uuid,jsonb,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employee_get_app_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employee_save_app_state_if_unchanged(uuid,jsonb,timestamptz) TO authenticated;

DROP POLICY IF EXISTS "ANIMO subscribed members read app data" ON public.app_data;
CREATE POLICY "ANIMO owners and managers read app data" ON public.app_data
FOR SELECT TO authenticated USING (
  private.can_access_business(business_id) AND EXISTS (
    SELECT 1 FROM public.business_members bm WHERE bm.business_id=app_data.business_id
      AND bm.user_id=(SELECT auth.uid()) AND bm.active IS TRUE AND bm.role IN ('owner','manager')
  )
);
DROP POLICY IF EXISTS "ANIMO subscribed members insert app data" ON public.app_data;
CREATE POLICY "ANIMO owners and managers insert app data" ON public.app_data
FOR INSERT TO authenticated WITH CHECK (
  private.can_access_business(business_id) AND EXISTS (
    SELECT 1 FROM public.business_members bm WHERE bm.business_id=app_data.business_id
      AND bm.user_id=(SELECT auth.uid()) AND bm.active IS TRUE AND bm.role IN ('owner','manager')
  )
);
DROP POLICY IF EXISTS "ANIMO subscribed members update app data" ON public.app_data;
CREATE POLICY "ANIMO owners and managers update app data" ON public.app_data
FOR UPDATE TO authenticated USING (
  private.can_access_business(business_id) AND EXISTS (
    SELECT 1 FROM public.business_members bm WHERE bm.business_id=app_data.business_id
      AND bm.user_id=(SELECT auth.uid()) AND bm.active IS TRUE AND bm.role IN ('owner','manager')
  )
) WITH CHECK (
  private.can_access_business(business_id) AND EXISTS (
    SELECT 1 FROM public.business_members bm WHERE bm.business_id=app_data.business_id
      AND bm.user_id=(SELECT auth.uid()) AND bm.active IS TRUE AND bm.role IN ('owner','manager')
  )
);
DROP POLICY IF EXISTS "ANIMO subscribed members delete app data" ON public.app_data;
CREATE POLICY "ANIMO owners and managers delete app data" ON public.app_data
FOR DELETE TO authenticated USING (
  private.can_access_business(business_id) AND EXISTS (
    SELECT 1 FROM public.business_members bm WHERE bm.business_id=app_data.business_id
      AND bm.user_id=(SELECT auth.uid()) AND bm.active IS TRUE AND bm.role IN ('owner','manager')
  )
);

CREATE OR REPLACE FUNCTION public.save_app_data_if_unchanged(
  p_business_id uuid, p_data jsonb, p_expected_updated_at timestamptz
)
RETURNS jsonb LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_updated_at timestamptz;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_members bm
    WHERE bm.business_id=p_business_id AND bm.user_id=(SELECT auth.uid())
      AND bm.active IS TRUE AND bm.role IN ('owner','manager')
  ) THEN RAISE EXCEPTION 'Owner or manager access required' USING ERRCODE='42501'; END IF;
  IF NOT private.can_access_business(p_business_id) THEN RAISE EXCEPTION 'Business access denied' USING ERRCODE='42501'; END IF;
  IF p_expected_updated_at IS NULL THEN
    INSERT INTO public.app_data(business_id,data_type,data,created_by,updated_at)
    VALUES(p_business_id,'full_state',p_data,(SELECT auth.uid()),clock_timestamp())
    ON CONFLICT(business_id,data_type) DO NOTHING
    RETURNING updated_at INTO v_updated_at;
    IF v_updated_at IS NULL THEN RETURN jsonb_build_object('saved',false,'conflict',true); END IF;
  ELSE
    UPDATE public.app_data ad SET data=p_data,
      updated_at=GREATEST(clock_timestamp(),ad.updated_at+interval '1 microsecond')
    WHERE ad.business_id=p_business_id AND ad.data_type='full_state' AND ad.updated_at=p_expected_updated_at
    RETURNING ad.updated_at INTO v_updated_at;
    IF v_updated_at IS NULL THEN RETURN jsonb_build_object('saved',false,'conflict',true); END IF;
  END IF;
  RETURN jsonb_build_object('saved',true,'conflict',false,'updated_at',v_updated_at);
END;
$$;

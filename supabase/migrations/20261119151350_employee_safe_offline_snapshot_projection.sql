-- Sanitize local employee snapshots before they are replayed after reconnecting.
CREATE OR REPLACE FUNCTION public.employee_sanitize_app_state(p_business_id uuid, p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_role text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT bm.role INTO v_role FROM public.business_members bm
  WHERE bm.business_id=p_business_id AND bm.user_id=(SELECT auth.uid()) AND bm.active IS TRUE;
  IF v_role IS DISTINCT FROM 'employee' THEN RAISE EXCEPTION 'Employee access required' USING ERRCODE='42501'; END IF;
  IF NOT private.can_access_business(p_business_id) THEN RAISE EXCEPTION 'Business access denied' USING ERRCODE='42501'; END IF;
  RETURN private.employee_safe_state(p_data);
END;
$$;
REVOKE ALL ON FUNCTION public.employee_sanitize_app_state(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employee_sanitize_app_state(uuid,jsonb) TO authenticated;

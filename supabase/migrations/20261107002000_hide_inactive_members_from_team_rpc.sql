CREATE OR REPLACE FUNCTION public.list_business_members(p_business_id uuid)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  email text,
  member_role text,
  active boolean,
  invited_at timestamp with time zone,
  confirmed_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_requester_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Aanmelden vereist.';
  END IF;

  IF p_business_id IS NULL THEN
    RAISE EXCEPTION 'Een zaak-ID is vereist.';
  END IF;

  IF NOT private.can_access_business(p_business_id) THEN
    RAISE EXCEPTION 'Je abonnement of proefperiode geeft geen toegang meer tot gebruikersbeheer.';
  END IF;

  SELECT bm.role
    INTO v_requester_role
  FROM public.business_members AS bm
  WHERE bm.business_id = p_business_id
    AND bm.user_id = auth.uid()
    AND bm.active = true
  LIMIT 1;

  IF v_requester_role IS NULL THEN
    RAISE EXCEPTION 'Je hebt geen actieve toegang tot deze zaak.';
  END IF;

  IF v_requester_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Alleen een eigenaar of manager kan de gebruikerslijst bekijken.';
  END IF;

  RETURN QUERY
  SELECT
    bm.user_id,
    COALESCE(
      NULLIF(BTRIM(u.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(BTRIM(u.raw_user_meta_data ->> 'name'), ''),
      SPLIT_PART(u.email, '@', 1)
    )::text AS full_name,
    u.email::text,
    bm.role::text AS member_role,
    bm.active,
    u.invited_at,
    u.confirmed_at
  FROM public.business_members AS bm
  JOIN auth.users AS u ON u.id = bm.user_id
  WHERE bm.business_id = p_business_id
    AND bm.active = true
  ORDER BY
    CASE bm.role WHEN 'owner' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END,
    COALESCE(u.raw_user_meta_data ->> 'full_name', u.email);
END;
$function$;

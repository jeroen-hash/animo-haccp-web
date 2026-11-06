-- Scope the team-member list to the exact business selected by the signed-in session.
-- The caller must be an active owner or manager of that business.

DROP FUNCTION IF EXISTS public.list_business_members();

CREATE FUNCTION public.list_business_members(p_business_id uuid)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  email text,
  member_role text,
  active boolean,
  invited_at timestamptz,
  confirmed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
  ORDER BY
    CASE bm.role WHEN 'owner' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END,
    COALESCE(u.raw_user_meta_data ->> 'full_name', u.email);
END;
$function$;

REVOKE ALL ON FUNCTION public.list_business_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_business_members(uuid) TO authenticated;

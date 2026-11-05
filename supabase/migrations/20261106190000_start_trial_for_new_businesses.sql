-- ANIMO HACCP: start the 14-day trial only when self-service registration
-- successfully creates a business through register_new_business().
-- Assisted onboarding activation does not create a trial through this migration.
-- Existing businesses are never updated by this migration.

CREATE OR REPLACE FUNCTION public.register_new_business(
  p_business_name text,
  p_enterprise_number text
)
RETURNS TABLE(
  business_id uuid,
  business_name text,
  enterprise_number text,
  member_role text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_name text := btrim(coalesce(p_business_name, ''));
  -- Belgian enterprise/VAT numbers are compared on digits only, so spaces,
  -- dots and an optional "BE" prefix cannot be used to claim a second trial.
  v_enterprise text := regexp_replace(coalesce(p_enterprise_number, ''), '[^0-9]', '', 'g');
  v_now timestamptz := clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Je moet aangemeld zijn om een zaak te registreren.';
  END IF;

  IF length(v_name) < 2 THEN
    RAISE EXCEPTION 'Vul een geldige zaaknaam in.';
  END IF;

  IF length(v_enterprise) < 4 THEN
    RAISE EXCEPTION 'Vul een geldig ondernemingsnummer in.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.business_members bm
    WHERE bm.user_id = v_user_id
      AND bm.active = true
  ) THEN
    RAISE EXCEPTION 'Dit account is al aan een actieve zaak gekoppeld.';
  END IF;

  -- Serialize registrations for the same normalized enterprise number.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_enterprise, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM public.businesses b
    WHERE regexp_replace(coalesce(b.enterprise_number, ''), '[^0-9]', '', 'g') = v_enterprise
  ) THEN
    RAISE EXCEPTION 'Dit ondernemingsnummer is al geregistreerd.';
  END IF;

  INSERT INTO public.businesses(
    name,
    enterprise_number,
    owner_user_id,
    trial_started_at,
    trial_ends_at,
    trial_used_at
  )
  VALUES (
    v_name,
    v_enterprise,
    v_user_id,
    v_now,
    v_now + interval '14 days',
    v_now
  )
  RETURNING id INTO v_business_id;

  INSERT INTO public.business_members(business_id, user_id, role, active)
  VALUES (v_business_id, v_user_id, 'owner', true);

  RETURN QUERY
  SELECT v_business_id, v_name, v_enterprise, 'owner'::text;
END;
$function$;

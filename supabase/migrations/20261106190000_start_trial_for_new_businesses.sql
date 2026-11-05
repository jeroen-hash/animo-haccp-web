-- ANIMO HACCP: start a single 14-day trial when a new business is created.
-- This applies to both self-service registration and approved onboarding activation.
-- Existing businesses are not changed.

CREATE OR REPLACE FUNCTION public.start_trial_for_new_business()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_started_at timestamptz := clock_timestamp();
BEGIN
  IF COALESCE(NEW.lifetime_free, false) = false
     AND NEW.trial_started_at IS NULL
     AND NEW.trial_ends_at IS NULL
     AND NEW.trial_used_at IS NULL THEN
    NEW.trial_started_at := v_started_at;
    NEW.trial_ends_at := v_started_at + interval '14 days';
    NEW.trial_used_at := v_started_at;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.start_trial_for_new_business() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_start_trial_for_new_business ON public.businesses;

CREATE TRIGGER trg_start_trial_for_new_business
BEFORE INSERT ON public.businesses
FOR EACH ROW
EXECUTE FUNCTION public.start_trial_for_new_business();

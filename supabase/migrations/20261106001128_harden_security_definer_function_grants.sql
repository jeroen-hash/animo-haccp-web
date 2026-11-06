-- Harden SECURITY DEFINER functions: no anonymous RPC execution.
REVOKE EXECUTE ON FUNCTION public.activate_platform_onboarding(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_platform_onboarding(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.activate_platform_onboarding_complete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_platform_onboarding_complete(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_default_app_data() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_onboarding_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_onboarding_context() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_onboarding_intake(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_onboarding_intake(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_platform_dashboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_dashboard() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_platform_onboardings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_onboardings() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_active_business_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_business_member(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.save_my_onboarding_intake(uuid,jsonb,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_onboarding_intake(uuid,jsonb,boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.save_platform_onboarding_preparation(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_platform_onboarding_preparation(uuid,jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_platform_onboarding_status(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_platform_onboarding_status(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_default_app_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.app_data (business_id, data_type, data, created_by, created_at, updated_at)
  VALUES (
    NEW.id, 'full_state',
    jsonb_build_object(
      'stock', '[]'::jsonb, 'dishes', '[]'::jsonb, 'recipes', '[]'::jsonb,
      'reports', '[]'::jsonb, 'cleaning', '[]'::jsonb, 'temperatures', '[]'::jsonb,
      'actions', '[]'::jsonb, 'settings', '{}'::jsonb
    ),
    NEW.owner_user_id, now(), now()
  )
  ON CONFLICT (business_id, data_type) DO NOTHING;
  RETURN NEW;
END;
$function$;

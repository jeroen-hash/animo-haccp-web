-- Anonymous visitors must not receive table-level privileges on internal data.
-- RLS remains the row-level boundary for authenticated users and service_role.
REVOKE ALL PRIVILEGES ON TABLE
  public.audit_log,
  public.onboarding_leads,
  public.platform_admins,
  public.platform_error_log,
  public.subscriptions
FROM anon;

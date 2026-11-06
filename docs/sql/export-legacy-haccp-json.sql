-- ANIMO HACCP legacy export (read-only)
-- Source project: xwjcwravfeldndwlugai
-- Organisation: bcc8de52-f1b2-4ab3-bba4-5d50eb279aad
-- Branch Menen: 404382de-816e-4b7d-8c85-8cd5c9bc2539
--
-- Run in the LEGACY project's Supabase SQL Editor.
-- This query does not modify data. It returns one JSON document containing
-- the legacy operational records and their original IDs/timestamps.
-- Store the result securely; it contains business and employee information.

select jsonb_pretty(jsonb_build_object(
  'export_metadata', jsonb_build_object(
    'source_project_ref', 'xwjcwravfeldndwlugai',
    'organisation_id', 'bcc8de52-f1b2-4ab3-bba4-5d50eb279aad',
    'branch_id', '404382de-816e-4b7d-8c85-8cd5c9bc2539',
    'branch_name', 'menen',
    'exported_at_utc', now(),
    'format_version', 1,
    'purpose', 'Read-only pre-migration export; original source rows preserved'
  ),
  'temperature_records', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.recorded_at), '[]'::jsonb)
    from public.temperature_records t
    where t.branch_id = '404382de-816e-4b7d-8c85-8cd5c9bc2539'
  ),
  'temperature_templates', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order), '[]'::jsonb)
    from public.temperature_templates t
    where t.branch_id = '404382de-816e-4b7d-8c85-8cd5c9bc2539'
  ),
  'corrective_actions', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
    from public.corrective_actions t
    where t.branch_id = '404382de-816e-4b7d-8c85-8cd5c9bc2539'
  ),
  'cleaning_templates', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order), '[]'::jsonb)
    from public.cleaning_templates t
    where t.branch_id = '404382de-816e-4b7d-8c85-8cd5c9bc2539'
  ),
  'cleaning_checks', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.check_date, t.created_at), '[]'::jsonb)
    from public.cleaning_checks t
    where t.branch_id = '404382de-816e-4b7d-8c85-8cd5c9bc2539'
  ),
  'cleaning_tasks', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    from public.cleaning_tasks t
    where t.branch_id = '404382de-816e-4b7d-8c85-8cd5c9bc2539'
  ),
  'allergen_plan_items', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
    from public.allergen_plan_items t
    where t.branch_id = '404382de-816e-4b7d-8c85-8cd5c9bc2539'
  ),
  -- This legacy closing has a NULL branch_id; preserve it unassigned.
  'day_closings', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
    from public.day_closings t
  ),
  'business_settings', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
    from public.business_settings t
  ),
  'audit_log', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
    from public.audit_log t
  )
)) as backup_json;

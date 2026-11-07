-- ANIMO HACCP legacy archive export (read-only)
-- Source project: xwjcwravfeldndwlugai
-- Archived source schema: legacy_animo_20261107
-- Organisation: bcc8de52-f1b2-4ab3-bba4-5d50eb279aad
-- Branch Menen: 404382de-816e-4b7d-8c85-8cd5c9bc2539
--
-- IMPORTANT:
-- The original legacy tables were moved out of public into the
-- legacy_animo_20261107 archive schema. Do not run the old public.* version.
-- Run this SELECT-only query in the LEGACY project's SQL Editor.
-- It does not modify source rows. The JSON contains personal/business data;
-- store the result only in an encrypted, access-controlled backup location.
-- No passwords, password hashes, tokens or auth.sessions are exported.

select jsonb_pretty(jsonb_build_object(
  'export_metadata', jsonb_build_object(
    'source_project_ref', 'xwjcwravfeldndwlugai',
    'source_schema', 'legacy_animo_20261107',
    'organisation_id', 'bcc8de52-f1b2-4ab3-bba4-5d50eb279aad',
    'branch_id', '404382de-816e-4b7d-8c85-8cd5c9bc2539',
    'branch_name', 'menen',
    'exported_at_utc', now(),
    'format_version', 2,
    'purpose', 'Read-only archive export; original source rows preserved'
  ),
  'organisations', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
    from legacy_animo_20261107.organisations t
    where t.id = 'bcc8de52-f1b2-4ab3-bba4-5d50eb279aad'
  ),
  'branches', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
    from legacy_animo_20261107.branches t
    where t.id = '404382de-816e-4b7d-8c85-8cd5c9bc2539'
  ),
  'profiles', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
    from legacy_animo_20261107.profiles t
  ),
  'branch_memberships', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
    from legacy_animo_20261107.branch_memberships t
    where t.branch_id = '404382de-816e-4b7d-8c85-8cd5c9bc2539'
  ),
  'temperature_records', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.recorded_at), '[]'::jsonb)
    from legacy_animo_20261107.temperature_records t
    where t.branch_id = '404382de-816e-4b7d-8c85-8cd5c9bc2539'
  ),
  'temperature_templates', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order nulls last), '[]'::jsonb)
    from legacy_animo_20261107.temperature_templates t
    where t.branch_id = '404382de-816e-4b7d-8c85-8cd5c9bc2539'
  ),
  'corrective_actions', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
    from legacy_animo_20261107.corrective_actions t
    where t.branch_id = '404382de-816e-4b7d-8c85-8cd5c9bc2539'
  ),
  'cleaning_templates', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order nulls last), '[]'::jsonb)
    from legacy_animo_20261107.cleaning_templates t
    where t.branch_id = '404382de-816e-4b7d-8c85-8cd5c9bc2539'
  ),
  'cleaning_checks', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.check_date, t.created_at), '[]'::jsonb)
    from legacy_animo_20261107.cleaning_checks t
    where t.branch_id = '404382de-816e-4b7d-8c85-8cd5c9bc2539'
  ),
  'cleaning_tasks', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
    from legacy_animo_20261107.cleaning_tasks t
    where t.branch_id = '404382de-816e-4b7d-8c85-8cd5c9bc2539'
  ),
  'allergen_plan_items', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
    from legacy_animo_20261107.allergen_plan_items t
    where t.branch_id = '404382de-816e-4b7d-8c85-8cd5c9bc2539'
  ),
  -- Preserve the closing with NULL branch_id as unassigned.
  'day_closings', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
    from legacy_animo_20261107.day_closings t
  ),
  'business_settings', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
    from legacy_animo_20261107.business_settings t
  ),
  'audit_log', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
    from legacy_animo_20261107.audit_log t
    where t.branch_id = '404382de-816e-4b7d-8c85-8cd5c9bc2539'
  )
)) as backup_json;

# ANIMO HACCP – data migration assessment

Status: assessment only. No database writes, no data export/import, no production deployment.

## Current architecture

The new SaaS app in `index.html` connects to the Supabase project configured as `zimzsovvtdmrthrflkgm`. It loads and saves one JSONB snapshot per business in `public.app_data`, with `data_type = 'full_state'`. The snapshot contains arrays/objects such as `temperatures`, `temperaturePoints`, `temperatureActions`, `cleaning`, `dishes`, `stock`, `stockMovements`, `recipes`, `deliveries`, `productions`, `reports`, and `actions`.

The legacy HACCP project `xwjcwravfeldndwlugai` stores HACCP data in normalized tables. It has a different Auth user directory and different organisation/branch model.

## Read-only inventory (2026-11-06)

### Legacy HACCP project

- Auth users: 2
- Profiles: 2
- Organisations: 1
- Branches: 1
- temperature_records: 10
- temperature_templates: 7
- allergen_plan_items: 2
- cleaning_templates: 15
- cleaning_checks: 6
- cleaning_tasks: 0
- corrective_actions: 6
- day_closings: 1
- business_settings: 1 table row was not present for the organisation in the inspected query

### New SaaS project

- Auth users: 9
- businesses: 6
- business_members: 8
- app_data snapshots: 6 (one per business)
- subscriptions: 1
- audit_log: 160
- platform_error_log: 110

The six existing SaaS snapshots are populated test/business records. They must not be overwritten by a migration.

## Important compatibility findings

1. The new app expects `businesses`, `business_members`, and `app_data` and stores the HACCP state as one JSONB object.
2. The legacy project has `organisations`, `branches`, `profiles`, `branch_memberships`, and HACCP-specific tables.
3. Both projects have separate Supabase Auth directories. User UUIDs are project-specific; copying table rows without an explicit identity mapping would break ownership and access.
4. The legacy project already has a `subscriptions` table with an organisation-based schema, while the new SaaS project has a business-based `subscriptions` schema. A blind schema copy would conflict.
5. The new project's six `app_data` snapshots are not a safe place to import legacy data until the correct target business and user mapping are established.

## Recommended safe migration strategy

- Keep the legacy HACCP project unchanged as the historical source and rollback reference.
- Use the SaaS project as the target for the new app, because its business membership, app_data and subscription model already match the new code.
- Build a deterministic, idempotent converter from legacy rows to the new snapshot shape. Map only fields whose meaning is confirmed; retain original legacy IDs and timestamps in migration metadata where possible.
- Map the legacy organisation/branch and its users to one explicitly selected target business and target Auth user(s). Do not guess identity matches.
- Import into a new, dedicated target business/snapshot, never into any of the six existing snapshots.
- Verify record counts and content after import, test login/roles and all relevant modules, and only then plan production deployment.
- Do not delete, rename, or modify legacy tables. Keep the legacy project available until the new production app has been verified.

## Required next checks before writing an importer

- Confirm which existing target business (if any) represents the legacy organisation, or create a separate migration target.
- Establish a secure user identity mapping between the two Auth projects; do not copy passwords or assume UUIDs match.
- Inspect exact row contents and constraints for each legacy table needed by the converter.
- Confirm how the new app expects each JSON array/object, including any required IDs, dates, status values, and branch/business scoping.
- Prepare a dry-run report showing proposed source-to-target counts before any import.

## Safety gate

No migration SQL or data import should be executed until the target business and user mapping are explicitly confirmed and a restorable backup/export is available. Production deployment remains blocked until the migration is validated.

## Ownership clarification (2026-11-06)

The account owner clarified that the existing SaaS test businesses are all theirs except Rick's business. A read-only membership check identified the following ownership split:

- Keep untouched: `Animo 2.0`, `Animo2.0`, `animo vof`, `animo apps`, and `Vof test` (five businesses belonging to the project owner).
- Exclude from this migration and leave untouched: `Riku Ramen` (the owner account is Rik van Hooydonk).

This ownership clarification does not select one of the five owned businesses as the migration destination. The legacy HACCP organisation must still be mapped to a dedicated destination without overwriting any of the five existing snapshots. The migration plan therefore remains read-only until a dedicated target and user mapping are established.

No business, membership, snapshot, user, subscription, or legacy HACCP record was changed by this assessment.

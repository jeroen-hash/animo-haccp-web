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

## Draft field mapping (read-only code inspection, 2026-11-06)

The application snapshot contract is a JSON object with required arrays `cleaning`, `temperatures`, and `dishes`. Optional arrays used by the current client include `reports`, `stock`, `stockMovements`, `deliveries`, `recipes`, `productions`, and `temperatureActions`. Optional temperature-point configuration is read from `temperaturePoints` (also accepts `temperature_points`, `meetpunten`, or `temperatureMeetpunten`). The app's `businessProfile` contains `businessName`, `enterpriseNumber`, `businessType`, `address`, and `phone`.

Proposed mapping only; no data has been read into a target or transformed:

| Legacy source | Proposed snapshot target | Mapping notes / risk |
|---|---|---|
| `temperature_records` | `temperatures[]` | Map id, device, device_type -> type, temperature -> value, recorded_at -> date, plus employee/note/status and corrective details where supported. Preserve original IDs and timestamps. Validate type vocabulary and whether the UI expects `Koeling` / `Diepvries` rather than legacy `Koelkast` / `Vriezer`. |
| `temperature_templates` | `temperaturePoints[]` | Map name/location/device_type/product_category/active/sort_order. Legacy table has no min/max/frequency columns, so those settings cannot be fabricated. |
| `corrective_actions` | `temperatureActions[]` | Link by temperature_record_id -> temperatureId; map problem/measure/owner/done/closed_at/closure_note. UI uses status `open` / `resolved`; derive only from explicit done/closed data and retain original fields. |
| `cleaning_templates` | `cleaning[]` | Map id/name/location/frequency/active; app requires done and supports material/product but source has neither. Do not substitute defaults as historical facts. |
| `cleaning_checks` | cleaning history extension | The current `cleaning[]` UI is task-oriented and does not expose a native check-history collection. Preserve all six checks in an explicit extension such as `legacyCleaningChecks[]` until the UI supports them; do not collapse multiple dated checks into one `done` boolean. |
| `cleaning_tasks` | `cleaning[]` or separate extension | Currently zero rows. Keep mapping defined for future records, but avoid duplicating template/check rows. |
| `allergen_plan_items` | `dishes[]` | Map id, dish_name -> name, ingredients, allergens, cross_contamination and notes. Preserve category and timestamps as additional properties because UI may not currently render all fields. |
| `day_closings` | `reports[]` or explicit `legacyDayClosings[]` | Needs further inspection of report object shape and PDF/report UI before choosing. Preserve as a separate extension if uncertain. |
| `business_settings` | `businessProfile` | Map company_name/site_name/address/owner_email as applicable. Do not infer missing phone or enterprise number. |
| `audit_log` | separate audit history / `legacyAuditLog[]` | New app audit log has a different schema. Do not silently discard old audit events. |
| `branches`, `organisations`, `branch_memberships`, `profiles` | SaaS `businesses`, `business_members`, Auth users | Identity and role mapping must be resolved first. Legacy UUIDs are project-specific; never assume they equal new Auth/business IDs. |

### Required safeguards before a dry run

1. Confirm a dedicated destination business ID without reusing or overwriting any of the five owned test businesses; never include Rick's `Riku Ramen`.
2. Confirm the owner identity mapping by verified account identity (not by display name alone). Do not copy password hashes or auth secrets.
3. Keep source record IDs and original timestamps in the mapped payload, and include source table/ID provenance for every migrated row.
4. Include legacy check history, day closings and audit log in the dry-run counts even if the current UI cannot yet display them.
5. Compare source counts with target JSON-array counts and separately report intentionally retained extension arrays. A count mismatch blocks import.
6. Test the converted payload against the current app's required shape and render functions in an isolated environment before any write.
7. Obtain a restorable backup/export and explicit approval before any production import.

This mapping is a design artifact, not an executable migration. No database, customer data, subscription, business, or live deployment was changed.

## Read-only dry-run checklist and SQL (prepared 2026-11-06)

The following checks are intended for a later controlled dry run. They are SELECT-only: they do not create a business, write rows, alter schemas, or migrate data. Run each block against the indicated Supabase project, not against a production target by mistake.

### A. Legacy source counts — project `xwjcwravfeldndwlugai`

```sql
select 'temperature_records' as source, count(*)::bigint as row_count from public.temperature_records
union all select 'temperature_templates', count(*) from public.temperature_templates
union all select 'corrective_actions', count(*) from public.corrective_actions
union all select 'cleaning_templates', count(*) from public.cleaning_templates
union all select 'cleaning_checks', count(*) from public.cleaning_checks
union all select 'cleaning_tasks', count(*) from public.cleaning_tasks
union all select 'allergen_plan_items', count(*) from public.allergen_plan_items
union all select 'day_closings', count(*) from public.day_closings
union all select 'business_settings', count(*) from public.business_settings
union all select 'audit_log', count(*) from public.audit_log
order by source;
```

### B. Candidate SaaS businesses — project `zimzsovvtdmrthrflkgm`

```sql
select b.id, b.name, b.enterprise_number, b.created_at,
       (select count(*) from public.business_members bm where bm.business_id=b.id) as member_count,
       (select count(*) from public.app_data ad where ad.business_id=b.id) as app_data_rows
from public.businesses b
where lower(b.name) in ('animo 2.0','animo2.0','animo vof','animo apps','vof test')
order by b.created_at;
```

The filter deliberately uses only the five user-confirmed owned business names. It does not select `Riku Ramen`. This query is for inventory only; none of the five is approved as a migration destination.

### C. Dry-run acceptance criteria

- Source counts are captured per table and, where applicable, by branch.
- Every converted record includes its legacy table name and legacy row ID as provenance.
- The dry-run output lists proposed destination business ID separately; it must remain blank until a dedicated target has been explicitly approved and created.
- The five existing owned businesses are read-only and excluded from all write targets.
- `Riku Ramen` is excluded from the query scope and from every migration mapping.
- No passwords, password hashes, auth tokens, or Stripe secrets are exported or copied.
- Temperature records, corrective actions, allergen dishes, cleaning templates and cleaning checks are counted independently. Historical cleaning checks must not be flattened into a single current task state.
- Day closings and audit events remain separately counted and preserved, even if the new interface cannot yet display them.
- A mismatch, unknown status mapping, missing user mapping, or absent restorable backup blocks import.

### Current status

The dry-run queries and acceptance criteria are documented but have **not** been executed. The automated database read was blocked by a safety control. No alternative route was used. No destination business has been created or selected, and no customer data has been copied or changed.

# ANIMO HACCP — veilige back-up- en migratievolgorde

Datum: 2026-11-06

## Projecten

- Bron (oude HACCP-database): `xwjcwravfeldndwlugai` — Supabase-project `ANIMO HACCP`, regio `eu-west-1`.
- Doel (geïsoleerde migratietest): `zimzsovvtdmrthrflkgm` — `animo-haccp-test`, regio `eu-west-2`.
- Testbedrijf: `afe00335-d959-4b7f-bb12-15d047a880ee` — `ANIMO HACCP - Migratietest`.

## Harde veiligheidsregels

1. Nooit wijzigingen uitvoeren in de bron tijdens export of validatie.
2. Nooit brondata naar de doelomgeving schrijven voordat een volledige back-up én een gecontroleerde export beschikbaar zijn.
3. Nooit Auth UUID's, wachtwoorden, password hashes of sessies tussen projecten kopiëren.
4. Houd de testzaak geïsoleerd; voeg nog geen leden toe zolang de app met `.limit(1)` een willekeurig actief lidmaatschap kan selecteren.
5. Riku Ramen is uitgesloten. De vijf andere bestaande zaken blijven onaangeroerd.
6. De dagafsluiting met `branch_id = NULL` blijft niet-toegewezen; niet automatisch koppelen aan Menen.
7. Bewaar auditgeschiedenis, oude ID's en tijdstempels; verwijder of overschrijf niets.

## Supabase back-up

De Supabase-organisatie is op dit moment Pro. Volgens de Supabase-documentatie krijgen Pro-projecten dagelijkse databaseback-ups en kunnen de laatste 7 dagen via Dashboard > Database > Backups worden bekeken. De gebruiker heeft bevestigd dat in het Dashboard een recente geslaagde back-up zichtbaar is. Exacte datum/tijd is nog niet doorgegeven; noteer die vóór de definitieve migratie. Dit is een Supabase-herstelpunt, niet automatisch een onafhankelijk lokaal dumpbestand.

1. Open het Supabase Dashboard en selecteer project `ANIMO HACCP` (ref `xwjcwravfeldndwlugai`).
2. Open Database > Backups.
3. Controleer dat er een recente geslaagde dagelijkse back-up staat. Noteer datum en tijd.
4. Gebruik uitsluitend bekijken/downloaden indien aangeboden. Klik niet op Restore, Restore to new project, Pause of Delete.
5. Bewaar de back-up op een veilige plaats buiten de app en deel geen databasewachtwoorden of tokens.
6. Als er geen downloadmogelijkheid is, is de dagelijkse back-up nog steeds een herstelpunt binnen Supabase, maar nog geen onafhankelijk lokaal bestand. Een volledige logische dump kan met Supabase CLI `supabase db dump` worden gemaakt op een computer met CLI/Docker; voer dit niet uit vanaf de iPhone en stuur nooit connection strings of wachtwoorden in chat.

Officiële documentatie:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://supabase.com/docs/reference/cli/supabase-db-dump

## HACCP-export

De read-only exportquery staat in `docs/sql/export-legacy-haccp-json.sql`. Uitgelezen broninventaris:

| Tabel | Rijen |
|---|---:|
| temperature_records | 10 |
| temperature_templates | 7 |
| corrective_actions | 6 |
| cleaning_templates | 15 |
| cleaning_checks | 6 |
| cleaning_tasks | 0 |
| allergen_plan_items | 2 |
| day_closings | 1 |
| business_settings | 1 |
| audit_log | 5 |
| **Totaal** | **53** |

De query maakt één JSON-document. Het is geen volledige database-dump en is nog niet als herstelbaar bestand apart opgeslagen. De query is read-only.

## Validatie vóór import

- Vergelijk alle aantallen opnieuw na export.
- Controleer alle relaties tussen temperatuurrecords en correctieve acties.
- Behoud zes historische afwijkingen en hun acties: vier afgehandeld, twee open.
- Behoud zes historische schoonmaakchecks apart; vermeng ze niet met de huidige taken.
- Behoud allergenen in de canonieke Nederlandse labels; stop bij onbekende waarden.
- Behoud dagafsluiting zonder branch_id als niet-toegewezen.
- Behoud auditlog apart.
- Neem oude bedrijfsinstellingen niet over als SaaS-eigenaarsidentiteit.
- Melissa moet in het nieuwe systeem als Manager worden uitgenodigd; geen Auth-ID of wachtwoord kopiëren. Eerst managerrechten in de nieuwe app auditen.

## Import- en vrijgavepoort

Import mag pas na expliciete gebruikersgoedkeuring van een concrete preview plaatsvinden. Preview moet bron/doel, rij-aantallen, mapping, afwijkingen, niet-toegewezen records en mogelijke verliezen tonen. Eerst importeren in de geïsoleerde testzaak, daarna aantallen en schermen verifiëren. Geen productie, PR-merge of STRATO-deployment als onderdeel van deze stap.

## Huidige status

- Read-only broninspectie en JSON-query uitgevoerd.
- Exportquery staat in GitHub-branch `feature/self-service-14-day-trial`.
- Volledige onafhankelijke database-dump van de huidige SaaS-database (`zimzsovvtdmrthrflkgm`): op 8 november 2026 wel gemaakt en end-to-end geverifieerd via STRATO-workflowrun `42429105062`. Dit is niet de database van het oude bronproject (`xwjcwravfeldndwlugai`).
- Supabase Dashboard: gebruiker bevestigt dat een recente geslaagde databaseback-up zichtbaar is; exacte datum/tijd nog niet genoteerd.
- De Storage-herstelworkflowrun `42423966948` heeft een bestaande versleutelde Storage-back-up teruggezet in het oude bronproject `xwjcwravfeldndwlugai`. Na die restore zijn daar twee private buckets aanwezig (`onboarding-documents` en `onboarding-lead-documents`). Deze run is een RESTORE, geen bewijs dat de dagelijkse Storage-BACKUP-workflow zelf succesvol heeft gedraaid.
- Doeltestzaak: 0 leden, 1 starter-`app_data`-rij.
- De read-only legacy-exportquery is op 8 november 2026 technisch gevalideerd met dezelfde JSON-aggregaties en sorteringen; alleen aantallen zijn teruggegeven (geen persoons-/bedrijfsgegevens). De 14 onderdelen komen overeen met de broninventaris. PR #127 is gemerged; dit bevat alleen documentatie en een SELECT-only exportquery.
- Geen HACCP-import, schemawijziging of klantdatawijziging uitgevoerd.

## Statusverschil tussen projecten (8 november 2026)

- `zimzsovvtdmrthrflkgm` is de actieve SaaS-database met klantdata (15 auth-gebruikers, 7 businesses, 11 business_members, 7 app_data-rijen, 2 subscriptions, 5 billing_invoices, 9 onboarding_leads en 5 onboarding_intakes). De geslaagde databaseback-up-run `42429105062` betreft dit project.
- `xwjcwravfeldndwlugai` is de oude HACCP-bron. De oude operationele tabellen staan in `legacy_animo_20261107`; de gecontroleerde telling is 53 operationele rijen, plus 1 organisatie, 1 vestiging, 2 profielen en 1 lidmaatschap. De Storage-restore-run `42423966948` heeft ook twee private buckets teruggezet in dit project.
- Het oude bronproject is geen afzonderlijke lege testomgeving. De huidige SaaS-database bevat echte klantgegevens en mag niet als hersteltestdoel worden gebruikt.

- De databaseback-upworkflow vereist `STRATO_SFTP_HOST_KEY_SHA256` en de geslaagde run `42429105062` bevatte dit secret; de workflow kan alleen verder als de gepinde SSH-hostsleutel overeenkomt. Strict host-key checking is in de workflowcode verplicht.
- De Storage-backupworkflow staat gepland op 02:30 UTC. Een succesvolle dagelijkse BACKUP-run is nog niet met een run-ID en logs bevestigd; run `42423966948` was de afzonderlijke RESTORE-run.
- PR #131 is gemerged: geplande Storage-backups voeren voortaan alleen een retentie-dry-run uit. Geen automatische verwijdering van oude STRATO-bestanden. Een handmatige run met `retention_dry_run=false` is nodig om iets te verwijderen.

- Een volledige Postgres-hersteltest en HACCP-import zijn nog niet uitgevoerd. Daarvoor is eerst een werkelijk geïsoleerde testomgeving nodig; maak geen nieuw Supabase-project of databasebranch aan voordat de kosten en bestemming expliciet zijn goedgekeurd.
- Hoofdaccount `jeroenmarin@gmail.com` en de Riku Ramen lifetime-free-regeling blijven onaangeroerd.


## Aanvulling na archiefcontrole (2026-11-08)

- De oorspronkelijke legacy-tabellen staan niet langer in `public`, maar in schema `legacy_animo_20261107`. De oude exportquery die naar `public.*` verwees was daardoor verouderd.
- De exportquery is bijgewerkt op branch `feature/legacy-export-archive-schema` en verwijst nu expliciet naar het archiefschema.
- De nieuwe broninventarisquery is read-only uitgevoerd op het archiefschema en bevestigde:
  - organisations 1; branches 1; profiles 2; branch_memberships 1.
  - temperature_records 10; temperature_templates 7; corrective_actions 6.
  - cleaning_templates 15; cleaning_checks 6; cleaning_tasks 0.
  - allergen_plan_items 2; day_closings 1; business_settings 1; audit_log 5.
- De tien operationele tabellen blijven samen 53 rijen. De extra identiteits-/structuurgegevens zijn apart geteld en worden alleen gebruikt voor gecontroleerde mapping.
- De exportquery is nog niet als JSON-bestand uitgevoerd of extern opgeslagen. Er is geen import uitgevoerd en geen data gewijzigd.
- De projectrollen zijn expliciet: `xwjcwravfeldndwlugai` = oude HACCP-bron; `zimzsovvtdmrthrflkgm` = huidige SaaS-app en geïsoleerde migratietestdoelzaak.


## Kosteloze geïsoleerde database-structuurhersteltest (2026-11-08)

- Workflow: `.github/workflows/test-database-restore-schema.yml` (GitHub Actions, uitsluitend handmatig via `workflow_dispatch`).
- PR #132 is gemerged naar main (merge commit `b935df6d080cc4c71faa99cf182fa859ef4acb7b`).
- De workflow haalt de nieuwste timestamped databaseback-up op van STRATO, controleert de vastgepinde SSH-hostsleutel en SHA-256-checksum, ontsleutelt op de tijdelijke GitHub-runner en voert `pg_restore --schema-only` uit in een tijdelijke Supabase-compatibele PostgreSQL-container.
- De workflow herstelt bewust geen rijen/klantgegevens. Dit is een schema-/DDL-hersteltest, geen volledige datahersteltest en geen bewijs dat alle Auth-, Storage-objecten of runtime-integraties volledig herstellen.
- Container en tijdelijke dump worden na afloop verwijderd. Geen Supabase-branch of wijziging aan productieprojecten.
- De Storage-backupworkflow weigert nu SFTP als `STRATO_SFTP_HOST_KEY_SHA256` ontbreekt of niet overeenkomt; onveilige automatische host-key acceptatie is verwijderd.
- Kosten: geen Supabase-kosten. GitHub Actions gebruikt eventuele inbegrepen minuten; boven de accountlimiet kunnen GitHub-kosten ontstaan. De workflow wordt niet automatisch gestart.
- Status: workflow is toegevoegd en gemerged, maar nog NIET uitgevoerd. Noteer pas na handmatige uitvoering het run-ID en resultaat. Geen hersteltest als geslaagd markeren vóór groene run.

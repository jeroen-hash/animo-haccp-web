# ANIMO HACCP — versleutelde databaseback-up naar STRATO

## Doel en afbakening

Deze workflow maakt een logische PostgreSQL-back-up van de huidige SaaS-database:
- Supabase-project: `zimzsovvtdmrthrflkgm` (`animo-haccp-test`).
- Productie-app: `https://app.animo-apps.com/`.
- De oude HACCP-database `xwjcwravfeldndwlugai` is een afzonderlijke historische bron en wordt niet door deze workflow geback-upt.

De workflow exporteert de schema's `public`, `private`, `auth` en `storage`. De Auth-export bevat gevoelige accountgegevens, waaronder wachtwoordhashes. Daarom wordt de dump vóór verzending met GPG AES-256 versleuteld. Het onversleutelde bestand wordt na versleuteling verwijderd.

Storage-objectmetadata zit in de database-export. De feitelijke geüploade bestanden worden afzonderlijk door `backup-supabase-storage.yml` versleuteld naar STRATO gekopieerd.

## GitHub Actions-secrets

De workflow verwacht deze repository secrets:
- `PRODUCTION_DATABASE_URL`: PostgreSQL-connection URI van de SaaS-database `zimzsovvtdmrthrflkgm`. Gebruik de Supabase Session Pooler URI (IPv4-compatibel), met gebruikersnaam en databasenaam maar **zonder wachtwoord**. De workflow weigert een URI waarin al een wachtwoord staat.
- `PRODUCTION_DATABASE_PASSWORD`: het actuele databasewachtwoord, als afzonderlijke GitHub Actions-secret.
- `STRATO_SFTP_HOST`
- `STRATO_SFTP_USER`
- `STRATO_SFTP_PASSWORD`
- `STRATO_SFTP_HOST_KEY_SHA256`: vooraf gecontroleerde STRATO SSH-fingerprint.
- `ANIMO_BACKUP_ENCRYPTION_KEY`: de GPG-passphrase die deze databaseworkflow gebruikt. De workflow leest deze GitHub-secret onder de interne omgevingsnaam `BACKUP_PASSPHRASE`; dat is dus niet de naam van de GitHub-secret.

**De connection URI, het databasewachtwoord en de encryptiesleutel mogen nooit in chat, e-mail, issues of broncode worden geplakt. GitHub toont de bestaande secretwaarde niet opnieuw. Verwijder of overschrijf `ANIMO_BACKUP_ENCRYPTION_KEY` niet zomaar: oudere back-ups zijn met de toen geldende passphrase versleuteld.** Voeg ze alleen rechtstreeks toe via GitHub > repository Settings > Secrets and variables > Actions > New repository secret.

Als het databasewachtwoord onbekend is, moet de eigenaar eerst beslissen of hij het in Supabase wil resetten. Een reset verandert de Supabase API-keys en bestaande gebruikerswachtwoorden niet, maar externe rechtstreekse databaseverbindingen met het oude wachtwoord moeten worden bijgewerkt. Reset niets automatisch vanuit deze workflow.

## Uitvoering en controles

- Automatisch dagelijks om 03:00 UTC, plus handmatig via Actions > Encrypted Supabase database backup to STRATO > Run workflow.
- De database wordt met PostgreSQL 17 `pg_dump` in custom-format geëxporteerd.
- De dump wordt GPG AES-256 versleuteld.
- De versleutelde back-up en SHA-256-checksum worden geüpload naar `/backups/animo-haccp-database`.
- De workflow downloadt de back-up opnieuw, vergelijkt de checksum, ontsleutelt tijdelijk en voert `pg_restore --list` uit om de archiefstructuur te controleren.
- In main is bewust nog geen automatische retentie/verwijdering actief. PR #147 voegt een 90-dagencontrole toe die standaard dry-run is; die PR is nog niet gemerged.
- Mislukte uitvoeringen maken of actualiseren een GitHub-issue.

## Beperkingen

## Huidige status (8 november 2026)

- De handmatige uitvoering `42429105062` is volledig geslaagd.
- De database-export (`387359 bytes`) is met GPG AES-256 versleuteld en naar STRATO geüpload.
- De workflow heeft het bestand opnieuw gedownload; SHA-256 kwam overeen.
- Ontsleuteling en `pg_restore --list` zijn geslaagd.
- Dit bewijst dat deze back-up intact en leesbaar is. Het is nog géén volledige database-herstelproef.
- De Storage-back-up is een aparte workflow. De versleutelde Storage-archiefkopie is teruggedownload, ontsleuteld en inhoudelijk gevalideerd op de tijdelijke GitHub-runner. Er is daarmee nog geen volledige terugplaatsing van de Storage-objecten naar een afzonderlijke Supabase-omgeving bewezen; dat mag niet worden verward met een herstel van de Postgres-database.

Een volledige database-herstelproef met klantrecords moet nog in een afzonderlijke, goedgekeurde Supabase-testomgeving gebeuren. De bestaande schema-only workflow herstelt alleen de structuur in een tijdelijke PostgreSQL-container en is geen bewijs van een volledige dataherstelproef. De workflow voert nooit een restore uit en wijzigt de live database niet.

De workflow staat in de standaardbranch en de eerste handmatige uitvoering is gecontroleerd en geslaagd. De dagelijkse planning staat ingesteld op 03:00 UTC. Controleer de volgende geplande uitvoering om te bevestigen dat ook de automatische trigger blijft werken.

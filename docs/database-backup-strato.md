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
- `PRODUCTION_DATABASE_URL`: PostgreSQL-connection URI van de SaaS-database `zimzsovvtdmrthrflkgm`. Gebruik bij voorkeur de Supabase Session Pooler URI (IPv4-compatibel) en voeg het actuele databasewachtwoord toe.
- `STRATO_SFTP_HOST`
- `STRATO_SFTP_USER`
- `STRATO_SFTP_PASSWORD`
- `STRATO_SFTP_HOST_KEY_SHA256`: vooraf gecontroleerde STRATO SSH-fingerprint.
- `ANIMO_BACKUP_ENCRYPTION_KEY`: dezelfde back-up-passphrase als de Storage-back-up.

**De connection URI, het databasewachtwoord en de encryptiesleutel mogen nooit in chat, e-mail, issues of broncode worden geplakt.** Voeg ze alleen rechtstreeks toe via GitHub > repository Settings > Secrets and variables > Actions > New repository secret.

Als het databasewachtwoord onbekend is, moet de eigenaar eerst beslissen of hij het in Supabase wil resetten. Een reset verandert de Supabase API-keys en bestaande gebruikerswachtwoorden niet, maar externe rechtstreekse databaseverbindingen met het oude wachtwoord moeten worden bijgewerkt. Reset niets automatisch vanuit deze workflow.

## Uitvoering en controles

- Automatisch dagelijks om 03:00 UTC, plus handmatig via Actions > Encrypted Supabase database backup to STRATO > Run workflow.
- De database wordt met PostgreSQL 17 `pg_dump` in custom-format geëxporteerd.
- De dump wordt GPG AES-256 versleuteld.
- De versleutelde back-up en SHA-256-checksum worden geüpload naar `/backups/animo-haccp-database`.
- De workflow downloadt de back-up opnieuw, vergelijkt de checksum, ontsleutelt tijdelijk en voert `pg_restore --list` uit om de archiefstructuur te controleren.
- Er is bewust geen automatische retentie/verwijdering ingesteld.
- Mislukte uitvoeringen maken of actualiseren een GitHub-issue.

## Beperkingen

Een geslaagde checksum- en archiefcontrole bewijst dat het bestand intact en leesbaar is; het is nog geen volledige herstelproef. Een herstelproef moet later in een aparte Supabase-testomgeving gebeuren. De workflow voert nooit een restore uit en wijzigt de live database niet.

De workflow is voorbereid op branch `feature/encrypted-supabase-database-backup`. Ze kan pas echt draaien nadat de workflow veilig in de standaardbranch staat en alle vereiste secrets zijn ingesteld. De eerste uitvoering moet handmatig worden gestart en gecontroleerd voordat we vertrouwen op de dagelijkse planning.

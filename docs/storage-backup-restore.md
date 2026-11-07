# ANIMO HACCP – Storage-back-up herstellen

De workflow bewaart versleutelde kopieën van de private buckets
`onboarding-lead-documents` en `onboarding-documents` op STRATO.

## Belangrijk
- Bewaar de waarde van GitHub-secret `ANIMO_BACKUP_ENCRYPTION_KEY` ook in een wachtwoordmanager.
- Deel de sleutel nooit via e-mail of chat.
- De workflow verwijdert of wijzigt nooit de originele Supabase-bestanden.
- De STRATO-kopie bevat alleen een GPG-versleuteld archief en een SHA-256-controlebestand.

## Herstelprocedure
1. Download het gewenste `.tar.gz.gpg`-bestand en het bijbehorende `.sha256`-bestand uit `/backups/animo-haccp-storage` via SFTP.
2. Controleer de checksum met `sha256sum -c bestandsnaam.tar.gz.gpg.sha256` (pas de bestandsnaam aan indien nodig).
3. Ontsleutel met GPG met de bewaarde back-up-passphrase:
   `gpg --output animo-storage.tar.gz --decrypt bestandsnaam.tar.gz.gpg`
4. Controleer de inhoud met `tar -tzf animo-storage.tar.gz`.
5. Pak uit naar een tijdelijke, beveiligde map en controleer `manifest.json` en de SHA-256-hashes voordat bestanden terug in Supabase worden geplaatst.
6. Herstel bestanden alleen na controle van het juiste project, de juiste bucket en het objectpad. Overschrijf of verwijder geen bestaande objecten zonder afzonderlijke expliciete goedkeuring.

De automatische workflow test bij iedere uitvoering de STRATO-download, checksum en GPG-ontsleuteling. Dit is een integriteits-/hersteltest van het archief; het voert geen automatische restore uit naar productie.

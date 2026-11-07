# ANIMO HACCP – Storage-back-up herstellen

De workflow bewaart versleutelde kopieën van de private buckets
`onboarding-lead-documents` en `onboarding-documents` op STRATO.

## Belangrijk
- Bewaar de waarde van GitHub-secret `ANIMO_BACKUP_ENCRYPTION_KEY` ook in een wachtwoordmanager.
- Deel de sleutel nooit via e-mail of chat.
- De workflow verwijdert of wijzigt nooit de originele Supabase-bestanden.
- De STRATO-kopie bevat alleen een GPG-versleuteld archief en een SHA-256-controlebestand.
- Oude back-ups worden momenteel niet automatisch verwijderd. Er is bewust geen bewaartermijn ingesteld, zodat er niets automatisch wordt gewist.

## Automatische controle en meldingen
Bij iedere back-up haalt de workflow het versleutelde bestand terug van STRATO, controleert de archiefchecksum, ontsleutelt het archief en vergelijkt daarna voor ieder object de aanwezigheid, bestandsgrootte en SHA-256-hash met `manifest.json`. Deze controle schrijft niets terug naar Supabase.
Bij een mislukte uitvoering maakt de workflow een GitHub-issue aan of plaatst een nieuwe melding in het bestaande openstaande back-upissue, met een link naar de foutieve uitvoering en een vermelding van `@jeroen-hash`. Zorg dat GitHub-meldingen voor vermeldingen/eigen issues in je accountinstellingen aanstaan.

## Herstelprocedure
1. Download het gewenste `.tar.gz.gpg`-bestand en het bijbehorende `.sha256`-bestand uit `/backups/animo-haccp-storage` via SFTP.
2. Controleer de checksum met `sha256sum -c bestandsnaam.tar.gz.gpg.sha256` (pas de bestandsnaam aan indien nodig).
3. Ontsleutel met GPG met de bewaarde back-up-passphrase:
   `gpg --output animo-storage.tar.gz --decrypt bestandsnaam.tar.gz.gpg`
4. Controleer de inhoud met `tar -tzf animo-storage.tar.gz`.
5. Pak uit naar een tijdelijke, beveiligde map en controleer `manifest.json` en de SHA-256-hashes voordat bestanden terug in Supabase worden geplaatst.
6. Herstel bestanden alleen na controle van het juiste project, de juiste bucket en het objectpad. Overschrijf of verwijder geen bestaande objecten zonder afzonderlijke expliciete goedkeuring.

De workflow voert een geïsoleerde integriteitscontrole uit op de teruggehaalde bestanden. Dit is geen volledige terugplaatsing naar een aparte Supabase-testomgeving of naar productie; daarvoor is nog een afzonderlijke herstelproef nodig.

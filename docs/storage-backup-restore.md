# ANIMO HACCP – Storage-back-up herstellen

De workflow inventariseert dynamisch alle Storage-buckets in het geconfigureerde Supabase-project en bewaart de objecten versleuteld op STRATO. Een eerdere read-only inventarisatie vond onder meer de private buckets `onboarding-lead-documents` en `onboarding-documents`; deze namen vormen geen vaste of volledige lijst.

## Belangrijk
- Bewaar de waarde van GitHub-secret `ANIMO_BACKUP_ENCRYPTION_KEY` ook in een wachtwoordmanager.
- Deel de sleutel nooit via e-mail of chat.
- De workflow verwijdert of wijzigt nooit de originele Supabase-bestanden.
- De STRATO-kopie bevat alleen een GPG-versleuteld archief en een SHA-256-controlebestand.
- Oude back-ups worden momenteel niet automatisch verwijderd. Er is bewust geen bewaartermijn ingesteld, zodat er niets automatisch wordt gewist.

## Automatische controle en meldingen
Bij iedere back-up haalt de workflow het versleutelde bestand terug van STRATO, controleert de archiefchecksum, ontsleutelt het archief en vergelijkt daarna voor ieder object de aanwezigheid, bestandsgrootte en SHA-256-hash met `manifest.json`. Deze controle schrijft niets terug naar Supabase.
Bij een mislukte uitvoering maakt de workflow een GitHub-issue aan of plaatst een nieuwe melding in het bestaande openstaande back-upissue, met een link naar de foutieve uitvoering en een vermelding van `@jeroen-hash`. Zorg dat GitHub-meldingen voor vermeldingen/eigen issues in je accountinstellingen aanstaan.

## Extra beveiliging: STRATO SSH-hostsleutel vastzetten

STRATO gebruikt een persoonlijke servernaam en adviseert de host-key/fingerprint bij de eerste verbinding te controleren. De officiële STRATO-instructies beschrijven dat je de fingerprint bij de eerste SFTP-verbinding in FileZilla controleert.

Na onafhankelijke controle kan de SHA-256-fingerprint als GitHub Actions-repositorysecret worden opgeslagen:
- Naam: `STRATO_SFTP_HOST_KEY_SHA256`
- Waarde: de volledige fingerprint in de vorm `SHA256:...` die je bij een vertrouwde eerste verbinding hebt gecontroleerd.

De workflow vergelijkt dan de fingerprint die via SSH wordt aangeboden met deze vooraf opgeslagen waarde en gebruikt `StrictHostKeyChecking=yes`. Bij een mismatch stopt de back-up vóór de upload/download. Wijzig of vervang deze waarde alleen na controle via STRATO of een andere vertrouwde STRATO-ondersteuningsbron.

De huidige database- en Storage-back-upworkflows vereisen `STRATO_SFTP_HOST_KEY_SHA256` en stoppen vóór SFTP-overdracht wanneer het secret ontbreekt of niet overeenkomt. Zonder vooraf onafhankelijk gecontroleerde fingerprint kan de back-up dus mislukken; schakel host-key-controle niet uit om dit te omzeilen.

## Herstelprocedure
1. Download het gewenste `.tar.gz.gpg`-bestand en het bijbehorende `.sha256`-bestand uit `/backups/animo-haccp-storage` via SFTP.
2. Controleer de checksum met `sha256sum -c bestandsnaam.tar.gz.gpg.sha256` (pas de bestandsnaam aan indien nodig).
3. Ontsleutel met GPG met de bewaarde back-up-passphrase:
   `gpg --output animo-storage.tar.gz --decrypt bestandsnaam.tar.gz.gpg`
4. Controleer de inhoud met `tar -tzf animo-storage.tar.gz`.
5. Pak uit naar een tijdelijke, beveiligde map en controleer `manifest.json` en de SHA-256-hashes voordat bestanden terug in Supabase worden geplaatst.
6. Herstel bestanden alleen na controle van het juiste project, de juiste bucket en het objectpad. Overschrijf of verwijder geen bestaande objecten zonder afzonderlijke expliciete goedkeuring.

De workflow voert een geïsoleerde integriteitscontrole uit op de teruggehaalde bestanden. Op 8 november 2026 is de run `42431409352` succesvol afgerond: de versleutelde archiefkopie is teruggedownload, checksum-gecontroleerd, ontsleuteld en inhoudelijk gevalideerd op de tijdelijke GitHub-runner. Dit is geen volledige terugplaatsing naar een aparte Supabase-testomgeving of naar productie; daarvoor is nog een afzonderlijke herstelproef nodig. De repository bevat een handmatig te starten recovery-workflow, maar die is pas bruikbaar nadat een afzonderlijke recovery-omgeving en het bijbehorende geheim expliciet zijn ingericht en goedgekeurd.

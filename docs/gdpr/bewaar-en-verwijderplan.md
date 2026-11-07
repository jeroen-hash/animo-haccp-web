# Bewaar- en verwijderplan – ANIMO HACCP

**Versie:** 1.0 – 7 november 2026

## 1. Uitgangspunten
Persoonsgegevens worden niet langer bewaard dan nodig voor het doel. Een contractuele bewaartermijn is geen vervanging voor wettelijke bewaarplichten, noch een belofte dat alle kopieën gelijktijdig verdwijnen.

## 2. Bekende bewaarcategorieën

| Gegevenssoort | Huidige/voorgestelde termijn | Verwijderwijze / status |
|---|---|---|
| Actieve cloudregistraties van horecazaak | Contractduur + 90 dagen exportperiode | Na exportperiode verwijderen via gecontroleerde account-/zaakverwijderprocedure; technische uitvoering moet periodiek getest worden |
| Offline browserkopieën en synchronisatiewachtrij | Tot gebruiker browserdata wist; kan langer blijven staan | Klant moet eerst synchronisatie controleren en daarna browseropslag van de app wissen; app biedt geen remote wipe |
| Private onboarding- en documentbestanden | Contract-/aanvraagdoel plus noodzakelijke bewaartermijn | Supabase Storage; versleutelde kopieën op STRATO volgens backupworkflow |
| STRATO back-upbestanden | Maximaal 90 dagen vanaf de datum in de bestandsnaam | De dagelijkse back-upworkflow verwijdert na succesvolle upload-, checksum- en decryptiecontrole de versleutelde back-ups en bijbehorende checksums ouder dan 90 dagen. Alleen bestanden met het verwachte ANIMO-back-upnaamformaat worden verwijderd. |
| Facturen en boekhoudstukken | Belgische wettelijke bewaartermijn | Beperkte boekhoudtoegang; niet verwijderen vóór wettelijke termijn |
| Account- en beveiligingslogs | Stel korte, aantoonbare termijn in (voorstel 6–12 maanden afhankelijk van logtype) | **OPEN ACTIE:** inventariseer Supabase, STRATO, GitHub logs en stel per leverancier werkelijke termijn vast |
| Prospectaanvragen die niet klant worden | Voorstel 12 maanden na laatste betekenisvolle contact | **OPEN ACTIE:** implementeer verwijder-/reviewmoment en documenteer uitzonderingen |
| Supportcommunicatie | Zolang nodig voor support, contractuele opvolging en geschillen | Review jaarlijks; verwijder overbodige bijlagen en gevoelige inhoud |

## 3. Veilige verwijderprocedure
1. Controleer identiteit en bevoegdheid van de aanvrager.
2. Controleer of er open facturen, geschillen, wettelijke bewaarplichten of een noodzakelijke export zijn.
3. Vraag de klant om offline wijzigingen te synchroniseren en relevante gegevens te exporteren.
4. Verwijder de actieve cloudgegevens en bijbehorende bestanden volgens de gecontroleerde procedure.
5. Registreer wat is verwijderd, wanneer, door wie en welke kopieën nog in een back-upcyclus kunnen voorkomen.
6. Laat back-upkopieën automatisch vervallen volgens de vastgelegde termijn; bij herstel mogen verwijderde gegevens niet opnieuw onbedoeld actief worden.
7. Informeer de klant over wat verwijderd is en welke kopieën nog tijdelijk in back-ups kunnen zitten.

## 4. Back-upretentie – technische uitvoering
De dagelijkse GitHub Actions-back-upworkflow bewaart versleutelde GPG-kopieën van de private buckets onboarding-lead-documents en onboarding-documents op STRATO. Na een geslaagde upload, terug-download, checksumcontrole, decryptie en inhoudscontrole verwijdert de workflow uitsluitend bestanden met het patroon `animo-storage-YYYYMMDDTHHMMSSZ.tar.gz.gpg` die ouder zijn dan 90 dagen, plus hun `.sha256`-bestand. De eerste uitvoering van deze nieuwe retentiestap moet nog succesvol worden getest. Dit is een termijn voor technische back-upkopieën en staat los van de exportperiode van 90 dagen voor actieve cloudgegevens. Bij een mislukte retentiestap faalt de workflow en wordt de bestaande incidentmelding geactiveerd.

## 5. Offline opslag – klantinformatie
ANIMO HACCP bewaart voor offline gebruik appgegevens in browseropslag, waaronder localStorage en IndexedDB. Een gebruiker kan uitloggen zonder dat alle lokale bedrijfsgegevens automatisch worden verwijderd. Klanten moeten daarom:
- offline wijzigingen eerst synchroniseren;
- geen onbeveiligde of publiek gedeelde toestellen gebruiken;
- toestellen beveiligen met toegangscode/biometrie en automatische schermvergrendeling;
- bij toestelwissel of einde gebruik de browsergegevens van ANIMO HACCP wissen nadat synchronisatie/export is bevestigd.

## 6. Review
De verantwoordelijke controleert dit plan minstens jaarlijks en bij iedere wijziging aan opslag, back-ups, leveranciers, accountbeheer of offline synchronisatie.

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
| STRATO back-upbestanden | Momenteel geen automatische verwijdertermijn in workflow gedocumenteerd | **OPEN ACTIE:** automatische retentie instellen, voorstel maximaal 90 dagen, met gecontroleerde uitzonderingsprocedure |
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

## 4. Back-upretentie – blokkerende actie
De bestaande technische documentatie over storage-back-ups beschrijft versleutelde GPG-kopieën van de private buckets onboarding-lead-documents en onboarding-documents op STRATO en vermeldt dat oude back-ups momenteel niet automatisch verwijderd worden. Totdat retentie is ingesteld en getest, mag ANIMO niet verklaren dat alle kopieën exact 90 dagen na einde contract definitief verdwenen zijn.

## 5. Offline opslag – klantinformatie
ANIMO HACCP bewaart voor offline gebruik appgegevens in browseropslag, waaronder localStorage en IndexedDB. Een gebruiker kan uitloggen zonder dat alle lokale bedrijfsgegevens automatisch worden verwijderd. Klanten moeten daarom:
- offline wijzigingen eerst synchroniseren;
- geen onbeveiligde of publiek gedeelde toestellen gebruiken;
- toestellen beveiligen met toegangscode/biometrie en automatische schermvergrendeling;
- bij toestelwissel of einde gebruik de browsergegevens van ANIMO HACCP wissen nadat synchronisatie/export is bevestigd.

## 6. Review
De verantwoordelijke controleert dit plan minstens jaarlijks en bij iedere wijziging aan opslag, back-ups, leveranciers, accountbeheer of offline synchronisatie.

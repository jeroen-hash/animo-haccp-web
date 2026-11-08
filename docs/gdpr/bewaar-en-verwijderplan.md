# Bewaar- en verwijderplan – ANIMO HACCP

**Versie:** 1.1 – 8 november 2026

## 1. Uitgangspunten
Persoonsgegevens worden niet langer bewaard dan nodig voor het doel. Een contractuele bewaartermijn is geen vervanging voor wettelijke bewaarplichten, noch een belofte dat alle kopieën gelijktijdig verdwijnen.

## 2. Bekende bewaarcategorieën

| Gegevenssoort | Huidige/voorgestelde termijn | Verwijderwijze / status |
|---|---|---|
| Actieve cloudregistraties van horecazaak | Contractduur + 90 dagen exportperiode | Na exportperiode verwijderen via gecontroleerde account-/zaakverwijderprocedure; technische uitvoering moet periodiek getest worden |
| Offline browserkopieën en synchronisatiewachtrij | Tot gebruiker browserdata wist; kan langer blijven staan | Klant moet eerst synchronisatie controleren en daarna browseropslag van de app wissen; app biedt geen remote wipe |
| Private onboarding- en documentbestanden | Contract-/aanvraagdoel plus noodzakelijke bewaartermijn | Supabase Storage; de back-upworkflow inventariseert dynamisch alle buckets. De Storage-back-up naar STRATO is op 8 november 2026 succesvol uitgevoerd en de teruggedownloade, ontsleutelde inhoud is gevalideerd. Dit bewijst nog geen verwijdering van de bronbestanden of herstel in Supabase. |
| STRATO databaseback-ups | Geen automatische retentie ingesteld; bewaartermijn moet nog worden vastgesteld en technisch ingevoerd | De databaseback-upworkflow versleutelt en controleert de back-up, maar bevat momenteel geen automatische retentie- of verwijderstap. Er is dus geen technische 90-dagenlimiet voor databaseback-ups afgedwongen. |
| STRATO Storage-back-ups | Beoogd maximaal 90 dagen vanaf de datum in de bestandsnaam | De Storage-workflow bevat een 90-dagenretentiestap. De bevestigde run gebruikte dry-run; oude bestanden zijn niet verwijderd. De daadwerkelijke verwijdering is niet operationeel bewezen en blijft uitgeschakeld totdat die stap afzonderlijk is beoordeeld en goedgekeurd. |
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
De dagelijkse GitHub Actions-workflows maken afzonderlijke versleutelde database- en Supabase Storage-back-ups op STRATO. De Storage-workflow inventariseert alle Supabase Storage-buckets en valideert objecten via bestandsgrootte en SHA-256. Op 8 november 2026 slaagde de Storage-run [42431409352](https://github.com/jeroen-hash/animo-haccp-web/actions/runs/42431409352): de back-up werd teruggedownload, checksum-gecontroleerd, ontsleuteld en inhoudelijk gevalideerd. De databaseback-up-run [42429105062](https://github.com/jeroen-hash/animo-haccp-web/actions/runs/42429105062) slaagde eveneens met checksum- en archiefcontrole.

**Retentie is niet gelijk voor beide back-upsoorten:** de Storage-workflow bevat een 90-dagenregel voor uitsluitend bestanden met het verwachte ANIMO Storage-back-upnaamformaat. De bevestigde Storage-run gebruikte de veilige dry-run-instelling; er zijn geen oude Storage-bestanden verwijderd. De databaseback-upworkflow bevat momenteel géén automatische retentie- of verwijderstap. Voor databaseback-ups is dus nog geen 90-dagenlimiet technisch afgedwongen. Geen van beide retentieprocessen mag als operationeel bewezen worden voorgesteld. De schema-only hersteltest [42430946472](https://github.com/jeroen-hash/animo-haccp-web/actions/runs/42430946472) slaagde in een tijdelijke PostgreSQL-omgeving, maar bewijst geen herstel van alle klantrecords. Dit is een termijn voor technische back-upkopieën en staat los van de exportperiode van 90 dagen voor actieve cloudgegevens.

## 5. Offline opslag – klantinformatie
ANIMO HACCP bewaart voor offline gebruik appgegevens in browseropslag, waaronder localStorage en IndexedDB. Een gebruiker kan uitloggen zonder dat alle lokale bedrijfsgegevens automatisch worden verwijderd. Klanten moeten daarom:
- offline wijzigingen eerst synchroniseren;
- geen onbeveiligde of publiek gedeelde toestellen gebruiken;
- toestellen beveiligen met toegangscode/biometrie en automatische schermvergrendeling;
- bij toestelwissel of einde gebruik de browsergegevens van ANIMO HACCP wissen nadat synchronisatie/export is bevestigd.

## 6. Review
De verantwoordelijke controleert dit plan minstens jaarlijks en bij iedere wijziging aan opslag, back-ups, leveranciers, accountbeheer of offline synchronisatie.

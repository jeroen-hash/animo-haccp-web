# ANIMO HACCP — veilig overdrachtsplan naar live

Status: voorbereiding en audit; **geen live code, live database of live hosting aangepast**.

## Doel
De goedgekeurde functies uit `feature/phase1-haccp-completion` gecontroleerd naar de productieomgeving brengen, zonder bestaande live functies, klantgegevens, accounts, abonnementen of instellingen te verliezen.

## Huidige Git-vergelijking
- Basis: `main` op commit `8a052850844255f67c456e2b10168626ae1d1d32`.
- Testbranch: `feature/phase1-haccp-completion`.
- Testbranch staat 90 commits voor en 0 commits achter op main.
- De vergelijking toont wijzigingen in 14 bestanden, waaronder `index.html`, `sw.js`, testbestanden en test-workflows.
- De volledige geïsoleerde regressieworkflow op de testbranch is geslaagd (run `43580837951`).
- De uitgebreide browsercontrole en testdeploy zijn eerder geslaagd (runs `43579564722` en `43579561544`).

Deze tests zijn nuttig, maar bewijzen op zichzelf geen volledige productiecompatibiliteit of echte end-to-end werking van Stripe, offline synchronisatie en externe AI-verwerking.

## Releaseblokkade — Supabase-configuratie eerst verifiëren
De broncode op de testbranch bevat de test-Supabase-projectreferentie `zimzsovvtdmrthrflkgm`; de bevestigde liveomgeving is `xwjcwravfeldndwlugai`. De vastgelegde omgevingsindeling voor de huidige installatie is:
- Live: `xwjcwravfeldndwlugai`
- Test: `zimzsovvtdmrthrflkgm`

De productie-deployworkflow op `main` is nog de oude, onveilige versie. Op de testbranch is nu een wijziging voorbereid die de database-doelcontrole vastzet op het live project en tijdens het bouwen de testconfiguratie omzet naar de bevestigde liveconfiguratie. Die wijziging is nog niet naar `main` samengevoegd of live uitgevoerd. Daarom mag deze overdracht **niet** worden samengevoegd of gedeployed voordat de nieuwe productiebuild aantoonbaar uitsluitend de live Supabase-configuratie gebruikt en de testbuild aantoonbaar uitsluitend het testproject gebruikt.

Ook de testdeployworkflow op `main` heeft een andere/oudere configuratiecontrole dan de workflow op de testbranch. Dit moet eerst eenduidig worden gemaakt.

## Verplichte veiligheidsvoorwaarden vóór livegang

### 1. Live nulmeting en herstelpunt
- Maak en verifieer een actuele back-up van de productie database.
- Maak en verifieer een back-up van relevante Supabase Storage-bestanden.
- Bewaar de huidige live bestanden en de exacte huidige live commit/build als herstelpunt.
- Noteer de actieve productieprojectreferentie en controleer die tegen de productieomgeving; leid die nooit af uit een branchnaam.

### 2. Configuratie- en omgevingsscheiding
- Productiebuild gebruikt uitsluitend de bevestigde live Supabase URL en public key.
- Testbuild gebruikt uitsluitend het testproject.
- Geen testaccounts, sandbox-ID's, rolkeuzeschermen of testbypasses in productie.
- Geen service-role secrets in browsercode.
- Controleer ook Edge Function URLs, analytics/visit endpoints, e-mailinstellingen, Stripe-configuratie en service-worker cacheversies.

### 3. Database en migraties
- Maak eerst een lijst van alle migraties die de release nodig heeft.
- Vergelijk remote productiemigratiehistoriek met de verwachte migraties.
- Controleer elke migratie op destructieve SQL, kolomwijzigingen, RLS/policies, triggers, functies, indexen en datamigraties.
- Voer uitsluitend achterwaarts compatibele, additive wijzigingen uit waar mogelijk.
- Geen productie-migratie uitvoeren zolang project-ID en database-doel niet expliciet geverifieerd zijn.
- Maak herstel-/terugrolinstructies; databasewijzigingen zijn niet altijd veilig terug te draaien.

### 4. Compatibiliteit met bestaande live functies
Maak een regressiematrix voor de bestaande live onderdelen, minstens:
- Aanmelden, wachtwoordherstel, e-mailverificatie en sessiebeheer.
- Organisatie/zaak, eigenaar-manager-medewerker en toegangsrechten.
- Abonnement, proefperiode, Stripe-checkout, webhook en betaalstatus.
- HACCP-temperaturen, afwijkingen, schoonmaak, registraties en dagafsluiting.
- Recepten, stock, voorraadbewegingen, UBL-import en kostprijsberekening.
- Allergenen, PDF-export en rapporthistoriek.
- Offline registraties, synchronisatie en conflictbehandeling.
- Mobiele navigatie, PWA/service worker en bestaande klantgegevens.

Elke bestaande functie moet op een productie-gelijkwaardige testkopie worden gecontroleerd vóór vrijgave.

### 5. Nieuwe functies afzonderlijk valideren
- Goederenontvangst en UBL-/leverbonverwerking.
- Voorraadbatch- en eenheidsnormalisatie.
- Receptkostprijs en voorraadverbruik.
- Ongedierteplan en controlehistoriek.
- Houdbaarheid en vervalwaarschuwingen.
- Voedselverspilling en Business Insights.
- Dagrapport en afzonderlijke allergenen-PDF.
- Offline opslag en latere synchronisatie.

AI-verwerking, Stripe en e-mail moeten waar nodig met veilige testaccounts en testcredentials end-to-end worden gecontroleerd.

### 6. Gefaseerde vrijgave en rollback
- Maak een releasekandidaat die exact op de geteste commit is gebaseerd.
- Laat alle unit-, regressie-, browser- en buildcontroles slagen.
- Voer eerst een gecontroleerde test uit op een productie-gelijkwaardige kopie.
- Plan livegang pas na expliciete goedkeuring.
- Bewaar de vorige live build en bestanden zodat de website/app bij een codeprobleem onmiddellijk kan worden teruggezet.
- Controleer na livegang login, data, abonnementen, kernregistraties, PDF's en synchronisatie.
- Stop de uitrol en herstel de vorige build bij onverwachte fouten of dataverlies.

## Huidige voortgang
- Op de testbranch is de productie-databaseguard gewijzigd zodat alleen `postgres.xwjcwravfeldndwlugai` als productie-doel wordt geaccepteerd. Een database-URL naar het testproject wordt dus afgewezen vóór migraties.
- De productiebuild controleert de verwachte bronconfiguratie en zet uitsluitend de gebouwde kopie om naar de bevestigde live Supabase URL en public key. De broncode en testbuild blijven op het testproject.
- De testworkflow controleert voortaan expliciet deze productieguards.
- Commit voor de productieworkflow: `716ff170ae867dec485c7b8c654a322821ca88c9`.
- Commit voor de testworkflowcontroles: `a5e8b0acf5ce297ec179548df7e1ab0c48f4965a`.

## Huidig besluit
**NIET KLAAR VOOR LIVE-OVERDRACHT.** De veiligheidswijzigingen zijn alleen op de testbranch voorbereid. Ze moeten nog door de CI-controles, en de productie database-secret/migratiehistoriek en back-up moeten onafhankelijk geverifieerd worden. Er is geen live wijziging uitgevoerd.


## Database-audit — 14 november 2026

Read-only vergelijking uitgevoerd via de gekoppelde Supabase-projecten. Er zijn geen SQL-wijzigingen uitgevoerd.

### Migratiehistoriek
- Live project `xwjcwravfeldndwlugai`: 29 migraties.
- Testproject `zimzsovvtdmrthrflkgm`: 27 migraties.
- Slechts 7 migraties delen dezelfde versie/naam.
- Live heeft 22 migraties uit een eigen recovery/rebuild-traject; test heeft 20 andere basis-/SaaS-migraties.
- Beide projecten hebben de 7 HACCP-modulemigraties voor voedselverspilling en menurendabiliteit geregistreerd.

**Belangrijk:** de huidige productie-deployworkflow bevat een preflight die 20 migraties uit de testhistoriek verwacht (waaronder `20261108150151 add_site_host_to_website_visit_events`). Die versies ontbreken in de live migratiehistoriek. De workflow zal dus veilig afbreken vóór `supabase db push`; dit is een bevestigde releaseblokkade, geen reden om de ontbrekende migraties blind als reeds toegepast te registreren.

### Schema, functies en beveiliging
- Beide databases hebben 13 tabellen in `public`.
- Kolommen, defaults, constraints en indexes zijn gelijk, behalve één test-only uitbreiding aan `public.website_visit_events`: kolom `site_host`, bijhorende CHECK-constraint en index.
- Beide hebben dezelfde 22 functies in `public`/ `private` en dezelfde 23 RLS-policies.
- Van de functies verschilt alleen de definitie-hash van `public.get_platform_website_analytics()`; de testversie filtert op `site_host` en verwacht de extra kolom.
- De Supabase security-advisors tonen dezelfde bestaande meldingen in beide projecten: onder meer RLS-tabellen zonder policies, SECURITY DEFINER-functies die voor authenticated uitvoerbaar zijn en uitgeschakelde gelekte-wachtwoordbescherming. Dit moet inhoudelijk beoordeeld worden; niet blind policies of grants wijzigen.

### Gegevensomvang (alleen aantallen)
- Live: 1 zaak, 1 lidmaatschap, 1 app_data-record, 51 auditregels, 6 voedselverspillingsregistraties, 1 menurendabiliteitsrecord.
- Test: 7 zaken, 11 lidmaatschappen, 7 app_data-records, 450 auditregels, 3 voedselverspillingsregistraties, 1 menurendabiliteitsrecord.
- Test bevat daarnaast test-/onboarding-/analyticsgegevens die niet in dezelfde aantallen op live staan.

**Besluit:** databases niet kopiëren, niet samenvoegen en geen testdata naar live overzetten. Het gelijke schema betekent niet dat de data of migratiegeschiedenis uitwisselbaar is. De enige zichtbare structurele uitbreiding (`site_host`) moet afzonderlijk worden beoordeeld en als zelfstandige additive wijziging worden gepland als productie-analytics die nodig heeft.

### Volgende veilige stappen
1. Productie-deployworkflow aanpassen zodat de preflight de echte live migratiehistoriek herkent en alleen aantoonbaar nog ontbrekende, additive wijzigingen behandelt.
2. De `site_host`-uitbreiding apart beoordelen; eerst vaststellen of de productiewebsite die analyticsfunctie nodig heeft.
3. Back-up van live database én Storage onafhankelijk verifiëren.
4. Een productie-gelijkwaardige kopie gebruiken voor regressietests.
5. Pas daarna een releasekandidaat beoordelen. Geen merge of upload naar `main`/`/app` zonder afzonderlijke expliciete goedkeuring.

### Auditbesluit
**NO-GO voor live-overdracht op dit moment.** De productiebuild kan worden gemaakt, maar de migratie-preflight is niet compatibel met de huidige live migratiehistoriek. De live database en hosting zijn tijdens deze audit niet gewijzigd.


## Overdrachtsvoorbereiding — 14 november 2026 (vervolg)

### Migratie-preflight afgestemd op live
- De productieworkflow controleert nu de echte livehistoriek: 22 herstelmigraties plus de 7 ANIMO-modulemigraties.
- De 22 herstelmigraties worden uitsluitend als tijdelijke no-op bestanden in de geïsoleerde releasemap aangemaakt; ze worden niet naar de repository geschreven en niet opnieuw uitgevoerd.
- De zeven modulemigraties worden uit de repository gekopieerd. De read-only audit bevestigde dat alle zeven versies al in de live migratiehistoriek staan.
- De oude testhistoriek (20 migraties, waaronder `20261108150151_add_site_host_to_website_visit_events`) is uit de productie-preflight verwijderd. De optionele `site_host`-uitbreiding blijft buiten deze release.
- Nieuwe test `tests/production-migration-preflight.test.mjs` controleert de 22 live-baselineversies, de zeven moduleversies en dat de aparte verificatieworkflow uitsluitend `db push --dry-run` bevat.

### Validatie
- De volledige feature-branch regressiesuite is geslaagd op commit `e0e1ca9e45d2fec8d578a62cb8a6bab2a24f858f`.
- De testdeploy naar uitsluitend `/test` is geslaagd op dezelfde commit.
- De live migratie dry-run is bewust niet door de doelbeveiliging geraakt: de huidige GitHub Actions secret `PRODUCTION_DATABASE_URL` bevat de testprojectgebruiker `postgres.zimzsovvtdmrthrflkgm`, niet de liveprojectgebruiker. De workflow stopt vóór de databaseverbinding.
- Er is geen SQL uitgevoerd, geen live migratie toegepast en geen bestand naar `/app` geüpload.

### Nog vereist vóór vrijgave
1. Vervang in GitHub Actions de secret `PRODUCTION_DATABASE_URL` door de verbindings-URI van het liveproject `xwjcwravfeldndwlugai` (bij voorkeur de Session Pooler-URI, zonder wachtwoord in de URI).
2. Vervang `PRODUCTION_DATABASE_PASSWORD` door het databasewachtwoord van datzelfde liveproject.
3. Voer daarna de aparte workflow **ANIMO live migraties - alleen dry-run** opnieuw uit. Alleen als de doelcontrole, alle 29 lokale/remote migratieversies en de dry-run slagen, kan de releasekandidaat verder worden beoordeeld.

**Huidig besluit: NO-GO voor livegang.** De verkeerde database-secret is veilig geblokkeerd. De liveapp, live database en map `/app` zijn onaangeroerd gebleven.



## Veiligheidsaanpassing productie-deploy — 14 november 2026

- De read-only database-audit bevestigde dat de zeven ANIMO-modulemigraties al in de live migratiehistoriek staan.
- Daarom is de automatische databaseverbinding en de muterende `supabase db push --yes` uit de productie-deployworkflow verwijderd.
- De productie-deploy controleert nu uitsluitend of de zeven migratiebestanden in de releasebron aanwezig zijn. Hij maakt geen verbinding met de live database en voert geen SQL uit.
- De aparte workflow `ANIMO live migraties - alleen dry-run` blijft beschikbaar om, na correctie van de GitHub databasegeheimen, alleen de live migratiehistoriek en een dry-run te controleren.
- Een dry-run die migraties wil toepassen blijft een blokkade; er wordt niets automatisch gerepareerd of toegepast.
- De testbranch-regressietest controleert nu expliciet dat de productie-deploy geen muterende `db push` en geen productie-databasegeheimen gebruikt.

Commit van deze veiligheidsaanpassing: `36ed35ddb85568863e0dd4a10aac7588e9c6478b`.
Commit van de aangepaste regressietest: `5aa852700634a05976515bbf94b8b645c59d2fc3`.

**Impact:** uitsluitend workflows, regressietest en documentatie op de testbranch gewijzigd. Geen merge naar `main`, geen upload naar `/app`, geen live databaseverbinding en geen livewijziging.

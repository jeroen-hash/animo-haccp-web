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
De broncode in zowel `main` als de testbranch bevat momenteel de Supabase-projectreferentie `zimzsovvtdmrthrflkgm`. De vastgelegde omgevingsindeling voor de huidige installatie is:
- Live: `xwjcwravfeldndwlugai`
- Test: `zimzsovvtdmrthrflkgm`

De productie-deployworkflow op `main` kopieert `index.html` rechtstreeks naar `/app`. In de workflow is geen afzonderlijke productieconfiguratie-injectie zichtbaar. Daarom mag deze overdracht **niet** worden samengevoegd of gedeployed voordat de productiebuild aantoonbaar de live Supabase-configuratie gebruikt en de testbuild aantoonbaar uitsluitend het testproject gebruikt.

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

## Huidig besluit
**NIET KLAAR VOOR LIVE-OVERDRACHT.** De regressietests op de testbranch zijn geslaagd, maar de Supabase-configuratie en productiebuild moeten eerst worden rechtgezet en onafhankelijk geverifieerd. Er is geen live wijziging uitgevoerd.

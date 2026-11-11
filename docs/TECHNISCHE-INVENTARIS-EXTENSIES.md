# ANIMO HACCP — Technische inventaris voor uitbreidingen

Datum: 2026-11-11
Branch: feature/voedselverspilling-module
Status: technische inspectie + geïsoleerde feature-branch. De live database is niet gewijzigd. De testdatabase is alleen gelezen; er is nog geen DDL of Storage-wijziging uitgevoerd.

## 1. Architectuur die in de huidige app-code is bevestigd

- De hoofdapp is momenteel een grote zelfstandige `index.html` (geen `package.json` aangetroffen in de repository-root via de GitHub Contents API).
- De app bewaart de bedrijfsstaat in één object (`state`) en normaliseert collecties via `normalizeStateCollections`.
- Bestaande collecties in `DEFAULTS`: `cleaning`, `temperatures`, `dishes`, `reports`, `stock`, `stockMovements`, `deliveries`, `recipes`, `productions`, `temperatureActions`.
- Lokale bedrijfsdata wordt bewaard onder een bedrijfsgebonden localStorage-key (`favv-professional-v1:<businessId>` via `businessKey`).
- `persist()` normaliseert de staat, bewaart de volledige snapshot lokaal, werkt dashboardcijfers bij en plant cloud-synchronisatie via `FAVVCloudSync.schedule(state)`.
- Cloudopslag gebruikt `save_app_data_if_unchanged` met een volledige snapshot en een verwachte `updated_at`. Bij conflict wordt de lokale snapshot in de wachtrij gehouden; de code probeert niet blind de cloud te overschrijven.
- De bestaande offline outbox bewaart één snapshot per horecazaak in localStorage en IndexedDB (object store `outbox`, keyPath `businessId`). Dit is een snapshot-wachtrij, geen onafhankelijke rij-per-registratie wachtrij.

## 2. Bestaande voorraad- en receptlogica

- Voorraadartikelen zitten in `state.stock`.
- Voorraadbewegingen zitten in `state.stockMovements`; de bestaande helper registreert product-ID, productnaam, eenheid, hoeveelheiddelta, reden, tijdstip en gebruiker.
- Voorraadbatchgegevens zitten in `product.batches`; producthoeveelheid wordt uit batches gesynchroniseerd.
- De bestaande kostprijshelper `unitCost(product)` berekent `purchasePrice / purchaseQuantity`. De exacte betekenis van de basiseenheid hangt af van de opgeslagen producteenheid en moet bij de integratie expliciet worden gevalideerd.
- Recepten zitten in `state.recipes`, met ingrediënten die naar `stockId` verwijzen, plus yield, stappen en versiegeschiedenis.
- `recipeCost(recipe)` berekent de huidige receptkost op basis van gekoppelde voorraadartikelen en `unitCost`.
- Receptconsumptie loopt via de bestaande batchverbruiksfunctie en schrijft voorraadbewegingen. De uitbreidingen mogen deze logica niet dupliceren.

## 3. Rollen en navigatie

- De hoofdapp kent onder meer rollen `owner`, `manager` en `employee` vanuit de cloudsessie.
- Navigatie controleert al expliciet toegang voor medewerkers en managers tot bepaalde pagina's.
- Nieuwe financiële overzichten moeten alleen voor eigenaar en toegelaten managers toegankelijk zijn. Alleen een verborgen menu-item is geen beveiliging; ook de data- en serverkant moet toegang afdwingen.

## 4. Gevolgen voor de nieuwe modules

### Voedselverspilling
- Voeg niet zomaar een nieuwe collectie toe aan de volledige snapshot zonder eerst de gevolgen voor cloud-RPC, conflict-resolutie en auditlogging te testen.
- Foto-binaries horen niet in localStorage of de JSON-snapshot. Gebruik in de echte implementatie private object storage en een aparte IndexedDB upload-wachtrij.
- Een verspillingregistratie heeft een stabiele client UUID nodig voor idempotentie.
- De voorraadbeweging moet exact één keer worden aangemaakt. Beslis eerst of registratie automatisch voorraad afboekt of enkel rapporteert; de eerste release moet deze keuze expliciet maken.
- Bewaar de gebruikte kostprijs als momentopname zodat historische verspillingswaarde niet wijzigt wanneer de actuele inkoopprijs verandert.

### Menurendabiliteit
- Receptkost is al beschikbaar via bestaande logica; bouw geen tweede foodcost-engine.
- De huidige hoofdcode die is bekeken toont geen bewezen kassaverkoopbron of verkochte porties per gerecht. Daarom zijn werkelijke verkoopvolumes pas beschikbaar na gecontroleerde import of gevalideerde POS-koppeling.
- Verkoopprijs, btw-behandeling, receptversie en kostprijsmomentopname moeten expliciet aan een periode-/verkoopregel worden gekoppeld.

### Horeca-bedrijfsanalyse
- Bouw read-only bovenop bestaande gegevens waar mogelijk.
- Toon geen omzet, verkoopvolume, verspillingwaarde of winst als betrouwbare nul wanneer de bron ontbreekt.
- Houd omzet, ingrediëntkosten, brutowinst op ingrediëntenbasis en nettowinst strikt uit elkaar.
- Vermijd dubbeltelling van verspilling die ook als voorraadbeweging voorkomt.

## 5. Veiligheidsgrenzen en nog niet geverifieerd

- Deze inventaris is gebaseerd op de repositorycode in de ontwikkelbranch; dit is geen live runtime-test.
- Er is geen database- of Storage-schemawijziging uitgevoerd.
- Supabase-projecten zijn bevestigd: ANIMO HACCP = test (ref xwjcwravfeldndwlugai); animo-haccp-test = live (ref zimzsovvtdmrthrflkgm). De live projectref is niet aangeraakt.
- De tijdelijke testconfiguratie in `index.html` is teruggedraaid. De featurebranch bevat nu dezelfde bestaande live-configuratieregel als `main`; er is geen app-codewijziging meer bedoeld. Open of deploy deze featurebranch niet als testapp: de testdatabase wordt voor deze fase alleen rechtstreeks en read-only onderzocht.
- Het testproject bevat momenteel geen bedrijfs-/klantrecords in de gecontroleerde public-tabellen. De bestaande voorraad zit in app_data.data als JSON-snapshot; er bestaat geen aparte voorraad- of voorraadbewegingstabel.
- De twee bestaande private Storage-buckets zijn onboarding-documentbuckets. Er bestaat nog geen voedselverspillingbucket.
- De officiële Supabase CLI heeft via GitHub Actions het migratiebestand `supabase/migrations/20261111220217_create_food_waste_entries.sql` aangemaakt. De SQL is daarna op de featurebranch uitgewerkt. De migratie is nog niet toegepast; er is geen DDL- of Storage-wijziging uitgevoerd in Supabase.
- Er is een geïsoleerde kernmodule toegevoegd in voedselverspilling-core.mjs met validatie, eenheidsconversie, kostprijsmomentopname en een aparte IndexedDB-wachtrij voor foto's/registraties. Deze module is nog niet aan de bestaande app-UI of cloud-sync gekoppeld.
- Eenheidstestscenario's zijn toegevoegd in tests/voedselverspilling-core.test.mjs. De berekenings- en validatiechecks zijn lokaal uitgevoerd; echte IndexedDB-, Supabase-, Storage- en iPhone-tests zijn nog niet uitgevoerd.
- Eerste release is bewust rapportage-only: geen automatische voorraadbeweging, om dubbele afboeking te voorkomen.
- Supabase-projectmapping is bevestigd: `ANIMO HACCP` is test (`xwjcwravfeldndwlugai`) en `animo-haccp-test` is live (`zimzsovvtdmrthrflkgm`). De testdatabase is alleen read-only geïnspecteerd; de live database is niet benaderd.
- RLS- en Storage-policies voor de nieuwe tabellen/foto's moeten in een afzonderlijke testomgeving ontworpen en getest worden.
- De bestaande snapshot-RPC en volledige offline-sync vereisen regressietests voordat een nieuwe collectie aan de productiestaat kan worden toegevoegd.

## 6. Aanbevolen technische volgorde

1. Valideer de nieuwe SQL eerst in een geïsoleerde tijdelijke PostgreSQL/Supabase-omgeving, zonder productieverbinding.
2. Test RLS en Storage met tijdelijke testaccounts en testzaken: medewerker, manager, eigenaar, niet-lid en verlopen abonnement.
3. Test offline wachtrij, foto-upload, retry en dubbele synchronisatie met dezelfde client-ID.
4. Integreer pas daarna via een kleine adapter met bestaande voorraad- en recepthelpers; laat de bestaande snapshot-sync ongemoeid.
5. Voer regressietests uit voor alle bestaande live functies in een aparte testbuild.
6. Vraag expliciete goedkeuring voordat iets naar de live branch, database of hosting gaat.

## 7. Conclusie

De huidige app heeft bruikbare bestaande bouwstenen: voorraadartikelen, batches, voorraadbewegingen, recepten, receptversies, receptkost, gebruikersrollen en offline snapshots. De grootste technische risico's zijn de bestaande volledige-snapshot-synchronisatie, het veilig bewaren/synchroniseren van foto's en het ontbreken van bewezen kassaverkoopdata in de bekeken hoofdcode. De nieuwe modules moeten daarom eerst geïsoleerd worden gebouwd en pas daarna gecontroleerd worden aangesloten.
- De geïsoleerde adapter `voedselverspilling-sync.mjs` controleert de ingelogde gebruiker, fotoformaat/-grootte, upload naar private Storage, databasebevestiging en idempotente retries. Ze verwijdert een IndexedDB-entry pas na beide serverbevestigingen. Deze adapter is nog niet aan de app gekoppeld; tests gebruiken een fake Supabase-client.


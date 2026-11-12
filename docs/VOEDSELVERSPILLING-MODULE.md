# ANIMO HACCP — Module Voedselverspilling

Status: testintegratie met automatische voorraadkoppeling op de aparte feature-branch; niet samengevoegd of gepubliceerd naar productie. Geautomatiseerde module-, synchronisatie- en PostgreSQL-beveiligingstests slagen; volledige praktijktest op iPhone en met meerdere gelijktijdige gebruikers blijft nodig.

De huidige testintegratie bevat:
- Een aparte navigatiepagina **Voedselverspilling** in de ANIMO HACCP-testapp.
- Registratie met productnaam, hoeveelheid, eenheid, reden en verplichte foto (JPEG/PNG/WebP, maximaal 5 MB).
- Optionele koppeling met een bestaand stockartikel en kostprijsmomentopname.
- Een afzonderlijke IndexedDB-wachtrij voor offline registraties en foto's.
- Synchronisatie naar de private fotobucket en de tabel `public.food_waste_entries`; de lokale wachtrij wordt pas verwijderd na bevestiging.
- Een basisoverzicht met aantallen, gekende kost en recente registraties.
- Medewerker-/manager-/eigenaarrechten die door RLS en Storage-policies in de testdatabase worden afgedwongen; eigenaar/manager kan een registratie ongeldig verklaren met reden.

Nog niet afgewerkt: uitgebreide filters en periodevergelijkingen, top-producten/redenrapporten, fotocompressie en een volledige praktijktest met aparte testaccounts en echte mobiele toestellen. Handmatige synchronisatie opnieuw proberen is inmiddels aanwezig. De module is dus nog geen productieklare release.

## Doel

Medewerkers kunnen voedselverspilling snel registreren vanaf een smartphone. Elke registratie bevat minimaal een foto, productnaam en gemeten gewicht. ANIMO berekent waar mogelijk de aankoopwaarde en toont de resultaten in de Horeca-bedrijfsanalyse.

Deze module is aanvullend op de bestaande voorraad-, recept-, foodcost- en offlinefunctionaliteit. Bestaande functies en klantgegevens blijven onaangeroerd.

## 1. Medewerkerflow

1. Open **Voedselverspilling**.
2. Open **Nieuwe registratie**.
3. Maak een foto met de camera of kies een bestaande foto.
4. Vul de productnaam in of selecteer een bestaand voorraadproduct.
5. Vul het gewicht in (gram of kilogram).
6. Kies de reden.
7. Bevestig en registreer.

Verplichte velden:
- Foto (minstens één).
- Productnaam.
- Gewicht groter dan nul.
- Eenheid (g, kg, ml, cl, l of stuk).
- Reden van verspilling.

Automatisch vastgelegd:
- Horecazaak/organisatie.
- Medewerker-ID en weergavenaam.
- Datum en tijd van aanmaak (serverdatum na synchronisatie; lokaal tijdstip apart bewaren).
- Client-generated UUID voor veilige offline synchronisatie.
- Synchronisatiestatus.

Optioneel:
- Opmerking.
- Gerecht/recept waaraan het product gekoppeld was.
- Extra foto, bijvoorbeeld verpakking of houdbaarheidsdatum.

## 2. Redenen (standaardlijst)

- Houdbaarheid verstreken.
- Product bedorven.
- Te veel bereid.
- Verkeerd bereid.
- Beschadigd product.
- Restjes van klanten.
- Temperatuurprobleem.
- Product gevallen/verontreinigd.
- Andere reden (opmerking verplicht).

De eigenaar/manager kan later eventueel eigen redenen toevoegen. De lijst mag niet verhinderen dat een medewerker een geldige registratie kan opslaan.

## 3. Product- en kostprijslogica

- Product kan gekoppeld worden aan een bestaand voorraadartikel.
- Bij koppeling gebruikt ANIMO de relevante aankoopprijs en basiseenheid uit de bestaande voorraadadministratie.
- Gewicht wordt eerst omgerekend naar de basiseenheid van het voorraadartikel.
- Bewaar bij registratie een momentopname van de gebruikte eenheidsprijs, valuta, eenheid en berekende verspilde waarde. Zo veranderen historische rapporten niet wanneer de aankoopprijs later wijzigt.
- Formule: verspilde waarde = omgerekende hoeveelheid × eenheidskostprijs.
- Wanneer geen betrouwbare koppeling of kostprijs bestaat: registratie wel bewaren, maar waarde markeren als **Nog te bepalen**. Geen nulwaarde presenteren alsof het gratis was.
- Handmatige productnaam blijft mogelijk; eigenaar/manager kan achteraf product en kostprijs koppelen.

Voorbeeld: 750 g kipfilet aan €12/kg = €9,00 verspilde voorraadwaarde. Dit is geen nettowinstverliesberekening en houdt geen rekening met btw, arbeid of overhead.

## 4. Voorraadkoppeling zonder dubbele afboeking

De testbranch gebruikt de bestaande `state.stock`, batchstructuur en `state.stockMovements`.

- Alleen een registratie die expliciet aan een bestaand stockartikel is gekoppeld, boekt automatisch af. Een vrije productnaam wijzigt de voorraad niet.
- De hoeveelheid wordt omgerekend naar de basiseenheid van het stockartikel. Niet-compatibele eenheden worden niet afgeboekt.
- De bestaande FIFO/FEFO-volgorde wordt gevolgd. De beweging bewaart de exacte batch-ID's en hoeveelheden.
- Bij onvoldoende voorraad wordt de verspilling wel geregistreerd, maar de voorraad wordt niet negatief gemaakt en er gebeurt geen gedeeltelijke afboeking.
- Elke afboeking gebruikt de client UUID als unieke bron-ID. Herhaalde synchronisatie herkent de bestaande beweging en boekt niet opnieuw af.
- Bij ongeldig verklaren wordt de oorspronkelijke batchallocatie teruggezet. De terugboeking heeft een eigen idempotente bron-ID.
- Offline wordt de lokale voorraad onmiddellijk aangepast en via de bestaande snapshot-outbox bewaard. Bij synchronisatie wordt de voorraad-snapshot eerst bevestigd; pas daarna wordt de lokale verspillingwachtrij verwijderd.
- Als de snapshot niet veilig kan worden opgeslagen, blijft de verspilling in de wachtrij en toont de UI dat synchronisatie nog wacht.
- Historische kostprijsmomentopnames blijven ongewijzigd.

## 5. Offline en foto-opslag

- Registratie moet offline kunnen worden aangemaakt.
- Foto en formuliergegevens worden tijdelijk veilig in IndexedDB bewaard; geen grote foto's in localStorage.
- Toon duidelijk **Wacht op synchronisatie**.
- Bij verbinding: upload foto, controleer uploadresultaat en synchroniseer daarna de registratie.
- Herhaal mislukte uploads automatisch zonder dubbele records.
- Toon bij fouten een begrijpelijke status en laat handmatig opnieuw proberen.
- Comprimeer foto's op het toestel tot een redelijke uploadgrootte, met behoud van leesbare productdetails.
- Verwijder de lokale wachtrij pas nadat zowel foto als registratie bevestigd zijn gesynchroniseerd.

## 6. Eigenaar/manager-dashboard

Filters:
- Vandaag, deze week, deze maand, aangepaste periode.
- Product.
- Reden.
- Medewerker.
- Gerecht/recept.
- Alleen registraties met/zonder bepaalde kostprijs.

Kerncijfers:
- Totaal verspild gewicht (kg).
- Aantal registraties.
- Geregistreerde verspilde voorraadwaarde (€).
- Gemiddelde waarde per registratie.
- Topproducten op verspild gewicht en waarde.
- Verdeling per reden.
- Evolutie tegenover vorige periode.

Detailweergave:
- Foto.
- Product en gewicht.
- Reden en opmerking.
- Medewerker, datum en uur.
- Gekoppeld voorraadproduct.
- Gebruikte kostprijs en berekende waarde.
- Synchronisatie- en eventuele correctiestatus.

## 7. Rollen en rechten

- Medewerker: registraties aanmaken en eigen registraties bekijken volgens de bestaande apprechten.
- Manager: registraties van de eigen horecazaak bekijken en corrigeren volgens afgesproken rechten.
- Eigenaar: alle registraties en analyses van de eigen horecazaak beheren.
- Platformbeheer krijgt geen automatische inhoudelijke toegang tot klantfoto's; volg de bestaande support- en auditregels.

Database en Storage moeten tenant-isolatie afdwingen. RLS moet organisatie-lidmaatschap en rol controleren; alleen ingelogd zijn is onvoldoende. Foto-opslag moet privé zijn, met beperkte toegang via geautoriseerde sessies of kortlevende signed URLs. Geen publieke bucket.

Correcties moeten auditbaar zijn. Bij voorkeur wordt een registratie niet stilzwijgend verwijderd: markeer ze als ongeldig met reden en behoud de auditgeschiedenis.

## 8. UX-eisen

- Mobile-first, bruikbaar met één hand.
- Grote knop **Foto nemen**.
- Duidelijke invoer voor productnaam en gewicht.
- Numeriek toetsenbord voor gewicht.
- Eenheid expliciet tonen.
- Voorbeeld: 750 + gram.
- Bevestigingsscherm vóór definitieve opslag.
- Duidelijke melding wanneer kostprijs ontbreekt.
- Geen AI-herkenning nodig voor de eerste versie. Foto is bewijs; medewerker bevestigt productnaam en gewicht.

## 9. Acceptatie- en testcriteria

1. Medewerker kan online een foto, product, gewicht en reden registreren.
2. Registratie verschijnt bij de juiste horecazaak en is niet zichtbaar voor andere zaken.
3. Kostprijsberekening klopt bij g/kg-omrekening.
4. Historische waarde blijft gelijk na wijziging van de huidige aankoopprijs.
5. Zonder kostprijs blijft de registratie bruikbaar en krijgt ze status **Nog te bepalen**.
6. Offline registratie met foto blijft na herladen van de app bewaard.
7. Na herstel van internet synchroniseert de registratie precies één keer.
8. Herhaald uploaden of synchroniseren maakt geen dubbele foto-records of voorraadbewegingen.
9. Een gekoppelde registratie verbruikt FIFO/FEFO-batches en maakt geen negatieve voorraad.
10. Een ongeldig verklaarde registratie zet exact de oorspronkelijke batchallocaties terug, maximaal één keer.
9. Medewerkers kunnen geen dashboard- of eigenaaracties uitvoeren waarvoor ze geen rechten hebben.
10. Foto's zijn niet publiek toegankelijk.
11. Filters, totalen en periodevergelijkingen komen overeen met de onderliggende registraties.
12. Correcties zijn terug te vinden in de auditgeschiedenis.

## 10. Veilige implementatievolgorde

Fase A — Alleen-lezen technische inventaris:
- Bestaande voorraadtabellen en voorraadbewegingslogica identificeren.
- Bestaande offline queue en IndexedDB-structuur identificeren.
- Huidige foto-/bestandsopslag en toegangsregels identificeren.
- Bestaande rol- en organisatie-RLS controleren.
- Nagaan of een verspillingstype al bestaat om duplicatie te vermijden.

Fase B — Ontwikkeling op aparte branch en geïsoleerde testomgeving:
- Datamodel en private foto-opslag.
- RLS en Storage policies.
- Mobiele registratieflow.
- Offline wachtrij en idempotente synchronisatie.
- Koppeling aan bestaande voorraadbewegingen.
- Dashboard en rapportage.

Fase C — Tests met fictieve gegevens:
- Online/offline, dubbele sync, meerdere medewerkers, meerdere organisaties, ontbrekende kostprijs, verschillende gewichtseenheden en foto-uploadfouten.

Fase D — Review en expliciete goedkeuring vóór enige release naar productie.

## Buiten scope van de eerste versie

- Automatische AI-herkenning van producten of gewicht op foto's.
- Automatische bestelling bij leveranciers.
- Automatische receptaanpassingen.
- Nettowinstberekening van de volledige horecazaak.

Deze kunnen later worden onderzocht, maar mogen de betrouwbare basisregistratie niet vertragen.

## Offline synchronisatie — geïsoleerde adapter

De eerste versie van `voedselverspilling-sync.mjs` is toegevoegd, zonder koppeling aan de bestaande app:

- controleert of de ingelogde Supabase-gebruiker dezelfde medewerker is als de eigenaar van de offline registratie;
- controleert UUID's, product, hoeveelheid, fotoformaat en de limiet van 5 MB;
- uploadt naar het private pad `business_id/uploader_user_id/client_id.ext` met dezelfde vaste client-ID bij een retry;
- schrijft pas daarna de registratie naar `food_waste_entries`;
- behandelt een dubbele client-ID alleen als geslaagde retry wanneer de volledige oorspronkelijke registratie en kostprijsmomentopname overeenkomen;
- verwijdert de IndexedDB-registratie pas nadat de server de foto én de databaseregel heeft bevestigd;
- houdt mislukte registraties lokaal en gaat bij de volgende wachtrij-items verder.

Deze adapter is nog niet verbonden met de bestaande app-interface, automatische online/offline-events of echte Supabase Storage. De tests gebruiken een nagebootste Supabase-client; echte autorisatie- en iPhone-tests moeten nog in een geïsoleerde testomgeving gebeuren.


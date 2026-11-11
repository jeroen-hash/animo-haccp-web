# ANIMO HACCP — Databankontwerp Voedselverspilling

Status: database en private fotobucket zijn geïmplementeerd in uitsluitend het ANIMO HACCP-testproject (`xwjcwravfeldndwlugai`). De live database is niet benaderd of gewijzigd.

## Gekozen eerste-releasegedrag

**Voedselverspilling is in versie 1 rapportage-only.** Een registratie verlaagt de voorraad niet automatisch. Dat voorkomt dubbele afboekingen zolang een medewerker of een andere bestaande workflow de voorraad eventueel al heeft aangepast. Een latere voorraadkoppeling vereist een aparte, idempotente voorraadbeweging met dezelfde client UUID en een expliciete productbeslissing.

## Tabel: public.food_waste_entries

| Kolom | Type | Betekenis |
|---|---|---|
| id | uuid | Server-ID |
| business_id | uuid | Horecazaak, FK naar public.businesses |
| client_id | uuid | Clientgegenereerde idempotency key |
| created_by | uuid | Auth-gebruiker die de registratie maakte |
| employee_name | text | Weergavenaam op het moment van registratie |
| product_name | text | Bevestigde productnaam |
| stock_item_id | text, nullable | ID uit de bestaande JSON-stockcollectie; geen FK |
| recipe_id | text, nullable | Optionele receptreferentie |
| quantity | numeric | Positieve ingevoerde hoeveelheid |
| input_unit | text | Genormaliseerde eenheid |
| reason | text | Eén van de afgesproken redenen |
| note | text | Toelichting |
| photo_path | text | Pad naar foto in private Storage |
| cost_unit | text, nullable | Eenheid van de kostprijsmomentopname |
| currency | text | Valuta van de kostprijsmomentopname (EUR voor de Belgische eerste release) |
| unit_cost_snapshot | numeric, nullable | Kostprijs per basiseenheid op registratiemoment |
| cost_value_snapshot | numeric, nullable | Berekende verspilde voorraadwaarde |
| cost_status | text | calculated / unknown |
| client_created_at | timestamptz | Lokale aanmaaktijd |
| created_at | timestamptz | Serverregistratietijd |
| voided_at | timestamptz, nullable | Auditbare ongeldigmaking |
| void_reason | text, nullable | Reden van ongeldigmaking |

Uniek: (business_id, client_id). Daarmee kan dezelfde offline registratie niet tweemaal als afzonderlijke registratie worden aangemaakt. client_id wordt nooit opnieuw gegenereerd bij een retry.

## Toegangsregels

- RLS verplicht op de tabel.
- anon krijgt geen rechten.
- Alleen actieve leden van de betreffende horecazaak mogen registreren.
- Medewerker mag alleen eigen registraties lezen.
- Eigenaar en manager mogen alle registraties van hun horecazaak lezen en corrigeren.
- Geen toegang tussen verschillende business_id-waarden.
- De bestaande private.can_access_business(uuid) helper wordt hergebruikt voor de bestaande abonnements-/toegangscontrole, naast expliciete controle op actief lidmaatschap en rol.
- UPDATE-policy bevat zowel USING als WITH CHECK.
- Rechtstreekse DELETE wordt niet aangeboden; corrigeren gebeurt via ongeldigmaking met reden.

## Foto-opslag

- Private bucket: food-waste-photos.
- Maximaal 5 MB per foto; toegelaten types: JPEG, PNG en WebP.
- Pad: business_id/uploader_user_id/client_id.ext. Het tweede padsegment is het UUID van de ingelogde uploader.
- Geen publieke URL's. Alleen geautoriseerde downloads of kortlevende signed URLs.
- Storage INSERT controleert actief lidmaatschap, abonnements-/toegangsrecht en dat het tweede padsegment gelijk is aan auth.uid(). Storage SELECT laat medewerkers alleen hun eigen map lezen; owner/manager mogen alle mappen binnen hun horecazaak lezen. UPDATE is alleen nodig voor idempotente retries en gebruikt dezelfde tenant- en uploader/rolcontrole.
- De app bewaart de Blob in een afzonderlijke IndexedDB-database, nooit in localStorage of app_data.data.
- De offline registratie blijft lokaal staan tot zowel de foto-upload als de databasebevestiging gelukt zijn.
- Retry gebruikt exact hetzelfde client ID en fotopad.

## Kostprijs

- De huidige voorraad staat in de bestaande app_data JSON-snapshot, niet in een aparte stocktabel.
- Daarom is stock_item_id een tekstuele referentie en wordt er geen ongeldige FK gelegd naar een niet-bestaande voorraadtabel.
- Eenheidsconversie gebeurt alleen binnen dezelfde dimensie (massa, volume of stuks).
- De berekende eenheidsprijs en totale waarde worden als momentopname opgeslagen.
- Ontbrekende of onverenigbare kostprijs wordt unknown, nooit stilzwijgend €0.
- De registratie verandert de bestaande voorraad of voorraadbewegingen niet in versie 1.

## Synchronisatievolgorde

1. Maak registratie met vaste client_id en foto-Blob in aparte IndexedDB-wachtrij.
2. Upload foto naar het deterministische private Storage-pad `business_id/uploader_user_id/client_id.ext`.
3. Schrijf de rij naar food_waste_entries met unieke (business_id, client_id).
4. Controleer de serverbevestiging en lees de rij terug.
5. Verwijder pas daarna de lokale wachtrij-entry.
6. Bij een fout blijft de volledige entry inclusief foto lokaal bewaard en kan dezelfde client ID opnieuw worden geprobeerd.

Storage en Postgres vormen geen gedeelde transactie. Een mislukte database-insert na een geslaagde foto-upload kan tijdelijk een ongebruikte foto achterlaten. De retry hergebruikt hetzelfde pad; een latere gecontroleerde opruimtaak kan verweesde objecten verwijderen.

## Voltooide databasevoorbereiding en resterende tests

1. Officiële Supabase CLI-migraties zijn aangemaakt en toegepast op uitsluitend het testproject.
2. De tabel, indexen, least-privilege grants, RLS-policies, one-way void-trigger en private Storage-bucket/policies zijn aanwezig.
3. De wegwerpbare PostgreSQL 17-test heeft de migraties en allow/deny-regels doorlopen.
4. De testprojectstructuur, grants, trigger en index zijn read-only gecontroleerd; de nieuwe tabel en bucket bevatten nul data.
5. Een triggerprobe in het echte testproject is uitgevoerd in een tijdelijke transactie en teruggedraaid.
6. Nog open: geauthenticeerde Storage API-upload, signed download, offline iPhone-retry en end-to-end tests met tijdelijke testaccounts.
7. Daarna pas UI-integratie in een afzonderlijke testbuild. De live omgeving blijft onaangeroerd.

## Gecontroleerde Supabase-teststructuur (11 november 2026)

Deze punten zijn rechtstreeks nagekeken in het testproject `xwjcwravfeldndwlugai`; ze zijn geen aannames:

- `public.business_members` heeft exact de kolommen `business_id uuid`, `user_id uuid`, `role text` en `active boolean`. De toegelaten rollen zijn `owner`, `manager` en `employee`.
- `business_members` heeft een samengestelde primaire sleutel op `(business_id, user_id)`; de tabel heeft RLS aan.
- `private.can_access_business(p_business_id uuid)` bestaat en is `STABLE SECURITY DEFINER`. De helper controleert actief lidmaatschap én toegang via lifetime-free, lopende proefperiode of actief abonnement. Hij controleert **niet** of iemand owner/manager is.
- De bestaande `public.is_business_member(target_business uuid)` en `public.is_active_business_member(p_business_id uuid)` zijn eveneens SECURITY DEFINER-functies die actief lidmaatschap controleren.
- `public.app_data` bevat de bestaande JSON-snapshot; er is geen aparte genormaliseerde stocktabel aangetroffen.
- De bestaande Storage-buckets zijn privé. De nieuwe private bucket `food-waste-photos` is inmiddels uitsluitend in het testproject aangemaakt.
- De bestaande Storage-policies voor onboarding gebruiken `storage.foldername(name)`, actieve membership en `private.can_access_business(...)` als patroon.

### Gevolgen voor de migratie

1. Gebruik `private.can_access_business(business_id)` als aanvullende toegangs-/abonnementscontrole, niet als rolcontrole.
2. Controleer owner/manager expliciet via `public.business_members.role` en `active IS TRUE`; laat medewerkers alleen hun eigen registraties lezen.
3. Vermijd een RLS-policy die onbedoeld recursief dezelfde membership-policy triggert. Hergebruik de bestaande, gecontroleerde SECURITY DEFINER-membershiphelpers waar dat passend is; voeg geen nieuwe brede bypassfunctie toe.
4. De tabel en Storage-bucket moeten afzonderlijk beveiligd worden. Een private bucket alleen is niet voldoende: ook SELECT/INSERT/UPDATE-policies op `storage.objects` zijn nodig voor de gekozen upload- en retrystrategie.
5. Het definitieve fotopad is `business_id/uploader_user_id/client_id.ext`. Zo kan Storage RLS de uploader controleren zonder een brede toegang voor alle medewerkers van dezelfde zaak. Medewerkers openen uitsluitend hun eigen foto's; eigenaar/manager mogen alle foto's binnen hun zaak openen.
6. De testdatabase bevat momenteel geen bedrijfs-/klantrecords in de relevante tabellen. Toegangstests moeten daarom met tijdelijke testaccounts en testzaken worden opgezet, zonder echte klantgegevens.

De CLI-workflow heeft op 11 november 2026 het officiële migratiebestand `20261111220217_create_food_waste_entries.sql` aangemaakt. Daarna is op de featurebranch een eerste SQL-ontwerp toegevoegd met:

- een eigen tabel, unieke offline client-ID, invoercontroles en kostprijsmomentopname;
- RLS voor actieve leden met geldige zaaktoegang; medewerkers zien alleen eigen registraties, eigenaar/manager zien alle registraties;
- beperkte UPDATE-rechten: alleen ongeldigmaking met reden, geen herschrijven van historische product- of kostprijsgegevens;
- een private fotobucket van maximaal 5 MB met JPEG/PNG/WebP en aparte SELECT/INSERT/UPDATE Storage-policies;
- expliciete Data API-grants voor authenticated, zonder anon-toegang;
- geen voorraadmutaties, geen wijzigingen aan bestaande tabellen, functies of buckets.

Een extra Node-test controleert de veiligheidsvoorwaarden van het migratiebestand statisch. Dat is **geen vervanging** voor een echte PostgreSQL-migratietest of RLS-/Storage-toegangstest.

### Huidige implementatiestatus

- Drie officiële Supabase CLI-migraties zijn aangemaakt en toegepast op uitsluitend het testproject:
  - `20261111220217_create_food_waste_entries`
  - `20261111222400_tighten_food_waste_table_grants`
  - `20261111222644_harden_food_waste_audit_and_index`
- De nieuwe tabel heeft RLS, tenantisolatie, unieke offline client-ID's en de afgesproken rolverdeling.
- De private fotobucket bestaat met 5 MB limiet en JPEG/PNG/WebP.
- De Supabase-defaults gaven authenticated aanvankelijk te brede tabelrechten. De tweede migratie trekt die in; live gecontroleerd: geen table-wide UPDATE, DELETE of TRUNCATE; alleen SELECT, INSERT en UPDATE op `voided_at`/`void_reason`.
- De void-trigger maakt correcties éénmalig en onveranderlijk; de server bepaalt het tijdstip. De FK-index op `created_by` is toegevoegd.
- De nieuwe tabel en bucket bevatten nog nul registraties en nul foto's.
- GitHub Actions coretests en de disposable PostgreSQL 17 RLS/Storage-test zijn geslaagd. De PostgreSQL-test simuleert Supabase-structuur; ze vervangt nog geen volledige Supabase Auth- en Storage API-test.
- Supabase Security Advisor: dezelfde bestaande baseline-aantallen als vóór de module; geen nieuwe food-waste security findings. Performance Advisor: de nieuwe `created_by` FK is nu geïndexeerd; de drie nieuwe indexen staan als ongebruikt omdat de tabel nog leeg is.
- Twee bestaande PR-controles falen op onderdelen buiten deze module: de onboarding-test verwacht 3 trial-CTA's maar vindt er 5; de publieke verkooppagina-test mist een link naar `verwerkersovereenkomst.html`. Deze pagina's en hun tests zijn niet door de voedselverspillingswijzigingen aangepast.
- Live project `zimzsovvtdmrthrflkgm`: niet benaderd of gewijzigd. De PR bevat geen wijziging aan `index.html` of bestaande app-code.

De volgende stap is de geïsoleerde app-interface en echte Storage/API-tests voorbereiden op het testproject. Pas na iPhone-regressietests en expliciete goedkeuring kan integratie in de bestaande app of een live release worden overwogen.

## Synchronisatieadapter toegevoegd (nog niet live gekoppeld)

De geïsoleerde module `voedselverspilling-sync.mjs` voert de afgesproken volgorde uit: authenticatie controleren, private foto uploaden, database-insert bevestigen en pas daarna de lokale wachtrij-entry verwijderen. Bij retries gebruikt ze dezelfde client UUID en hetzelfde foto-pad. Een duplicate wordt alleen geaccepteerd wanneer alle relevante registratievelden en de kostprijsmomentopname exact overeenkomen. Een fout laat de lokale registratie en foto staan.

De adapter en tests zijn voorbereid, maar niet aan de app gekoppeld en niet tegen een echte Supabase-database uitgevoerd.

### Extra validatie in CI en het geïsoleerde testproject

Er is een aparte GitHub Actions-workflow toegevoegd die de migratie uitvoert in een wegwerpbare PostgreSQL 17-container. De fixture bootst alleen de minimaal benodigde Auth-, business-membership- en Storage-structuur na. De SQL-assertions testen medewerker/eigenaar/manager, tenantisolatie, actieve membership, private fotopaden, retry-updates, beperkte correctierechten en het ontbreken van anon-/delete-toegang.

Dit is een echte PostgreSQL-syntax- en RLS-policytest, maar nog geen volledige Supabase-platformtest: Supabase Auth JWT-verificatie, Storage API, signed URLs, Data API-instellingen, abonnementsfunctie en iPhone/browsergedrag worden hiermee niet nagebootst. De meest recente PostgreSQL 17-run is geslaagd op commit `92d5f6f`: alle drie migraties zijn in de wegwerpdatabase uitgevoerd en de allow/deny-assertions voor medewerker, manager, eigenaar, cross-tenant, Storage-upload, retry, beperkte correctierechten en onomkeerbare ongeldigmaking zijn doorlopen. Daarnaast is de structuur in het echte testproject nagekeken; de tijdelijke triggerprobe is binnen een transactie uitgevoerd en teruggedraaid.


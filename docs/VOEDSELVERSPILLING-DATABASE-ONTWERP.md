# ANIMO HACCP — Databankontwerp Voedselverspilling

Status: ontwerp voor geïsoleerde testimplementatie. Dit document is nadrukkelijk nog geen uitgevoerde Supabase-migratie.

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
- Pad: business_id/client_id.ext.
- Geen publieke URL's. Alleen geautoriseerde downloads of kortlevende signed URLs.
- Storage RLS controleert actief lidmaatschap en dezelfde business-map.
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
2. Upload foto naar het deterministische private Storage-pad.
3. Schrijf de rij naar food_waste_entries met unieke (business_id, client_id).
4. Controleer de serverbevestiging en lees de rij terug.
5. Verwijder pas daarna de lokale wachtrij-entry.
6. Bij een fout blijft de volledige entry inclusief foto lokaal bewaard en kan dezelfde client ID opnieuw worden geprobeerd.

Storage en Postgres vormen geen gedeelde transactie. Een mislukte database-insert na een geslaagde foto-upload kan tijdelijk een ongebruikte foto achterlaten. De retry hergebruikt hetzelfde pad; een latere gecontroleerde opruimtaak kan verweesde objecten verwijderen.

## Nog uit te voeren vóór een echte koppeling

1. Genereer een officiële Supabase CLI-migratie in de repository met supabase migration new.
2. Voeg tabel, indexen, grants, RLS-policies en private bucket/policies toe in die migratie.
3. Pas uitsluitend toe op project ANIMO HACCP (test, ref xwjcwravfeldndwlugai).
4. Test allow/deny voor anon, medewerker, manager, eigenaar en een gebruiker van een andere horecazaak.
5. Test Storage upload, retry, signed download en cross-tenant weigering.
6. Voer database-tests uit en controleer Supabase Security- en Performance-Advisors.
7. Pas pas na review de frontend-integratie toe. Project animo-haccp-test (live, ref zimzsovvtdmrthrflkgm) blijft onaangeroerd.

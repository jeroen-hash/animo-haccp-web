# ANIMO HACCP — Module 5: Horeca-bedrijfsanalyse

Status: functionele en technische specificatie. Dit is het centrale managementdashboard dat bestaande ANIMO-gegevens samenbrengt; het vervangt geen bestaande modules.

## Doel

Eigenaar en bevoegde manager krijgen één betrouwbaar overzicht van de operationele en financiële prestaties van de horecazaak. De analyse combineert bestaande voorraad-, aankoop-, recept-, foodcost-, factuur- en HACCP-gegevens met de nieuwe modules Menurendabiliteit en Voedselverspilling.

## 1. Dashboardonderdelen

### Financiële en operationele indicatoren
- Geregistreerde voedselverspillingswaarde en verspild gewicht.
- Ingrediëntkosten en evolutie.
- Voorraadwaarde, voorraadrotatie en vervalrisico waar bestaande gegevens dit toelaten.
- Aankoopprijsveranderingen per voorraadartikel/leverancier wanneer historische prijzen beschikbaar zijn.
- Gemiddelde brutomarge op gerechten, op basis van gekoppelde verkoopgegevens.
- Omzet en brutowinstbijdrage alleen wanneer betrouwbare verkoopdata zijn geïmporteerd of gekoppeld.
- Openstaande leveranciersfacturen alleen indien de bestaande factuurgegevens dit betrouwbaar ondersteunen.

### Trend- en vergelijkingsweergave
- Dag, week, maand, kwartaal en aangepaste periode.
- Vergelijking met vorige gelijkwaardige periode.
- Toon absolute en procentuele verandering.
- Toon ontbrekende gegevens en onvolledige periodes duidelijk.
- Geen lege of ontbrekende data voorstellen als nul.

## 2. Verbanden en signalen

Voorbeelden van controleerbare signalen:
- Aankoopprijs van een ingrediënt stijgt en verhoogt de foodcost van gekoppelde recepten.
- Kostprijsstijging verlaagt de brutomarge van een gerecht.
- Een product wordt herhaaldelijk verspild en veroorzaakt een geregistreerde kost.
- Voorraad nadert vervaldatum, op basis van bestaande batch-/houdbaarheidsregistraties.
- Verkoopmix verschuift naar gerechten met lagere brutowinstbijdrage, als kassadata beschikbaar is.

Elk signaal vermeldt:
- Wat veranderde?
- Welke periode en brongegevens zijn gebruikt?
- Welke gerechten/producten zijn betrokken?
- Welke actie kan de uitbater overwegen?

Geen automatische bestellingen, prijsaanpassingen of voorraadcorrecties.

## 3. Voedselverspilling integreren

Gebruik dezelfde registratiebron als de afzonderlijke medewerkerflow:
- Foto, productnaam, gewicht, reden, medewerker en tijdstip.
- Waarde op basis van vastgelegde kostprijs op het moment van registratie.
- Niet-geprijsde registraties apart tonen als **Nog te bepalen**.
- Geen dubbele telling wanneer verspilling ook als voorraadbeweging geregistreerd wordt.
- Filters op periode, product, reden en medewerker.
- Foto's alleen toegankelijk voor geautoriseerde gebruikers van de eigen zaak.

## 4. Aankoopprijzen en leveranciers

- Gebruik bestaande factuur-/UBL-import en voorraadartikelen als bron waar mogelijk.
- Bewaar prijswaarnemingen met datum, leverancier, verpakking, hoeveelheid, eenheid en omgerekende eenheidsprijs.
- Vergelijk alleen vergelijkbare producten en eenheden.
- Toon prijsverschillen en historische evolutie.
- Markeer twijfelachtige productmatches voor menselijke controle.
- Geen automatische conclusie dat twee producten identiek zijn op basis van alleen een gelijkaardige naam.

## 5. Rollen en toegangsrechten

- Eigenaar: volledige bedrijfsanalyse voor de eigen horecazaak.
- Manager: toegang volgens bestaande rolconfiguratie en rechten van de zaak.
- Medewerker: geen toegang tot financiële bedrijfsanalyse tenzij bestaande rechten dat uitdrukkelijk toestaan.
- Tenant-isolatie en RLS moeten alle onderliggende gegevens beschermen.

## 6. Schermen

- Managementdashboard met kerncijfers.
- Kosten- en aankoopprijstrends.
- Voedselverspillingsanalyse.
- Voorraad- en vervalrisico-overzicht.
- Menurendabiliteit-samenvatting.
- Detailpagina per waarschuwing/signaal.
- Export naar PDF/CSV, met periode en definities van de gebruikte cijfers.

## 7. Datakwaliteit en financiële definities

- Toon welke gegevens beschikbaar zijn en welke niet.
- Scheid ingrediëntkosten, brutowinst op ingrediëntenbasis, omzet en nettowinst.
- Nettowinst niet berekenen zonder personeels-, huur-, energie-, afschrijvings- en overige bedrijfskosten.
- Vermeld of cijfers inclusief of exclusief btw zijn.
- Historische vergelijkingen gebruiken vastgelegde prijs-/kostprijsgegevens en geen huidige prijzen op oude transacties toepassen.
- Vermijd dubbeltelling van verspilling, voorraadmutaties, facturen en verkoop.

## 8. Acceptatiecriteria

1. Dashboard totalen zijn herleidbaar tot bestaande brongegevens.
2. Per indicator is duidelijk welke bron en periode gebruikt zijn.
3. Ontbrekende data worden als ontbrekend weergegeven, niet als nul.
4. Menurendabiliteit wordt alleen getoond met voldoende betrouwbare verkoopgegevens.
5. Verspillingswaarde wordt niet dubbel geteld met voorraadmutaties.
6. Aankoopprijsvergelijkingen normaliseren verpakkingseenheden en tonen onzekere matches.
7. Periodevergelijkingen gebruiken gelijkwaardige periodes.
8. Rollen en tenant-isolatie worden getest met minstens twee testorganisaties.
9. Exporttotalen komen overeen met het scherm.
10. Alle wijzigingen en correcties blijven auditbaar.

## 9. Implementatievolgorde

A. Inventariseer bestaande databronnen en definities.
B. Bouw dashboard-read-model op fictieve gegevens in geïsoleerde testomgeving.
C. Koppel bestaande gegevens read-only.
D. Integreer voedselverspilling en menurendabiliteit.
E. Test totalen, periodes, rollen, tenant-isolatie, ontbrekende gegevens en dubbeltelling.
F. Pas na review en expliciete toestemming voorbereiden voor productie.

# ANIMO HACCP — Module 2: Menurendabiliteit

Status: eerste implementatiefase op een geïsoleerde featurebranch. De berekeningskern, CSV-validatie, manager-only dashboard en import van kassaregels zijn toegevoegd aan de testcode. Nog niet vrijgegeven voor productie en nog niet verbonden met een kassasysteem-API.

## Doel

De bestaande recepten- en foodcostfuncties blijven de bron voor ingrediëntkosten. Deze uitbreiding analyseert daarnaast verkoopprijs, brutowinst, marge, verkochte aantallen en winstbijdrage per gerecht. Ze mag bestaande recept- of foodcostberekeningen niet dupliceren of overschrijven.

## 1. Analyse per gerecht

Toon per gerecht:
- Naam en actieve receptversie.
- Verkoopprijs inclusief btw en exclusief btw, met btw-tarief expliciet.
- Ingrediëntkost per portie uit de bestaande recept-/foodcostberekening.
- Brutowinst per portie = verkoopprijs exclusief btw min ingrediëntkost.
- Brutowinstmarge = brutowinst / verkoopprijs exclusief btw × 100.
- Verkochte porties in de geselecteerde periode.
- Omzet exclusief btw, totale ingrediëntkost en totale brutowinst.
- Historische evolutie van kostprijs en marge.

Belangrijk: gebruik verkoopprijs exclusief btw voor margeanalyse. Maak duidelijk dat brutowinst op ingrediëntenbasis niet hetzelfde is als nettowinst; personeel, huur, energie, verpakking, commissies en overhead zitten er niet automatisch in.

## 2. Verkoopgegevens

Zonder betrouwbare verkoopgegevens mag ANIMO geen verkochte aantallen of werkelijke winstbijdrage suggereren.

Eerste versie:
- Handmatige import van kassaverkooprapporten (CSV/XLSX) met voorbeeldsjablonen.
- Mapping van kassaproducten naar ANIMO-gerechten.
- Validatie van datum, product, aantal, prijs, btw en eventuele kortingen.
- Dubbele imports detecteren met bronbestand, periode en unieke transactiereferentie indien aanwezig.
- Importresultaat tonen: geïmporteerd, niet gekoppeld, waarschuwingen en fouten.
- Handmatige correctie van productmapping door eigenaar/manager.

Latere versie:
- API-koppelingen met kassasystemen na keuze van concrete POS-provider(s).
- Geen POS-integratie beloven vóór de API, toestemming en datavelden zijn gevalideerd.

## 3. Menu-engineering

Classificeer gerechten op basis van populariteit en brutowinstbijdrage per gerecht:
- Sterren: populair en hoge brutowinst per portie.
- Werkpaarden: populair maar lagere brutowinst per portie.
- Uitdagingen: weinig verkocht maar hoge brutowinst per portie.
- Verliezers: weinig verkocht en lage brutowinst per portie.

Drempels moeten configureerbaar of transparant berekend zijn op basis van de geselecteerde periode en menugroep. Toon altijd de onderliggende aantallen en marge; vermijd onverklaarde labels.

## 4. Adviezen

Genereer controleerbare signalen, geen automatische prijswijzigingen:
- Kostprijs gestegen sinds vorige periode.
- Marge onder ingestelde doelmarge.
- Verkoopprijs ontbreekt of is verouderd.
- Veel verkoop maar lage bijdrage.
- Hoge marge maar lage populariteit.

Elk advies toont de gebruikte cijfers en reden. De uitbater beslist zelf.

## 5. Schermen

- Menurendabiliteit-overzicht met periodefilter.
- Gerechtendetail met prijs, kost, marge en verkooptrend.
- Menu-matrix (populariteit versus brutowinst per portie).
- Verkoopimport met mapping- en foutcontrole.
- Instellingen voor btw, doelmarges en drempels.

## 6. Acceptatiecriteria

1. Ingrediëntkost komt uit bestaande foodcostbron en stemt overeen met de receptversie.
2. Brutowinst en marge gebruiken verkoopprijs exclusief btw.
3. Geen verkoopdata betekent geen gefingeerde verkoopvolumes of winstbijdrage.
4. Import herkent en meldt dubbele bestanden/transacties.
5. Niet-gematchte kassaproducten worden niet stilzwijgend aan een willekeurig gerecht gekoppeld.
6. Rapporttotalen stemmen overeen met geïmporteerde verkoopregels.
7. Wijzigingen aan een recept of aankoopprijs veranderen historische rapporten niet ongemerkt; bewaar gebruikte kostprijs- en receptversiemomentopnamen.
8. Adviezen zijn herleidbaar tot cijfers en leiden niet automatisch tot prijswijzigingen.
9. Alleen bevoegde eigenaar/manager kan verkoopmappings en prijsinstellingen wijzigen.
10. Data van verschillende horecazaken blijven strikt gescheiden.

## 7. Huidige implementatiestatus\n\n- De module gebruikt de bestaande `recipeCost`-functie uit ANIMO HACCP; er is geen tweede foodcostberekening toegevoegd.\n- Verkoopprijs en btw-tarief worden per recept bewaard in de bestaande bedrijfsgebonden snapshot.\n- CSV-import ondersteunt komma/puntkomma, Belgische bedragen en ISO- of Belgische datums; foutieve regels worden geweigerd.\n- Kassaproducten worden door eigenaar/manager handmatig aan recepten gekoppeld. Niet-gekoppelde regels tellen niet mee in de rendabiliteit.\n- Bij import wordt de receptversie en ingrediëntkost per portie als momentopname bij de verkoopregels opgeslagen. Latere recept- of inkoopprijswijzigingen herschrijven de historische kost niet.\n- Onvolledige btw- of kostgegevens leveren geen volledige brutowinsttotalen op.\n- De module heeft nog geen gevalideerde CSV/XLSX-formaten van concrete kassaleveranciers; XLSX en POS-API's zijn nog niet geïmplementeerd.\n- De nieuwe module is alleen in de featurebranch aanwezig; productie en live database zijn niet gewijzigd.\n\n## 8. Implementatievolgorde

A. Lees bestaande recept-, foodcost-, menu- en btw-structuren uit.
B. Definieer een genormaliseerd verkoopimportformaat en voorbeeldbestand.
C. Bouw analyse op fictieve data in testomgeving.
D. Test prijsberekening, btw, receptversies, dubbele imports en rapporttotalen.
E. Voeg POS-koppelingen pas toe na keuze en validatie van providers.
F. Geen productie-release zonder review en expliciete goedkeuring.

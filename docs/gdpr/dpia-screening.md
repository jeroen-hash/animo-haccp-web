# DPIA-screening en eerste risicoanalyse – ANIMO HACCP

**Versie:** 1.0 – 7 november 2026  
**Status:** voorlopige screening, geen formele of extern gevalideerde DPIA.

## 1. Beschrijving van de verwerking
ANIMO HACCP is een webapp voor professionele horecazaken. Het platform verwerkt accountgegevens en door horecazaken ingevoerde bedrijfsregistraties. Een deel van de app-gegevens wordt lokaal in browseropslag bewaard om offline te kunnen werken en later te synchroniseren. De primaire Supabase-regio is eu-west-2 (Londen, VK). Voor betalingen wordt Stripe gebruikt; STRATO verzorgt onder meer websitehosting/e-mail en ontvangt versleutelde back-upbestanden voor bepaalde private documentopslag.

## 2. Betrokkenen en gegevens
- Zaakvoerders, managers en medewerkers: account-ID, e-mailadres, rol, registratienaam/handtekening, audit- en gebruiksgegevens.
- Leverancierscontacten: naam, contactgegevens en documenten die de klant invoert.
- Prospects: naam, zakelijke contactgegevens en onboardinginformatie.
- Betalende contactpersonen: e-mail, facturatie- en abonnementsmetadata.

De dienst is niet ontworpen om bijzondere categorieën persoonsgegevens te verwerken. Klanten moeten worden ontmoedigd om gezondheidsgegevens, identiteitsdocumenten of andere gevoelige informatie in vrije tekstvelden of uploads te plaatsen.

## 3. Screening op noodzaak van een DPIA
Op basis van de momenteel bekende functies lijkt de verwerking niet automatisch te vallen onder de typische gevallen die steeds een DPIA vereisen: de dienst verwerkt geen bijzondere categorieën als kernactiviteit, geen grootschalige systematische publieke observatie en geen geautomatiseerde besluitvorming met rechtsgevolgen. De verwerking omvat wel personeelsaccounts, auditregistraties, cloudopslag en offline kopieën.

**Voorlopige conclusie:** een volledige DPIA lijkt op basis van de huidige scope niet vanzelfsprekend verplicht, maar deze screening is geen formeel juridisch oordeel. Voer een DPIA opnieuw uit wanneer de schaal, gegevenscategorieën of functies wezenlijk veranderen, of wanneer de criteria van de toezichthouder/EDPB een hoog risico aangeven.

## 4. Risico's en maatregelen

| Risico | Mogelijk gevolg | Bestaande/voorgestelde maatregel | Open actie |
|---|---|---|---|
| Verkeerde zaaktoegang of zwakke toegangscontrole | Onbevoegde inzage in personeels- en bedrijfsgegevens | Rollen, zaakgebonden toegangscontrole en RLS | Periodieke negatieve toegangs- en RLS-test documenteren |
| Accountovername | Onbevoegde toegang | Persoonlijke accounts, wachtwoordauthenticatie, sessiebeheer | MFA voor beheerders waar beschikbaar; beleid voor sterke wachtwoorden en sessies |
| Verlies/diefstal toestel | Lokale offline gegevens kunnen ingezien worden | Browseropslag gekoppeld aan app-gebruik | Waarschuw klanten; adviseer toestelvergrendeling en gedeelde toestellen vermijden; ontwerp lokale wisfunctie |
| Offline wijzigingen niet gesynchroniseerd | Verlies van registraties of onvolledige export | Offline wachtrij en synchronisatieconflictafhandeling | Herstel- en synchronisatietests per mobiel platform |
| Back-upkopieën blijven te lang bestaan | Bewaring langer dan noodzakelijk | GPG-versleutelde back-upbestanden en checksumcontrole | Automatische retentie/verwijdering invoeren en testbewijs bewaren |
| Datalek bij leverancier | Onbevoegde toegang of verlies | Leveranciers-DPA's en subverwerkersinformatie | Contract- en transferdossiers verzamelen en jaarlijks herzien |
| Te veel gegevens in vrije tekst/upload | Onnodige of gevoelige persoonsgegevens | Klant is verantwoordelijk voor invoer | In-app waarschuwing en supportinstructie toevoegen |
| Onjuiste of onvolledige HACCP-registraties | Verkeerde voedselveiligheidsbeslissingen | Klant controleert ingevoerde gegevens en rapporten | Duidelijke disclaimer, opleiding en auditlog/rapportcontrole |

## 5. Restrisico
Het restrisico kan pas definitief worden beoordeeld na uitvoering van de open acties rond back-upretentie, lokale opslag, toegangscontrole, leveranciersdocumentatie en hersteltests. Deze screening mag niet als certificering of garantie worden voorgesteld.

## 6. Goedkeuring en herziening
Eigenaar: ANIMO VOF. Herzien minstens jaarlijks en vóór invoering van wezenlijk nieuwe functies of gegevenscategorieën. Noteer datum, wijziging, bevindingen en verantwoordelijke bij iedere herziening.

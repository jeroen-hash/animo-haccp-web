# Register van verwerkingsactiviteiten – ANIMO HACCP

**Versie:** 1.0 – 7 november 2026  
**Verantwoordelijke voor dit register:** ANIMO VOF  
**Contact:** privacy@animo-apps.com

Dit register is opgesteld als werkdocument op basis van de huidige app-architectuur en de bestaande juridische informatie. Controleer het minstens jaarlijks en bij elke nieuwe functie, leverancier of gegevenscategorie.

## Activiteit 1 – Prospecten, onboarding en klantbeheer

| Veld | Beschrijving |
|---|---|
| Doel | Aanvragen ontvangen, horecazaken beoordelen en inrichten, contracten beheren, klanten ondersteunen |
| Betrokkenen | Contactpersonen van prospects en klanten, zaakvoerders en vertegenwoordigers |
| Gegevens | Naam, e-mail, telefoon, zaaknaam, adres, ondernemingsnummer, gekozen dienstverlening, communicatie, eventueel door de prospect aangeleverde documenten en akkoordversie/-tijdstip |
| Rechtsgrond | Precontractuele maatregelen en uitvoering overeenkomst; gerechtvaardigd belang voor beperkte opvolging en beveiliging; wettelijke verplichting waar toepasselijk |
| Ontvangers | Bevoegde ANIMO-medewerkers; Supabase; STRATO e-mail/hosting; eventueel Stripe voor betaalde diensten |
| Bewaring | Zolang nodig voor aanvraag/relatie en wettelijke administratie; verwijder of anonimiseer afgewezen aanvragen volgens een vast te bepalen termijn |
| Bijzonderheden | Onboardingbestanden kunnen persoonsgegevens bevatten. Vraag geen bijzondere categorieën of overbodige identiteitsdocumenten. |

## Activiteit 2 – App-accounts en toegangsbeheer

| Veld | Beschrijving |
|---|---|
| Doel | Gebruikers authenticeren en rollen/rechten beheren per horecazaak |
| Betrokkenen | Eigenaars, managers en medewerkers van de klant |
| Gegevens | E-mailadres, account-ID, rol, zaaklidmaatschap, authenticatiegegevens (wachtwoorden worden niet in leesbare vorm door ANIMO opgeslagen), account- en beveiligingsgebeurtenissen |
| Rechtsgrond | ANIMO als verwerker: gedocumenteerde instructie van de horecazaak; de klant bepaalt zelf de rechtsgrond voor personeelsgegevens |
| Ontvangers | Supabase Auth/Database; bevoegde ANIMO-support voor zover noodzakelijk |
| Bewaring | Duur van het account/contract plus de afgesproken export- en verwijderperiode, behoudens back-ups en wettelijke verplichtingen |
| Bijzonderheden | De klant moet medewerkers informeren en passende toegangsrechten toekennen. |

## Activiteit 3 – HACCP-/autocontrole- en bedrijfsregistraties

| Veld | Beschrijving |
|---|---|
| Doel | Registreren en rapporteren van temperaturen, schoonmaak, afwijkingen, corrigerende acties, allergenen, voorraad, recepten, leveranciers, leveringen, facturen en dagafsluitingen |
| Betrokkenen | Medewerkers en gebruikers; contactpersonen van leveranciers; eventueel personen genoemd in documenten |
| Gegevens | Door de klant ingevoerde namen, gebruikers-ID's, tijdstippen, handtekeningen/paraaf, registraties, leverancierscontactgegevens, product- en documentgegevens |
| Rechtsgrond | ANIMO als verwerker: gedocumenteerde instructie van de horecazaak |
| Ontvangers | Supabase Database/Storage; STRATO voor versleutelde kopieën van bepaalde private documentopslag; bevoegde gebruikers van dezelfde horecazaak |
| Bewaring | Volgens contractuele bewaartermijn en instructies van de klant; de klant blijft verantwoordelijk voor eigen wettelijke bewaarplichten |
| Bijzonderheden | De app is niet bedoeld voor gezondheidsdossiers of andere bijzondere categorieën persoonsgegevens. Klanten mogen zulke gegevens niet invoeren tenzij daar een geldige noodzaak en rechtsgrond voor bestaat en dit vooraf met ANIMO is afgestemd. |

## Activiteit 4 – Abonnementen en betalingen

| Veld | Beschrijving |
|---|---|
| Doel | Abonnementen starten, beheren, factureren, betalingen innen en fraude voorkomen |
| Betrokkenen | Zaakvoerders en betalende contactpersonen |
| Gegevens | E-mailadres, account-ID, zaak-ID/-naam, Stripe-klant- en abonnementsreferenties, betaalstatus, facturatiegegevens en betaaltransactiegegevens |
| Rechtsgrond | Uitvoering overeenkomst en wettelijke boekhoud-/fiscale verplichtingen |
| Ontvangers | Stripe en bevoegde ANIMO-medewerkers/boekhouder |
| Bewaring | Boekhoudkundige gegevens volgens Belgische wettelijke termijnen; overige betaalmetadata zolang nodig voor contract- en geschilbeheer |
| Bijzonderheden | Stripe verwerkt bepaalde gegevens als verwerker en bepaalde gegevens als zelfstandige verwerkingsverantwoordelijke, onder meer voor fraude- en wettelijke compliance-doeleinden. ANIMO ontvangt geen volledige kaartgegevens. |

## Activiteit 5 – Websitebezoek, beveiliging en foutopsporing

| Veld | Beschrijving |
|---|---|
| Doel | Websitegebruik op hoofdlijnen begrijpen, misbruik voorkomen, beveiliging en storingen onderzoeken |
| Betrokkenen | Websitebezoekers, app-gebruikers |
| Gegevens | Geaggregeerde paginaweergaven zonder bezoekers-ID of IP in de statistiektabel; technische loggegevens kunnen IP-adres, tijdstip, foutmelding of account-/zaakreferentie bevatten |
| Rechtsgrond | Gerechtvaardigd belang voor beveiliging, foutopsporing en beperkte geaggregeerde statistiek |
| Ontvangers | Supabase logs/Edge Functions, GitHub Actions voor build-/deploylogs, bevoegde ANIMO-beheerders |
| Bewaring | Stel per logbron een korte, aantoonbare bewaartermijn in; verwijder of anonimiseer wanneer niet meer nodig |
| Bijzonderheden | Geen advertentieprofilering of cross-site tracking. Controleer periodiek dat foutmeldingen geen wachtwoorden, tokens, betaalgegevens of volledige registratie-inhoud bevatten. |

## Leveranciers en doorgiften
- **Supabase:** primaire projectregio eu-west-2, Londen (VK). De Europese Commissie heeft voor het VK een adequaatheidsbesluit vernieuwd; verifieer de actuele status en de actuele Supabase DPA/subverwerkerslijst.
- **STRATO:** hosting, e-mail en bestemming voor versleutelde back-ups. De STRATO Data Processing Agreement (versie 3.6) is volgens de aangeleverde PDF op 3 november 2026 afgesloten tussen ANIMO VOF als klant/verwerkingsverantwoordelijke en STRATO GmbH als verwerker. De overeenkomst bevat bepalingen over instructies, vertrouwelijkheid, datalekken, beveiliging, audits en subverwerkers. De productbijlage beschrijft onder meer hosting en e-mail; de werkelijk bestelde diensten bepalen de concrete scope. SFTP wordt niet afzonderlijk als product genoemd. De subverwerkersbijlage is gedateerd 18 maart 2024 en moet op actualiteit worden gecontroleerd. De AVV voorziet algemeen EU/EER-verwerking, tenzij doorgifte naar een derde land noodzakelijk is; exacte opslaglocaties voor de concrete diensten moeten afzonderlijk worden bevestigd.
- **Stripe:** abonnementen en betalingen; rol verschilt per verwerking. Stripe DPA en actuele subverwerkerslijst raadplegen.
- **GitHub:** broncodebeheer en CI/CD. Beperk logs en toegangsrechten; plaats geen gewone klantregistraties in repository/issues.
- Documenteer voor iedere leverancier: contract/DPA, subverwerkers, locaties, transfermechanisme, beveiligingsinformatie, contactpunt en datum van laatste controle.

## Controlepunten
- Herzie bij nieuwe categorieën (bv. personeelsplanning, biometrie, gezondheidsinformatie), nieuwe leveranciers of internationale doorgiften.
- Bevestig bewaartermijnen en verwijderprocedures aan de hand van echte technische tests.
- De horecaonderneming moet haar eigen verwerkingsregister bijhouden voor de persoonsgegevens die zij in ANIMO HACCP verwerkt.

# ANIMO HACCP – GDPR-werkdossier

**Versie:** 1.0 – 7 november 2026  
**Verwerkingsverantwoordelijke voor eigen klant- en prospectgegevens:** ANIMO VOF, handelsnaam ANIMO HACCP, Voorzorgstraat 23, 8930 Menen, België, BE1014408578.  
**Privacycontact:** privacy@animo-apps.com

Dit werkdossier ondersteunt de AVG/GDPR-governance van ANIMO HACCP. Het is interne documentatie en geen juridisch advies, certificaat of bewijs dat alle verplichtingen al volledig zijn uitgevoerd.

## Documenten
- [Register van verwerkingsactiviteiten](register-verwerkingsactiviteiten.md)
- [DPIA-screening en risicoanalyse](dpia-screening.md)
- [Procedure datalekken en verzoeken van betrokkenen](incidenten-en-rechten.md)
- [Bewaar- en verwijderplan](bewaar-en-verwijderplan.md)

## Rollen
- ANIMO is verwerkingsverantwoordelijke voor eigen prospect-, klantcontact-, accountadministratie-, support- en facturatiegegevens.
- De horecaonderneming is verwerkingsverantwoordelijke voor de gegevens die zij in ANIMO HACCP invoert over haar medewerkers, contactpersonen en andere betrokkenen.
- ANIMO handelt voor die ingevoerde zaakgegevens als verwerker volgens de verwerkersovereenkomst.
- Leveranciers zoals Supabase, STRATO, Stripe en GitHub hebben elk hun eigen contractuele rol; Stripe kan voor bepaalde doeleinden zelfstandig verwerkingsverantwoordelijke zijn.

## Status – nog te bevestigen/uit te voeren vóór brede commerciële lancering
1. **Back-upretentie:** de dagelijkse STRATO-back-upworkflow verwijdert na geslaagde verificatie alleen ANIMO-back-upbestanden ouder dan 90 dagen. De eerste uitvoering van deze retentiestap moet nog succesvol worden getest. Voor een herstelincident kan een tijdelijke hold nodig zijn.
2. **Leveranciersdossiers:** bewaar de toepasselijke DPA/voorwaarden, actuele subverwerkerslijsten, transferdocumentatie en contactpunten van Supabase, STRATO, Stripe en GitHub.
3. **STRATO-AVV – ontvangen, scopecontrole nog open:** de klant heeft de STRATO Data Processing Agreement versie 3.6 aangeleverd. De overeenkomst vermeldt dat ze op 3 november 2026 werd afgesloten tussen ANIMO VOF als klant/verwerkingsverantwoordelijke en STRATO GmbH als verwerker, en verwijst naar artikel 28 AVG. De bijlagen beschrijven onder meer hosting- en e-mailproducten, maar de overeenkomst bepaalt dat de concrete verwerking afhangt van de werkelijk bestelde producten. SFTP wordt niet als afzonderlijk product genoemd. De subverwerkersbijlage draagt datum 18 maart 2024; vraag/controleer daarom de actuele lijst en bevestig welke diensten op het STRATO-account actief zijn. De AVV bepaalt in algemene zin EU/EER-verwerking, tenzij doorgifte naar derde landen noodzakelijk is; ze bewijst op zichzelf niet de exacte opslaglocatie van elk concreet ANIMO-bestand.
4. **Contractacceptatie:** de onboardingpagina vereist akkoord met algemene voorwaarden, privacyverklaring en verwerkersovereenkomst. De onboardingfunctie controleert het akkoord en bewaart de documentversie (`2026-11-07`) en server-side tijdstip in de aanvraag. Controleer bij wijzigingen dat de akkoordtekst en versies synchroon blijven.
5. **Bewaar- en verwijdertest:** voer een test uit voor export, beëindiging, 90-dagenverwijdering, back-upverwijdering en lokale browserkopieën.
6. **Beveiligingsbewijs:** documenteer periodieke toegangscontrole, MFA voor beheeraccounts waar beschikbaar, hersteltests, kwetsbaarheden en incidenten.
7. **Juridische review:** laat de publieke documenten en aansprakelijkheidsbepalingen nakijken door een Belgische jurist of privacyprofessional vóór brede verkoop.

## Belangrijkste operationele regel
Geen enkele medewerker mag beloven dat een horecazaak door het gebruik van ANIMO HACCP automatisch wettelijk HACCP-conform is. De operator blijft verantwoordelijk voor zijn eigen autocontrolesysteem, de correcte uitvoering en de wettelijke opvolging.

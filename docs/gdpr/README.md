# ANIMO HACCP – GDPR-werkdossier

**Versie:** 1.1 – 8 november 2026  
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

### Back-upretentie en herstelbewijs – gedeeltelijk gevalideerd
De volgende GitHub Actions-uitvoeringen zijn op 8 november 2026 als geslaagd geregistreerd:

1. **Versleutelde databaseback-up naar STRATO:** run [42429105062](https://github.com/jeroen-hash/animo-haccp-web/actions/runs/42429105062) slaagde. De back-up werd versleuteld, geüpload, teruggedownload, op SHA-256 gecontroleerd, ontsleuteld en als PostgreSQL-archief gevalideerd.
2. **Schema-only databasehersteltest:** run [42430946472](https://github.com/jeroen-hash/animo-haccp-web/actions/runs/42430946472) slaagde. Het schema van de databaseback-up werd hersteld in een tijdelijke PostgreSQL-omgeving. Er werden geen klantrecords naar een herstelomgeving teruggezet.
3. **Versleutelde Supabase Storage-back-up naar STRATO:** run [42431409352](https://github.com/jeroen-hash/animo-haccp-web/actions/runs/42431409352) slaagde. De Storage-objecten werden verzameld, versleuteld, naar STRATO geüpload, teruggedownload, op checksum gecontroleerd, ontsleuteld en inhoudelijk gevalideerd.

Deze controles bewijzen de uitgevoerde back-up- en archiefcontroles, maar vormen **geen volledige disaster-recoverytest**. De database is nog niet met alle klantrecords hersteld in een afzonderlijke, goedgekeurde herstelomgeving. De Storage-archiefcontrole heeft de objecten nog niet teruggezet in een Supabase Storage-project. De retentiestap is in de bevestigde Storage-run veilig als dry-run uitgevoerd; er is dus nog geen bewijs dat oude back-ups daadwerkelijk verwijderd worden. Verwijdering blijft uitgeschakeld totdat die stap afzonderlijk is beoordeeld en uitdrukkelijk goedgekeurd.

De Storage-workflow inventariseert dynamisch alle buckets en controleert bestanden via grootte en SHA-256. Bij de laatste read-only inventarisatie waren er twee private buckets: `onboarding-lead-documents` en `onboarding-documents`. De eigen Storage-back-up is geen volledige Postgres-databaseback-up. De eigen databaseback-up en Storage-back-up zijn afzonderlijke workflows.

Het gebruikte Supabase-project is `zimzsovvtdmrthrflkgm` (projectnaam `animo-haccp-test`), zoals door de eigenaar bevestigd. De feitelijke runtime-configuratie van de gepubliceerde app is hiermee nog niet onafhankelijk technisch geverifieerd; verander de projectkoppeling niet zonder aanvullende controle.

### Overige open acties
1. **Leveranciersdossiers:** bewaar de toepasselijke DPA/voorwaarden, actuele subverwerkerslijsten, transferdocumentatie en contactpunten van Supabase, STRATO, Stripe en GitHub.
2. **STRATO-AVV – ontvangen, scopecontrole nog open:** de klant heeft de STRATO Data Processing Agreement versie 3.6 aangeleverd. De overeenkomst vermeldt dat ze op 3 november 2026 werd afgesloten tussen ANIMO VOF als klant/verwerkingsverantwoordelijke en STRATO GmbH als verwerker, en verwijst naar artikel 28 AVG. De bijlagen beschrijven onder meer hosting- en e-mailproducten, maar de overeenkomst bepaalt dat de concrete verwerking afhangt van de werkelijk bestelde producten. SFTP wordt niet als afzonderlijk product genoemd. De subverwerkersbijlage draagt datum 18 maart 2024; controleer daarom de actuele lijst en bevestig welke diensten op het STRATO-account actief zijn. De AVV bewijst op zichzelf niet de exacte opslaglocatie van elk concreet ANIMO-bestand.
3. **Contractacceptatie:** de onboardingpagina vereist akkoord met algemene voorwaarden, privacyverklaring en verwerkersovereenkomst. De onboardingfunctie controleert het akkoord en bewaart de documentversie (`2026-11-07`) en server-side tijdstip in de aanvraag. Controleer bij wijzigingen dat de akkoordtekst en versies synchroon blijven.
4. **Bewaar- en verwijdertest:** voer een test uit voor export, beëindiging, 90-dagenverwijdering, back-upverwijdering en lokale browserkopieën.
5. **Beveiligingsbewijs:** documenteer periodieke toegangscontrole, MFA voor beheeraccounts waar beschikbaar, hersteltests, kwetsbaarheden en incidenten.
6. **Juridische review:** laat de publieke documenten en aansprakelijkheidsbepalingen nakijken door een Belgische jurist of privacyprofessional vóór brede verkoop.
7. **Praktijktest:** voer de volledige gebruikersflows uit in een afzonderlijke testorganisatie, inclusief iPhone en desktop, zonder echte klantgegevens te wijzigen.

## Belangrijkste operationele regel
Geen enkele medewerker mag beloven dat een horecazaak door het gebruik van ANIMO HACCP automatisch wettelijk HACCP-conform is. De operator blijft verantwoordelijk voor zijn eigen autocontrolesysteem, de correcte uitvoering en de wettelijke opvolging.

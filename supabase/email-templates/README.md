# ANIMO HACCP – professionele authenticatiemails

Deze HTML-bestanden zijn bedoeld voor **Supabase Dashboard → Authentication → Email Templates** van project `zimzsovvtdmrthrflkgm`.

De templates gebruiken de bestaande Supabase Auth-beveiligingslinks (`{{ .ConfirmationURL }}`). De knop en de zichtbare reserve-link gebruiken exact dezelfde beveiligde URL. De logo-afbeelding wordt geladen vanaf de bestaande publieke app.

## In te stellen templates

| Supabase-template | Onderwerp | HTML-bestand |
|---|---|---|
| Invite user | Je bent uitgenodigd voor ANIMO HACCP | `invite.html` |
| Reset password | Wachtwoord opnieuw instellen – ANIMO HACCP | `recovery.html` |
| Confirm signup | Bevestig je e-mailadres – ANIMO HACCP | `confirmation.html` |
| Password changed notification | Je wachtwoord is gewijzigd – ANIMO HACCP | `password-changed.html` |

## Belangrijke instellingen
- Laat de bestaande Supabase Site URL en Redirect URLs ongewijzigd.
- Gebruik voor de drie authenticatie-templates de variabele `{{ .ConfirmationURL }}`; vervang die niet door een zelfgemaakte URL.
- Stel bij Password changed notification de HTML in via de beveiligingsmeldingen, indien die melding in het project is ingeschakeld.
- Test na het opslaan een echte uitnodiging naar een testadres en een wachtwoordherstel. Controleer ook op iPhone en in Gmail/Outlook.

## Publicatiestatus
De bestanden in deze map alleen wijzigen de live e-mails nog niet. Supabase-hosted Auth haalt de templates uit de Auth-instellingen van het project, niet uit de GitHub-repository. De templates moeten daar worden opgeslagen om actief te worden. Deze wijziging vereist geen wijziging aan klantgegevens, accounts, abonnementen of bestaande uitnodigingen.

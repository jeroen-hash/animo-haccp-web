# ANIMO testaccounts voor automatische roltests

De workflow `ANIMO testomgeving - rol- en browsertests` voert echte browseraanmeldingen uit op uitsluitend `https://test.animo-apps.com`.

## Eenmalig instellen in GitHub

Maak in het **afzonderlijke Supabase-testproject** drie testgebruikers aan en koppel ze aan een afzonderlijke testzaak met respectievelijk de rollen `owner`, `manager` en `employee`. Geef elke gebruiker een eigen persoonlijke pincode in de ANIMO-app. Gebruik geen productieaccounts of productiegegevens.

Voeg daarna in GitHub bij **Settings → Secrets and variables → Actions → New repository secret** deze negen secrets toe:

- `ANIMO_TEST_OWNER_EMAIL`
- `ANIMO_TEST_OWNER_PASSWORD`
- `ANIMO_TEST_OWNER_PIN`
- `ANIMO_TEST_MANAGER_EMAIL`
- `ANIMO_TEST_MANAGER_PASSWORD`
- `ANIMO_TEST_MANAGER_PIN`
- `ANIMO_TEST_EMPLOYEE_EMAIL`
- `ANIMO_TEST_EMPLOYEE_PASSWORD`
- `ANIMO_TEST_EMPLOYEE_PIN`

Geef deze waarden nooit door in chat, commit ze niet naar GitHub en gebruik ze nergens op de website.

## Uitvoeren

Open GitHub → Actions → **ANIMO testomgeving - rol- en browsertests** → **Run workflow**.

De browser meldt per rol aan op de testsite, controleert het getoonde roltype en controleert dat medewerkers de menu's Beheer en Abonnement niet zien. Bij fouten worden screenshots maximaal zeven dagen als workflow-artifact bewaard.

Deze tests wijzigen geen bedrijfsgegevens en draaien niet op de live app. Ze controleren de zichtbare rolbeperkingen; database-RLS en serverrechten moeten aanvullend afzonderlijk worden getest.

import { readFileSync, existsSync } from "node:fs";

const required = [
  ["privacy.html", ["Londen", "offline", "Stripe", "90 dagen", "privacy@animo-apps.com"]],
  ["algemene-voorwaarden.html", ["hulpmiddel voor de organisatie en registratie", "geen garantie", "FAVV"]],
  ["verwerkersovereenkomst.html", ["artikel 28", "Supabase", "STRATO"]],
  ["landing.html", ["geen wettelijke HACCP-conformiteit"]],
  ["docs/gdpr/README.md", ["Status", "Back-upretentie", "Juridische review"]],
  ["docs/gdpr/register-verwerkingsactiviteiten.md", ["Prospecten", "Abonnementen en betalingen", "Leveranciers"]],
  ["docs/gdpr/dpia-screening.md", ["voorlopige screening", "Restrisico"]],
  ["docs/gdpr/incidenten-en-rechten.md", ["binnen 24 uur", "binnen één maand"]],
  ["docs/gdpr/bewaar-en-verwijderplan.md", ["OPEN ACTIE", "localStorage", "IndexedDB"]]
];

const errors = [];
for (const [path, snippets] of required) {
  if (!existsSync(path)) {
    errors.push(`Ontbrekend bestand: ${path}`);
    continue;
  }
  const content = readFileSync(path, "utf8");
  for (const snippet of snippets) {
    if (!content.toLowerCase().includes(snippet.toLowerCase())) {
      errors.push(`${path}: verplichte tekst ontbreekt: ${snippet}`);
    }
  }
}
if (errors.length) {
  console.error(errors.join("\\n"));
  process.exit(1);
}
console.log("ANIMO HACCP juridische/GDPR-documenten: basiscontroles geslaagd.");

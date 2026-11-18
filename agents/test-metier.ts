// Vérifie le choix du métier (lib/metier-artisan.ts). Lancer : node agents/test-metier.ts
import { metierArtisan } from "./lib/metier-artisan.ts";

const cas: [string, { nom: string; naf?: string | null; domaines: string[]; metierRgeActuel?: string }, string][] = [
  ["Le nom l'emporte sur les domaines RGE", { nom: "Concept Menuiseries", domaines: ["Fenêtres de toit", "Isolation des combles perdus"] }, "Menuisier"],
  ["Un nom de famille ne compte pas (Dujardin)", { nom: "Entreprise Dujardin", naf: "43.99C", domaines: ["Isolation des combles perdus"] }, "Isolation"],
  ["« Aplomb » n'est pas de la plomberie", { nom: "Aplomb Rénovation", naf: "43.31Z", domaines: ["Isolation des murs"] }, "Isolation"],
  ["Code NAF menuisier contre « fenêtres de toit »", { nom: "Sarl Martin", naf: "43.32A", domaines: ["Fenêtres de toit"] }, "Menuisier"],
  ["Électricien qui pose des pompes à chaleur : on garde", { nom: "Hmi", naf: "43.21A", domaines: ["Pompe à chaleur air/eau"] }, "Climatisation et pompe à chaleur"],
  ["Plombier qui pose des pompes à chaleur : on garde", { nom: "Carette et Fils", naf: "43.22A", domaines: ["Pompe à chaleur air/eau"] }, "Climatisation et pompe à chaleur"],
  ["Code généraliste (43.99C) : on garde le RGE", { nom: "Full Renov Habitat", naf: "43.99C", domaines: ["Isolation des combles perdus"] }, "Isolation"],
  ["Couvreur RGE mais code électricien", { nom: "Ets Piras", naf: "43.21A", domaines: ["Isolation des combles perdus"] }, "Électricien"],
  ["Nom à deux métiers : le code NAF décide", { nom: "Plomberie Électricité Lefebvre", naf: "43.21A", domaines: ["Isolation des combles"] }, "Électricien"],
  ["« Artisan du bâtiment » remplacé par le code NAF", { nom: "Léon Grosse", naf: "41.20A", domaines: ["Audit"] }, "Maçon"],
  ["Rattrapage : métier actuel compatible (43.32B)", { nom: "Alu Concept", naf: "43.32B", domaines: [], metierRgeActuel: "Menuisier" }, "Menuisier"],
  ["NAF inconnu (annuaire muet)", { nom: "Habitat Plus", naf: null, domaines: ["Isolation des murs par l'intérieur"] }, "Isolation"],
  ["« Couverture » dans le nom", { nom: "SARL COUVERTURE VASSEUR", naf: "43.99C", domaines: [] }, "Couvreur"],
  // 17/11 : nouveaux métiers.
  ["Photovoltaïque → panneaux solaires", { nom: "Lumys", naf: "43.21A", domaines: ["Panneaux photovoltaïques"] }, "Panneaux solaires"],
  ["Poêle à bois → poêles et cheminées", { nom: "Bat-Ingenierie", naf: "43.22B", domaines: ["Poêle ou insert bois"] }, "Poêles et cheminées"],
  ["Isolation par l'extérieur → façadier", { nom: "Evin", naf: "43.99C", domaines: ["Isolation des murs par l'extérieur"] }, "Façadier"],
  ["« Isol » dans le nom", { nom: "Isol +", naf: "43.31Z", domaines: ["Isolation des murs"] }, "Isolation"],
  ["« Elec » dans le nom : électricien, même en photovoltaïque", { nom: "Bnf Elec", naf: null, domaines: ["Panneaux photovoltaïques"] }, "Électricien"],
  ["Fenêtres de toit → couvreur (inchangé)", { nom: "Sarl Dupont", naf: null, domaines: ["Fenêtres de toit"] }, "Couvreur"],
];

let echecs = 0;
for (const [titre, entree, attendu] of cas) {
  const { metier, source } = metierArtisan(entree);
  const ok = metier === attendu;
  if (!ok) echecs++;
  console.log(`${ok ? "OK " : "ÉCHEC"} ${titre} : ${metier} (${source})${ok ? "" : `, attendu ${attendu}`}`);
}
if (echecs) { console.error(`${echecs} échec(s)`); process.exitCode = 1; }

// Catalogue Stripe de Devanture (28/10) : crée (ou retrouve) les produits, les prix, le code de l'offre de lancement
// et un lien de paiement par cas. Peut être relancé sans risque : rien n'est créé deux fois (clé « cle » en métadonnée,
// « lookup_key » pour les prix). Lancé à la main par le workflow « Stripe — catalogue », en mode test puis en production.
//
// Prix (site vitrine et CGV) :
//   Essentiel : 390 € de création + 19 €/mois, ou 0 € de départ et 55 €/mois sur 12 mois ;
//   Pro       : 690 € de création + 39 €/mois, ou 0 € de départ et 99 €/mois sur 12 mois.
// Offre de lancement (5 premiers clients) : création à moitié prix (195 € / 345 €, prix à part),
// ou 3 premiers mois à moitié prix avec 0 € de départ (code LANCEMENT, réservé à ces deux abonnements).
//
// Déroulé avec un client (CGV) : la CRÉATION se paie à la signature (lien « création ») ; l'ABONNEMENT démarre
// à la mise en ligne du site (lien « abonnement »). Carte ou prélèvement SEPA (à activer dans Stripe).
// Chaque paiement donne une facture Stripe (mentions : réglages Stripe > Facturation > Factures).
import { appendFileSync } from "node:fs";

/** Erreur affichée en clair dans les « Annotations » du lancement GitHub, puis arrêt. */
function echec(message: string): never {
  console.log(`::error title=Stripe — catalogue::${message.replace(/\r?\n/g, " ")}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Échec\n\n${message}\n`);
  process.exit(1);
}

const mode = process.argv[2];
if (mode !== "test" && mode !== "production") {
  echec("Mode attendu : test ou production.");
}
const cle = (mode === "test" ? process.env.STRIPE_SECRET_KEY_TEST : process.env.STRIPE_SECRET_KEY)?.trim();
if (!cle) {
  echec(`Secret GitHub manquant : ${mode === "test" ? "STRIPE_SECRET_KEY_TEST" : "STRIPE_SECRET_KEY"} (GitHub > Settings > Secrets and variables > Actions).`);
}
// Garde-fou : une clé de production ne sert jamais en mode test, et inversement.
if (!/^(sk|rk)_(test|live)_/.test(cle) || cle.includes("_test_") !== (mode === "test")) {
  echec(`Cette clé ne correspond pas au mode ${mode} : elle doit commencer par ${mode === "test" ? "sk_test_ ou rk_test_" : "sk_live_ ou rk_live_"}.`);
}

type Params = Record<string, string | number | boolean>;
async function stripe<T>(methode: "GET" | "POST", chemin: string, params: Params = {}): Promise<T> {
  const corps = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const url = `https://api.stripe.com/v1/${chemin}${methode === "GET" && corps.size ? `?${corps}` : ""}`;
  const res = await fetch(url, {
    method: methode,
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2024-06-20" },
    ...(methode === "POST" ? { body: corps } : {}),
  });
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new Error(`Stripe (${chemin}) : ${json.error?.message ?? res.status}`);
  return json;
}

interface Objet { id: string; metadata?: Record<string, string>; url?: string; active?: boolean }
async function tous(chemin: string, params: Params = {}): Promise<Objet[]> {
  const out: Objet[] = [];
  let apres: string | undefined;
  for (;;) {
    const page = await stripe<{ data: Objet[]; has_more: boolean }>("GET", chemin, { limit: 100, ...params, ...(apres ? { starting_after: apres } : {}) });
    out.push(...page.data);
    if (!page.has_more || page.data.length === 0) return out;
    apres = page.data.at(-1)!.id;
  }
}

const PRODUITS = [
  { cle: "essentiel_creation", nom: "Site Essentiel — création", description: "Création du site Essentiel (paiement unique). Le site est à vous dès le paiement." },
  { cle: "pro_creation", nom: "Site Pro — création", description: "Création du site Pro (paiement unique). Le site est à vous dès le paiement." },
  { cle: "essentiel_mensuel", nom: "Abonnement Essentiel", description: "Hébergement, adresse du site, sécurité et 1 modification par mois. Sans engagement, préavis d'un mois." },
  { cle: "pro_mensuel", nom: "Abonnement Pro", description: "Hébergement, adresse du site, sécurité, fiche Google tenue à jour et 2 modifications par mois. Sans engagement, préavis d'un mois." },
  { cle: "essentiel_sans_frais", nom: "Essentiel — 0 € de départ", description: "Création comprise, 12 mois d'engagement, puis de mois en mois. Le site est à vous après 12 mois payés." },
  { cle: "pro_sans_frais", nom: "Pro — 0 € de départ", description: "Création comprise, 12 mois d'engagement, puis de mois en mois. Le site est à vous après 12 mois payés." },
] as const;

// Prix en centimes. « mensuel » = abonnement mensuel.
const PRIX = [
  { cle: "essentiel_creation", produit: "essentiel_creation", montant: 39000, nom: "Création Essentiel" },
  { cle: "essentiel_creation_lancement", produit: "essentiel_creation", montant: 19500, nom: "Création Essentiel — offre de lancement (moitié prix)" },
  { cle: "pro_creation", produit: "pro_creation", montant: 69000, nom: "Création Pro" },
  { cle: "pro_creation_lancement", produit: "pro_creation", montant: 34500, nom: "Création Pro — offre de lancement (moitié prix)" },
  { cle: "essentiel_mensuel", produit: "essentiel_mensuel", montant: 1900, nom: "Essentiel, par mois", mensuel: true },
  { cle: "pro_mensuel", produit: "pro_mensuel", montant: 3900, nom: "Pro, par mois", mensuel: true },
  { cle: "essentiel_sans_frais", produit: "essentiel_sans_frais", montant: 5500, nom: "Essentiel 0 € de départ, par mois", mensuel: true },
  { cle: "pro_sans_frais", produit: "pro_sans_frais", montant: 9900, nom: "Pro 0 € de départ, par mois", mensuel: true },
] as const;

const LIENS = [
  { cle: "lien_essentiel_creation", prix: "essentiel_creation", titre: "Essentiel — création (à la signature)" },
  { cle: "lien_essentiel_creation_lancement", prix: "essentiel_creation_lancement", titre: "Essentiel — création, offre de lancement" },
  { cle: "lien_pro_creation", prix: "pro_creation", titre: "Pro — création (à la signature)" },
  { cle: "lien_pro_creation_lancement", prix: "pro_creation_lancement", titre: "Pro — création, offre de lancement" },
  { cle: "lien_essentiel_mensuel", prix: "essentiel_mensuel", titre: "Essentiel — abonnement (à la mise en ligne)" },
  { cle: "lien_pro_mensuel", prix: "pro_mensuel", titre: "Pro — abonnement (à la mise en ligne)" },
  { cle: "lien_essentiel_sans_frais", prix: "essentiel_sans_frais", titre: "Essentiel 0 € de départ (à la mise en ligne ; code LANCEMENT possible)", code: true },
  { cle: "lien_pro_sans_frais", prix: "pro_sans_frais", titre: "Pro 0 € de départ (à la mise en ligne ; code LANCEMENT possible)", code: true },
] as const;

async function principal() {
// 1. Produits.
const produitsExistants = await tous("products", { active: true });
const produits: Record<string, string> = {};
for (const p of PRODUITS) {
  const trouve = produitsExistants.find((x) => x.metadata?.cle === p.cle);
  produits[p.cle] = trouve?.id ?? (await stripe<Objet>("POST", "products", {
    name: p.nom, description: p.description, "metadata[cle]": p.cle,
  })).id;
}

// 2. Prix (retrouvés par lookup_key).
const prix: Record<string, string> = {};
for (const x of PRIX) {
  const [trouve] = (await stripe<{ data: Objet[] }>("GET", "prices", { "lookup_keys[]": x.cle, active: true })).data;
  prix[x.cle] = trouve?.id ?? (await stripe<Objet>("POST", "prices", {
    product: produits[x.produit], currency: "eur", unit_amount: x.montant, lookup_key: x.cle, nickname: x.nom,
    ...("mensuel" in x && x.mensuel ? { "recurring[interval]": "month" } : {}),
  })).id;
}

// 3. Offre de lancement « 0 € de départ » : -50 % pendant 3 mois, code LANCEMENT, 5 utilisations au plus.
const coupons = await tous("coupons");
const coupon = coupons.find((c) => c.metadata?.cle === "lancement_3_mois")?.id ?? (await stripe<Objet>("POST", "coupons", {
  percent_off: 50, duration: "repeating", duration_in_months: 3, name: "Lancement : 3 mois à -50 %",
  "applies_to[products][0]": produits.essentiel_sans_frais, "applies_to[products][1]": produits.pro_sans_frais,
  "metadata[cle]": "lancement_3_mois",
})).id;
const codes = await tous("promotion_codes", { code: "LANCEMENT" });
if (!codes.some((c) => c.active)) {
  await stripe("POST", "promotion_codes", { coupon, code: "LANCEMENT", max_redemptions: 5, "metadata[cle]": "lancement_3_mois" });
}

// 4. Liens de paiement (un par cas). Adresse de facturation demandée (facture B2B), facture créée pour les paiements uniques.
const liensExistants = await tous("payment_links", { active: true });
const lignes: string[] = [];
// Mentions obligatoires écrites dans chaque facture de paiement unique (en plus des réglages du compte,
// qui sont propres à chaque environnement Stripe : test et production ont chacun les leurs).
const PIED = "Ambroise Le Clerc EI (Devanture), SIRET 132 043 779 00017. TVA non applicable, art. 293 B du CGI. "
  + "Pénalités de retard : taux BCE + 10 points. Indemnité forfaitaire pour frais de recouvrement : 40 €.";
const facture: Params = {
  "invoice_creation[enabled]": true,
  "invoice_creation[invoice_data][footer]": PIED,
  "invoice_creation[invoice_data][custom_fields][0][name]": "SIRET",
  "invoice_creation[invoice_data][custom_fields][0][value]": "132 043 779 00017",
};
// Case obligatoire « J'accepte les conditions » (lien vers devanture-artisans.fr/cgv), avec trace de l'acceptation.
// Stripe la refuse tant que l'URL des CGV n'est pas renseignée dans Paramètres > Informations publiques.
const CGV: Params = { "consent_collection[terms_of_service]": "required" };
for (const l of LIENS) {
  let lien = liensExistants.find((x) => x.metadata?.cle === l.cle);
  const unique = !l.prix.includes("mensuel") && !l.prix.includes("sans_frais");
  if (!lien) {
    lien = await stripe<Objet>("POST", "payment_links", {
      "line_items[0][price]": prix[l.prix], "line_items[0][quantity]": 1,
      ...CGV,
      billing_address_collection: "required",
      "tax_id_collection[enabled]": false,
      "custom_fields[0][key]": "entreprise", "custom_fields[0][label][type]": "custom",
      "custom_fields[0][label][custom]": "Nom de l'entreprise", "custom_fields[0][type]": "text",
      allow_promotion_codes: "code" in l && l.code,
      "metadata[cle]": l.cle,
      ...(unique ? facture : {}),
      "after_completion[type]": "hosted_confirmation",
      "after_completion[hosted_confirmation][custom_message]":
        "Merci ! Votre paiement est bien reçu. Je reviens vers vous très vite pour la suite. Ambroise, Devanture",
    });
  } else {
    // Lien déjà créé : on lui ajoute la case CGV (29/10) et, pour les paiements uniques, les mentions de facture (28/10).
    // Ces liens ont été créés par l'API : le tableau de bord Stripe ne peut pas les modifier, d'où cette mise à jour ici.
    await stripe<Objet>("POST", `payment_links/${lien.id}`, { ...CGV, ...(unique ? facture : {}) });
  }
  lignes.push(`| ${l.titre} | ${lien.url} |`);
}

const bilan = [
  `## Catalogue Stripe (${mode})`,
  "",
  "Produits, prix et code LANCEMENT en place (rien n'a été créé en double).",
  "",
  "| Lien | Adresse |",
  "| --- | --- |",
  ...lignes,
].join("\n");
console.log(bilan);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${bilan}\n`);
}

try {
  await principal();
} catch (err) {
  const message = (err as Error).message;
  if (/terms.of.service|terms_of_service|public business details/i.test(message)) {
    echec(`${message}\n\nÀ faire : dans Stripe (mode réel), Paramètres > Informations publiques, renseigner « Conditions d'utilisation » = https://devanture-artisans.fr/cgv, enregistrer, puis relancer ce workflow.`);
  }
  echec(message);
}

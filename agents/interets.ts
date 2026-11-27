// =====================================================================
// « Ce site m'intéresse » (13/11) : prévient Broise dès qu'un artisan clique sur le bandeau de sa maquette
// (table maquette_interets, remplie par /m/<slug>/interet). Étape du workflow d'Inès (agent-boite.yml), réveillé
// par la maquette elle-même au moment du clic.
// L'alerte part par Resend (e-mail de service) vers ALERTE_A (par défaut ambroise@devanture-artisans.fr, donc boîte
// mail du tableau de bord + copie Gmail) ; Inès la reconnaît (expéditeur alertes@…) et ne la traite pas comme un artisan.
// Secrets : SUPABASE_DB_URL, RESEND_API_KEY, EMAIL_FROM.
// =====================================================================
import { connecter } from "./lib/db.ts";
import { http, SIMULATION } from "./lib/http.ts";

export const EXPEDITEUR_ALERTES = "alertes";

interface Interet {
  id: string;
  cree_le: Date;
  telephone: string | null;
  message: string | null;
  style: string | null;
  appareil: string | null;
  nom: string | null;
  ville: string | null;
  metier: string | null;
  email: string | null;
  slug: string | null;
}

function domaineEnvoi(): string | null {
  const m = /@([a-z0-9.-]+)>?\s*$/i.exec(process.env.EMAIL_FROM ?? "");
  return m ? m[1].toLowerCase() : null;
}

async function main() {
  const sql = connecter();
  try {
    let liste: Interet[];
    try {
      liste = await sql<Interet[]>`
        select i.id, i.cree_le, i.telephone, i.message, i.style, i.appareil,
               p.name as nom, p.city as ville, p.category as metier, p.email, w.slug
        from public.maquette_interets i
        left join public.prospects p on p.id = i.prospect_id
        left join public.websites w on w.id = i.website_id
        where i.notifie_le is null order by i.cree_le limit 20`;
    } catch (err) {
      console.log(`Intérêts pas encore lisibles (migration 20261113030000 ?) : ${(err as Error).message}`);
      return;
    }
    // 27/11 (demande de Broise) : un clic sur « Ce site m'intéresse » rend le prospect « intéressé », même s'il n'a jamais
    // écrit (avant, seul un e-mail d'intérêt le faisait). Rejouable : rattrape aussi les clics passés.
    const passes = await sql`update public.prospects p set status = 'interesse'
      from public.maquette_interets i
      where i.prospect_id = p.id and p.status not in ('interesse', 'client', 'refuse', 'ecarte') returning p.id`;
    if (passes.length) console.log(`${passes.length} prospect(s) passé(s) « intéressé » après un clic sur leur maquette.`);
    if (!liste.length) {
      console.log("Aucun nouvel artisan intéressé.");
      return;
    }
    const cle = process.env.RESEND_API_KEY;
    const domaine = domaineEnvoi();
    if (!cle || !domaine) {
      console.log(`::warning title=Artisan intéressé::${liste.length} artisan(s) intéressé(s), mais l'alerte e-mail n'est pas branchée (RESEND_API_KEY / EMAIL_FROM). Voir la vue d'ensemble.`);
      return;
    }
    const dest = process.env.ALERTE_A?.trim() || "ambroise@devanture-artisans.fr";
    for (const i of liste) {
      const quand = i.cree_le.toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "full", timeStyle: "short" });
      const texte = [
        `${i.nom ?? "Un artisan"}${i.ville ? ` (${i.ville})` : ""} a cliqué sur « Oui, ça m'intéresse » sur sa maquette, le ${quand}.`,
        "",
        `Métier : ${i.metier ?? "?"}`,
        `Téléphone laissé : ${i.telephone ?? "aucun"}`,
        `Son mot : ${i.message ?? "aucun"}`,
        `Style regardé : ${i.style === "chaleureux" ? "chaleureux (style 1)" : "sobre (style 2)"} · ${i.appareil === "telephone" ? "sur téléphone" : "sur ordinateur"}`,
        `Son adresse e-mail : ${i.email ?? "?"}`,
        i.slug ? `Sa maquette : https://app.devanture-artisans.fr/m/${i.slug}?apercu=1` : "",
        "",
        i.telephone ? "Il attend ton appel : rappelle-le vite." : "Il n'a pas laissé de numéro : réponds-lui par e-mail depuis la boîte mail du tableau de bord (fil de son e-mail de prospection).",
        "Tableau de bord : https://app.devanture-artisans.fr/",
      ].filter((l) => l !== "").join("\n");
      const res = await http("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `Devanture (alerte) <${EXPEDITEUR_ALERTES}@${domaine}>`,
          to: [dest],
          subject: `Artisan intéressé : ${i.nom ?? "?"}${i.telephone ? " (a laissé son numéro)" : ""}`,
          text: texte,
        }),
      }, 20_000);
      if (res.ok) {
        await sql`update public.maquette_interets set notifie_le = now() where id = ${i.id}`;
        console.log(`::notice title=Artisan intéressé::${i.nom ?? "?"} : Broise prévenu.`);
      } else {
        console.log(`::error title=Artisan intéressé::alerte non envoyée (${res.status}) ${(await res.text()).slice(0, 200)}`);
      }
    }
    if (SIMULATION) console.log("(simulation)");
  } finally {
    await sql.end();
  }
}

await main();

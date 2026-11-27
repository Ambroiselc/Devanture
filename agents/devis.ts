// =====================================================================
// Transmission des demandes de devis des sites clients (Pedro, 30/10)
//
// Le formulaire d'un site client dépose la demande dans « demandes_devis » (via /api/devis) et réveille ce
// workflow (Inès, agent-boite.yml). Ici, chaque demande « à transmettre » part par e-mail à l'artisan (Resend :
// e-mail de service, pas de prospection), avec « Répondre » vers la personne qui a écrit si elle a laissé son e-mail.
// Nettoyage : les demandes de plus de 3 ans sont effacées (registre RGPD).
// Secrets : SUPABASE_DB_URL, RESEND_API_KEY, EMAIL_FROM (on garde son domaine d'envoi).
// =====================================================================
import { connecter } from "./lib/db.ts";
import { http, SIMULATION } from "./lib/http.ts";

interface Demande {
  id: string;
  nom: string | null;
  telephone: string | null;
  email: string | null;
  commune: string | null;
  message: string;
  created_at: Date;
  entreprise: string;
  destinataire: string | null;
  url: string | null;
  template: string | null;
}

/** « Ambroise <ambroise@mail.devanture-artisans.fr> » → « mail.devanture-artisans.fr ». */
function domaineEnvoi(): string | null {
  const m = /@([a-z0-9.-]+)>?\s*$/i.exec(process.env.EMAIL_FROM ?? "");
  return m ? m[1].toLowerCase() : null;
}

async function main() {
  const sql = connecter();
  try {
    await sql`delete from public.demandes_devis where created_at < now() - interval '3 years'`;
    const demandes = await sql<Demande[]>`
      select d.id, d.nom, d.telephone, d.email, d.commune, d.message, d.created_at,
             p.name as entreprise, p.email as destinataire, w.url, w.template
      from public.demandes_devis d
      join public.websites w on w.id = d.website_id
      join public.prospects p on p.id = w.prospect_id
      where d.statut = 'a_transmettre' order by d.created_at limit 50`;
    if (!demandes.length) {
      console.log("Aucune demande de devis à transmettre.");
      return;
    }
    const cle = process.env.RESEND_API_KEY;
    const domaine = domaineEnvoi();
    if (!cle || !domaine) {
      console.log("Transmission des devis pas encore branchée (RESEND_API_KEY / EMAIL_FROM).");
      return;
    }
    let envoyees = 0;
    for (const d of demandes) {
      if (!d.destinataire) {
        await sql`update public.demandes_devis set statut = 'erreur', erreur = 'Pas d''adresse e-mail sur la fiche du client.' where id = ${d.id}`;
        continue;
      }
      const quand = d.created_at.toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "full", timeStyle: "short" });
      // 27/11 : sur le site d'un photographe ou d'un coach, c'est un message de contact, pas une demande de devis.
      const quoi = d.template === "site-independant" ? "Nouveau message" : "Nouvelle demande de devis";
      const texte = [
        "Bonjour,",
        "",
        `${quoi} reçu${d.template === "site-independant" ? "" : "e"} sur votre site${d.url ? ` (${d.url})` : ""}, le ${quand}.`,
        "",
        `Nom : ${d.nom ?? "non indiqué"}`,
        `Téléphone : ${d.telephone ?? "non indiqué"}`,
        `E-mail : ${d.email ?? "non indiqué"}`,
        `Commune : ${d.commune ?? "non indiquée"}`,
        "",
        "Sa demande :",
        d.message,
        "",
        d.email ? "Pour lui répondre, répondez simplement à cet e-mail." : "Pour lui répondre, rappelez-le au numéro ci-dessus.",
        "",
        "Ambroise, Devanture (votre site web)",
      ].join("\n");
      const res = await http("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${d.entreprise.replace(/[<>"]/g, "").slice(0, 60)} (site web) <devis@${domaine}>`,
          to: [d.destinataire],
          ...(d.email ? { reply_to: d.email } : {}),
          subject: `${d.template === "site-independant" ? "Message" : "Demande de devis"}${d.nom ? ` de ${d.nom}` : ""}${d.commune ? ` (${d.commune})` : ""}`,
          text: texte,
        }),
      }, 20_000);
      if (res.ok) {
        envoyees++;
        await sql`update public.demandes_devis set statut = 'transmis', transmis_le = now(), erreur = null where id = ${d.id}`;
      } else {
        const erreur = `Resend ${res.status} : ${(await res.text()).slice(0, 200)}`;
        console.error(erreur);
        await sql`update public.demandes_devis set statut = 'erreur', erreur = ${erreur} where id = ${d.id}`;
      }
    }
    console.log(`Demandes de devis transmises : ${envoyees} sur ${demandes.length}${SIMULATION ? " (simulation)" : ""}.`);
  } finally {
    await sql.end();
  }
}

await main();

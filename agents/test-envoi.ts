// =====================================================================
// Envoi de TEST : écrit un e-mail de prospection à une personne de confiance, comme Valérie,
// pour vérifier toute la chaîne (Resend → réponse → Worker boite-mail → Inès → page /boite).
//
// Lancement : modifier tests/envoi-test.json puis l'envoyer sur GitHub (workflow test-envoi.yml),
// ou GitHub > Actions > « Test d'envoi » > Run workflow.
// Le destinataire est créé (ou retrouvé) comme prospect, avec la mention « Test interne » dans ses notes.
// Un seul envoi par adresse et par jour, même si le fichier est renvoyé plusieurs fois.
// =====================================================================
import { readFileSync } from "node:fs";
import { connecter } from "./lib/db.ts";
import { http, SIMULATION } from "./lib/http.ts";
import { adresseReponse } from "./lib/boite.ts";

interface Test {
  envoyer: boolean;
  /** Numéro d'essai : le changer permet de renvoyer un test le même jour. */
  essai?: number;
  email: string;
  entreprise: string;
  metier: string;
  commune: string;
  objet: string;
  texte: string;
}

const t = JSON.parse(readFileSync(process.argv[2] ?? "tests/envoi-test.json", "utf8")) as Test;
if (!t.envoyer) {
  console.log("« envoyer » est à false dans le fichier de test : rien à faire.");
  process.exit(0);
}

const cle = process.env.RESEND_API_KEY;
const expediteur = process.env.EMAIL_FROM;
const repondreA = process.env.EMAIL_REPLY_TO || "ambroise@devanture-artisans.fr";
const lien = process.env.DEMO_BASE_URL?.replace(/\/+$/, "") || "https://devanture-site.ambroiseleclerc63.workers.dev";
const manquants = [!cle && "RESEND_API_KEY", !expediteur && "EMAIL_FROM"].filter(Boolean);
if (manquants.length) {
  console.error(`Il manque les secrets GitHub : ${manquants.join(", ")}.`);
  process.exit(1);
}

const sql = connecter();
try {
  // 18/11 (dépôt public) : adresse vide dans le fichier = secret GitHub ADRESSE_TEST.
  const email = (t.email.trim() || process.env.ADRESSE_TEST || "").trim().toLowerCase();
  if (!email) throw new Error("Adresse de test vide : mets-la dans le fichier ou dans le secret GitHub ADRESSE_TEST.");
  const [{ oppose }] = await sql<{ oppose: boolean }[]>`select public.is_opposed(${email}) as oppose`;
  if (oppose) throw new Error(`${email} est sur la liste d'opposition : envoi refusé.`);

  // Prospect de test (créé une fois, retrouvé ensuite).
  let [p] = await sql<{ id: string }[]>`select id from public.prospects where lower(email) = ${email} limit 1`;
  if (!p) {
    [p] = await sql<{ id: string }[]>`
      insert into public.prospects (name, category, city, email, source, status, notes, is_demo)
      values (${t.entreprise}, ${t.metier}, ${t.commune}, ${email}, 'Test interne', 'contacte',
              'Test interne de la boîte mail (pas un vrai prospect).', ${SIMULATION})
      returning id`;
  }

  const [deja] = await sql<{ n: number }[]>`
    select count(*)::int as n from public.emails where prospect_id = ${p.id} and status in ('envoye', 'repondu')
      and sent_at > now() - interval '1 day'`;
  if (deja.n >= (t.essai ?? 1)) {
    console.log("Un e-mail de test est déjà parti vers cette adresse aujourd'hui : rien de plus.");
  } else {
    const texte = t.texte.replaceAll("{{lien_demo}}", lien);
    const res = await http("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: expediteur,
        to: [email],
        reply_to: adresseReponse(repondreA, p.id),
        subject: t.objet,
        text: texte,
        headers: { "List-Unsubscribe": `<mailto:${repondreA}?subject=STOP>` },
      }),
    }, 30_000);
    if (!res.ok) throw new Error(`Resend : erreur ${res.status} ${(await res.text()).slice(0, 300)}`);
    const { id } = (await res.json()) as { id: string };
    // Les mises à jour qui suivent ne doivent pas bloquer : l'e-mail est parti.
    await sql`delete from public.emails where prospect_id = ${p.id} and status in ('brouillon', 'a_valider', 'valide')`;
    try {
      await sql`insert into public.emails (prospect_id, subject, body, status, sent_at, provider_id, delivery_status, is_demo)
                values (${p.id}, ${t.objet}, ${t.texte}, 'envoye', now(), ${id}, 'sent', ${SIMULATION})`;
    } catch {
      // Migration « envoi » pas encore lancée (colonnes provider_id / delivery_status absentes).
      await sql`insert into public.emails (prospect_id, subject, body, status, sent_at, is_demo)
                values (${p.id}, ${t.objet}, ${t.texte}, 'envoye', now(), ${SIMULATION})`;
    }
    console.log(`E-mail de test envoyé à ${email} (Resend ${id}). Réponses attendues sur ${adresseReponse(repondreA, p.id)}.`);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}

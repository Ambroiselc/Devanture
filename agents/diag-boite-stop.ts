// Diagnostic en lecture seule (27/11) : messages reçus des 3 derniers jours, leur rangement, et si Inès les reconnaît
// comme STOP / retrouve le prospect. « boite-stop » en 1re ligne de tests/compteur.txt. Sortie masquée (dépôt public).
import { connecter } from "./lib/db.ts";
import { demandeStop, prospectDepuisAdresse } from "./lib/boite.ts";

const sql = connecter();
try {
  const lignes = await sql<{ id: string; status: string; category: string | null; created_at: Date; subject: string; body_text: string;
    prospect_id: string | null; to_email: string | null; in_reply_to: string | null; references_ids: string | null; from_email: string | null }[]>`
    select id, status, category, created_at, subject, body_text, prospect_id, to_email, in_reply_to, references_ids, from_email
    from public.mailbox_messages where direction = 'entrant' and created_at > now() - interval '3 days' order by created_at desc limit 40`;
  for (const m of lignes) {
    const refs = [m.in_reply_to, ...(m.references_ids ?? "").split(/\s+/)].map((x) => (x ?? "").replace(/[<>\s]/g, "")).filter(Boolean);
    const [parFil] = refs.length ? await sql<{ id: string; status: string }[]>`
      select p.id, p.status from public.emails e join public.prospects p on p.id = e.prospect_id
      where e.provider_id is not null and replace(replace(e.provider_id, '<', ''), '>', '') = any(${refs}) limit 1` : [];
    const [parSujet] = await sql<{ n: number }[]>`select count(*)::int as n from public.emails
      where subject = regexp_replace(${m.subject ?? ""}, '^(re|tr|fwd?)\\s*:\\s*', '', 'i')`;
    console.log([m.id, m.created_at.toISOString().slice(0, 16), `statut=${m.status}`, `cat=${m.category}`, `stop=${demandeStop(m.subject ?? "", m.body_text ?? "")}`,
      `prospect=${m.prospect_id ? "oui" : "non"}`, `etiquette=${prospectDepuisAdresse(m.to_email) ? "oui" : "non"}`, `refs=${refs.length}`,
      `parFil=${parFil ? parFil.status : "non"}`, `memeSujet=${parSujet.n}`].join(" · "));
  }
} finally {
  await sql.end();
}

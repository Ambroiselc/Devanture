// 13/11, EN LECTURE SEULE : 4 e-mails en version C (objet, texte sans les mentions) et l'avancement de la réécriture B → C.
import { connecter } from "./lib/db.ts";
const sql = connecter();
try {
  const etat = await sql<{ variant: string; status: string; n: number }[]>`select coalesce(variant, '?') variant, status, count(*)::int n
    from public.emails where sent_at is null and relance_de is null and status in ('a_valider', 'valide') group by 1, 2 order by 1, 2`;
  for (const e of etat) console.log(`en attente | version ${e.variant} | ${e.status} | ${e.n}`);
  const ex = await sql<{ subject: string; body: string; coco_verdict: string | null }[]>`select subject, body, coco_verdict from public.emails
    where variant = 'C' and relance_de is null order by updated_at desc nulls last limit 4`;
  for (const e of ex) {
    const texte = e.body.split("\n—")[0].split("\nBien cordialement")[0].trim();
    console.log(`\n--- Objet : ${e.subject} (Coco : ${e.coco_verdict ?? "pas encore relu"}, ${texte.split(/\s+/).length} mots)\n${texte}`);
  }
} finally { await sql.end(); }

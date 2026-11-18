// =====================================================================
// Contrôle anti-spam hebdomadaire (27/10) — l'équivalent automatique de mail-tester.com.
//
// Chaque lundi matin (workflow controle-spam.yml), sans rien envoyer à personne :
//   1. reconstruit les deux derniers vrais e-mails de Valérie (un avec l'image de la maquette, un sans),
//      exactement comme ils partent (texte + HTML + image, agents/lib/email-html.ts) ;
//   2. les fait noter par SpamAssassin, le filtre utilisé par mail-tester (note sur 10 = 10 − points de spam) ;
//   3. vérifie les réglages du domaine : DMARC, signature DKIM de Resend, SPF ;
//   4. cherche le domaine sur les listes noires publiques (Spamhaus DBL, SURBL).
// Le résultat est une tâche « Contrôle anti-spam » (page Tâches) ; en cas de problème, elle est « échouée » et
// apparaît en « À faire » dans la vue d'ensemble.
// =====================================================================
import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { promises as dns } from "node:dns";
import { connecter } from "./lib/db.ts";
import { SIMULATION } from "./lib/http.ts";
import { LIEN_DEMO, remplacerSignature } from "./lib/redaction-email.ts";
import { versHtml } from "./lib/email-html.ts";
import { lireBoites } from "./lib/boites-envoi.ts";

const DOMAINE = "devanture-artisans.fr";
const DOMAINE_ENVOI = "mail.devanture-artisans.fr";
const NOTE_MINIMALE = 8.5;

interface Mail { id: string; subject: string; body: string; with_image: boolean | null; name: string; slug: string; website_id: string }

/** Message au format brut (MIME), comme le reçoit un serveur de messagerie. */
function mime(m: Mail, texte: string, html: string, image: Buffer | null, expediteur: string): string {
  const b64 = (s: string | Buffer) => (typeof s === "string" ? Buffer.from(s, "utf8") : s).toString("base64").replace(/.{76}/g, "$&\r\n");
  const objet = `=?UTF-8?B?${Buffer.from(m.subject, "utf8").toString("base64")}?=`;
  const alt = "alt-" + m.id.slice(0, 8);
  const rel = "rel-" + m.id.slice(0, 8);
  const partieAlt = [
    `Content-Type: multipart/alternative; boundary="${alt}"`, "",
    `--${alt}`, "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "", b64(texte),
    `--${alt}`, "Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: base64", "", b64(`<!doctype html><html><body>${html}</body></html>`),
    `--${alt}--`,
  ].join("\r\n");
  const corps = image
    ? [`Content-Type: multipart/related; boundary="${rel}"`, "", `--${rel}`, partieAlt, `--${rel}`,
        "Content-Type: image/jpeg; name=\"maquettes.jpg\"", "Content-Transfer-Encoding: base64", "Content-ID: <maquette>",
        "Content-Disposition: inline; filename=\"maquettes.jpg\"", "", b64(image), `--${rel}--`].join("\r\n")
    : partieAlt;
  // En-têtes d'un e-mail réellement reçu : une ligne « Received » comme celle ajoutée par le serveur de Resend
  // (Amazon SES), et le destinataire entre chevrons. Sans eux, SpamAssassin compte des règles qui n'existent pas
  // sur les vrais e-mails (NO_RECEIVED, NO_RELAYS, TO_NO_BRKTS_HTML_IMG : 1er contrôle du 27/10).
  const date = new Date().toUTCString();
  return [
    `Received: from a8-30.smtp-out.amazonses.com (a8-30.smtp-out.amazonses.com [54.240.8.30]) by mx.example.com with ESMTPS id controle; ${date}`,
    `From: ${expediteur}`, "To: <artisan@example.com>", `Subject: ${objet}`, `Date: ${date}`,
    `Message-ID: <controle-${m.id}@${DOMAINE_ENVOI}>`, "MIME-Version: 1.0",
    `List-Unsubscribe: <mailto:ambroise@${DOMAINE}?subject=STOP>`, corps,
  ].join("\r\n");
}

/** Note SpamAssassin d'un message : points de spam (plus c'est haut, pire c'est) et règles déclenchées. */
function spamassassin(brut: string): { points: number; regles: string[] } {
  const dir = mkdtempSync(join(tmpdir(), "spam-"));
  const fichier = join(dir, "message.eml");
  writeFileSync(fichier, brut);
  // -t : ajoute le rapport détaillé. Tests réseau ACTIVÉS (pas de -L) : SpamAssassin utilise alors le même barème
  // que mail-tester (en mode « hors ligne », HTML_IMAGE_ONLY_20 coûtait 2,1 points au lieu de 0,7 : 27/10).
  // Les règles DMARC, DKIM et SPF ne comptent pas : le message reconstruit n'a pas la signature DKIM que Resend
  // ajoute à l'envoi, SpamAssassin y verrait donc un faux échec (DMARC_NONE puis DMARC_QUAR le 27/10). Ces réglages
  // sont vérifiés à part, directement dans le DNS (étape 3).
  const ignorer = ["DMARC_NONE", "DMARC_QUAR", "DMARC_REJECT", "DMARC_MISSING", "SPF_HELO_NONE", "SPF_NONE", "SPF_FAIL",
    "SPF_SOFTFAIL", "DKIM_ADSP_NXDOMAIN", "DKIM_ADSP_ALL", "DKIM_ADSP_DISCARD"];
  const options = ["-t", ...ignorer.flatMap((r) => ["--cf", `score ${r} 0`])];
  const r = spawnSync("spamassassin", options, { input: brut, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 120_000 });
  if (r.error || r.status === null) throw new Error(`SpamAssassin introuvable ou planté : ${r.error?.message ?? r.stderr}`);
  const statut = /X-Spam-Status:[^\n]*score=(-?\d+(?:\.\d+)?)[\s\S]*?tests=([^\n]*(?:\n\s+[^\n]*)*)/i.exec(r.stdout);
  if (!statut) throw new Error("Réponse de SpamAssassin illisible.");
  const regles = statut[2].replace(/\s+/g, "").replace(/autolearn=.*$/i, "").split(",").filter(Boolean)
    .filter((x) => !ignorer.includes(x));
  return { points: Number(statut[1]), regles };
}

async function txt(nom: string): Promise<string[]> {
  try { return (await dns.resolveTxt(nom)).map((t) => t.join("")); } catch { return []; }
}

/** Domaine sur une liste noire ? « inconnu » si la liste refuse de répondre (cas des serveurs DNS publics). */
async function listeNoire(domaine: string, zone: string): Promise<"non" | "oui" | "inconnu"> {
  try {
    const ips = await dns.resolve4(`${domaine}.${zone}`);
    if (ips.some((ip) => ip.startsWith("127.255.255.") || ip === "127.0.0.1")) return "inconnu";
    return ips.some((ip) => ip.startsWith("127.")) ? "oui" : "inconnu";
  } catch (e) {
    return (e as { code?: string }).code === "ENOTFOUND" ? "non" : "inconnu";
  }
}

const sql = connecter();
const problemes: string[] = [];
const resultats: Record<string, unknown> = {};
let taskId: string | null = null;
try {
  const [tache] = await sql<{ id: string }[]>`
    insert into public.tasks (agent, title, status, input, attempts, started_at, is_demo)
    values ('email', 'Contrôle anti-spam', 'en_cours', ${sql.json({ controle_spam: true })}, 1, now(), ${SIMULATION})
    returning id`;
  taskId = tache.id;
  const [r] = await sql<{ signature: string | null }[]>`select signature from public.agent_settings where agent = 'email'`;
  const base = process.env.DEMO_BASE_URL?.replace(/\/+$/, "") || `https://app.${DOMAINE}/m`;
  const expediteur = process.env.EMAIL_FROM || `Ambroise de Devanture <ambroise@${DOMAINE_ENVOI}>`;

  // 1-2. Les deux derniers e-mails partis : un avec image, un sans (à défaut, un e-mail validé).
  const notes: string[] = [];
  for (const avecImage of [true, false]) {
    const [m] = await sql<Mail[]>`
      select e.id, e.subject, e.body, e.with_image, p.name, w.slug, w.id as website_id
      from public.emails e join public.prospects p on p.id = e.prospect_id join public.websites w on w.id = e.website_id
      where e.status in ('envoye', 'repondu', 'valide') and w.slug is not null and coalesce(e.with_image, false) = ${avecImage}
      order by (e.status <> 'valide') desc, e.sent_at desc nulls last, e.updated_at desc limit 1`;
    if (!m) continue;
    const lien = `${base}/${m.slug}`;
    const texte = remplacerSignature(m.body, r?.signature ?? "").replaceAll(LIEN_DEMO, lien);
    let image: Buffer | null = null;
    if (avecImage) {
      const [c] = await sql<{ image: Buffer }[]>`select image from public.website_captures where website_id = ${m.website_id}
        order by (style = 'duo') desc, (style = 'pro') desc limit 1`;
      image = c ? Buffer.from(c.image) : null;
    }
    const sa = spamassassin(mime(m, texte, versHtml(texte, lien, Boolean(image)), image, expediteur));
    const note = Math.round(Math.max(0, Math.min(10, 10 - sa.points)) * 10) / 10;
    const cle = avecImage ? "avec_image" : "sans_image";
    resultats[cle] = { note, points: sa.points, regles: sa.regles, email_id: m.id, prospect: m.name };
    notes.push(`${note.toFixed(1).replace(".", ",")}/10 ${avecImage ? "avec image" : "sans image"}`);
    if (note < NOTE_MINIMALE) problemes.push(`note ${note.toFixed(1).replace(".", ",")}/10 ${avecImage ? "avec" : "sans"} image (règles : ${sa.regles.join(", ")})`);
  }
  if (notes.length === 0) problemes.push("aucun e-mail envoyé ou validé à tester");

  // 3. Réglages du domaine.
  const dmarc = (await txt(`_dmarc.${DOMAINE}`)).find((t) => t.startsWith("v=DMARC1"));
  const dkim = (await txt(`resend._domainkey.${DOMAINE_ENVOI}`)).find((t) => /p=/.test(t));
  const spf = [...await txt(`send.${DOMAINE_ENVOI}`), ...await txt(DOMAINE_ENVOI)].find((t) => t.startsWith("v=spf1"));
  resultats.dns = { dmarc: dmarc ?? null, dkim: Boolean(dkim), spf: spf ?? null };
  if (!dmarc) problemes.push("enregistrement DMARC introuvable");
  if (!dkim) problemes.push("signature DKIM de Resend introuvable");
  if (!spf) problemes.push("enregistrement SPF introuvable");

  // 3 bis. Domaines des boîtes de prospection (28/10, secret BOITES_ENVOI ; seules les adresses sont lues).
  const domainesBoites = [...new Set(lireBoites(process.env.BOITES_ENVOI).map((b) => b.adresse.split("@")[1]))];
  const dnsBoites: Record<string, unknown> = {};
  for (const d of domainesBoites) {
    const dm = (await txt(`_dmarc.${d}`)).find((t) => t.startsWith("v=DMARC1"));
    const dk = (await txt(`google._domainkey.${d}`)).find((t) => /p=/.test(t));
    const sp = (await txt(d)).find((t) => t.startsWith("v=spf1"));
    dnsBoites[d] = { dmarc: dm ?? null, dkim: Boolean(dk), spf: sp ?? null };
    if (!dm) problemes.push(`${d} : enregistrement DMARC introuvable`);
    if (!dk) problemes.push(`${d} : signature DKIM de Google introuvable`);
    if (!sp) problemes.push(`${d} : enregistrement SPF introuvable`);
    else if (!sp.includes("_spf.google.com")) problemes.push(`${d} : SPF sans Google (include:_spf.google.com introuvable)`);
  }
  if (domainesBoites.length) resultats.dns_boites = dnsBoites;

  // 4. Listes noires.
  const listes: Record<string, string> = {};
  for (const [nom, zone] of [["Spamhaus DBL", "dbl.spamhaus.org"], ["SURBL", "multi.surbl.org"]]) {
    for (const d of [DOMAINE, DOMAINE_ENVOI, ...domainesBoites]) {
      const etat = await listeNoire(d, zone);
      listes[`${nom} · ${d}`] = etat;
      if (etat === "oui") problemes.push(`${d} est sur la liste noire ${nom}`);
    }
  }
  resultats.listes_noires = listes;

  const titre = `Contrôle anti-spam : ${notes.join(" · ") || "rien à tester"}`;
  if (problemes.length) {
    const message = `Contrôle anti-spam : ${problemes.join(" ; ")}.`;
    for (const p of problemes) {
      await sql`insert into public.task_events (task_id, level, message, is_demo) values (${taskId}, 'error', ${`Contrôle anti-spam : ${p}`}, ${SIMULATION})`;
    }
    await sql`update public.tasks set title = ${titre}, status = 'echouee', finished_at = now(), error_message = ${message},
              output = ${sql.json(resultats as never)} where id = ${taskId}`;
  } else {
    await sql`update public.tasks set title = ${titre}, status = 'terminee', finished_at = now(),
              output = ${sql.json(resultats as never)} where id = ${taskId}`;
  }
  const resume = [`## ${titre}`, "", problemes.length ? `**À regarder :** ${problemes.join(" ; ")}` : "Tout est en ordre.",
    "", "```json", JSON.stringify(resultats, null, 2), "```"].join("\n");
  console.log(resume);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${resume}\n`);
} catch (err) {
  const message = (err as Error).message;
  console.error(message);
  if (taskId) await sql`update public.tasks set status = 'echouee', finished_at = now(), error_message = ${`Contrôle anti-spam impossible : ${message}`} where id = ${taskId}`;
  process.exitCode = 1;
} finally {
  await sql.end();
}

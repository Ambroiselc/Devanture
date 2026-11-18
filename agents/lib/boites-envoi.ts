// Boîtes d'envoi de la prospection (28/10) : de vraies boîtes mail (Google Workspace) sur des domaines
// réservés à la prospection (ex. devanture-web.fr), à la place de Resend dont les conditions interdisent
// la prospection à froid. Resend ne sert plus qu'aux réponses d'Inès (l'artisan a écrit en premier).
//
// Secret GitHub BOITES_ENVOI : une boîte par ligne, « adresse mot-de-passe-d'application [serveur] » :
//   ambroise@devanture-web.fr abcd efgh ijkl mnop
//   a.leclerc@devanture-web.fr qrst uvwx yzab cdef
// (serveur facultatif : smtp.gmail.com par défaut ; le serveur IMAP est déduit : smtp.x → imap.x)
//
// Relève (releverBoites) : lit les messages non lus de chaque boîte.
//   • rebond (« Delivery Status Notification ») → e-mail marqué « bounced », adresse sur la liste d'opposition ;
//   • tout autre message (un artisan qui répond à l'expéditeur au lieu de l'adresse de réponse) → boîte mail
//     d'Inès (mailbox_messages, « nouveau »), comme s'il était arrivé sur devanture-artisans.fr.
import nodemailer, { type Transporter } from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import type { Sql } from "./db.ts";
import { SIMULATION } from "./http.ts";

export interface Boite {
  adresse: string;
  motDePasse: string;
  smtp: string;
  imap: string;
}

/** Lit le secret BOITES_ENVOI. Lignes vides et commentaires (#) ignorés ; une ligne mal formée = erreur claire. */
export function lireBoites(secret: string | undefined): Boite[] {
  if (!secret?.trim()) return [];
  return secret.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((ligne, i) => {
    const mots = ligne.split(/\s+/);
    const adresse = mots.shift()!.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(adresse)) throw new Error(`BOITES_ENVOI, ligne ${i + 1} : « ${adresse} » n'est pas une adresse e-mail.`);
    const serveur = mots.length > 1 && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(mots.at(-1)!) && mots.at(-1)!.includes("smtp") ? mots.pop()! : "smtp.gmail.com";
    const motDePasse = mots.join("");
    if (motDePasse.length < 8) throw new Error(`BOITES_ENVOI, ligne ${i + 1} (${adresse}) : mot de passe d'application manquant.`);
    return { adresse, motDePasse, smtp: serveur, imap: serveur.replace(/^smtp\./, "imap.") };
  });
}

export interface Message {
  de: string;            // « Ambroise de Devanture <ambroise@devanture-web.fr> »
  a: string;
  repondreA?: string | null;
  objet: string;
  texte: string;
  html: string;
  image?: { contenu: Buffer; type: string } | null;
  entetes?: Record<string, string>;
}

const transports = new Map<string, Transporter>();

/** Envoie un e-mail depuis une boîte (SMTP). Renvoie le Message-ID. */
export async function envoyerDepuis(b: Boite, m: Message): Promise<string> {
  if (SIMULATION) return `<simulation-${Date.now()}@${b.adresse.split("@")[1]}>`;
  let t = transports.get(b.adresse);
  if (!t) {
    t = nodemailer.createTransport({ host: b.smtp, port: 465, secure: true, auth: { user: b.adresse, pass: b.motDePasse } });
    transports.set(b.adresse, t);
  }
  const info = await t.sendMail({
    from: m.de,
    to: m.a,
    ...(m.repondreA ? { replyTo: m.repondreA } : {}),
    subject: m.objet,
    text: m.texte,
    html: m.html,
    headers: m.entetes ?? {},
    attachments: m.image ? [{ filename: "maquettes.jpg", content: m.image.contenu, contentType: m.image.type, cid: "maquette" }] : [],
  });
  if (info.rejected?.length) throw new Error(`refusé par le serveur d'envoi (${b.adresse})`);
  return info.messageId;
}

export function fermerTransports() {
  for (const t of transports.values()) t.close();
  transports.clear();
}

/** « Ambroise de Devanture <x@y> » → même nom, autre adresse. */
export function expediteurPour(emailFrom: string | undefined, adresse: string): string {
  const nom = emailFrom?.match(/^\s*"?([^"<]+?)"?\s*</)?.[1]?.trim() || "Ambroise de Devanture";
  return `${nom} <${adresse}>`;
}

const adresses = (a: AddressObject | AddressObject[] | undefined) =>
  (Array.isArray(a) ? a : a ? [a] : []).flatMap((x) => x.value.map((v) => v.address?.toLowerCase()).filter(Boolean) as string[]);

export interface Releve { boites: number; rebonds: number; recus: number; erreurs: string[] }

/** Lit les messages non lus de chaque boîte (voir en tête du fichier). Ne s'arrête jamais sur une boîte en panne. */
export async function releverBoites(sql: Sql, boites: Boite[]): Promise<Releve> {
  const r: Releve = { boites: 0, rebonds: 0, recus: 0, erreurs: [] };
  if (SIMULATION) return r;
  for (const b of boites) {
    const client = new ImapFlow({ host: b.imap, port: 993, secure: true, auth: { user: b.adresse, pass: b.motDePasse }, logger: false });
    try {
      await client.connect();
      const verrou = await client.getMailboxLock("INBOX");
      try {
        const uids = (await client.search({ seen: false }, { uid: true })) || [];
        for (const uid of uids.slice(0, 200)) {
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!msg || !msg.source) continue;
          const mail = await simpleParser(msg.source);
          const de = adresses(mail.from)[0] ?? "";
          const sujet = mail.subject ?? "";
          const echec = String(mail.headers.get("x-failed-recipients") ?? "").toLowerCase()
            || (/mailer-daemon|postmaster/.test(de) || /delivery status notification|undeliver|non remis|échec de la remise/i.test(sujet)
              ? (String(mail.text ?? "").match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? []).map((x) => x.toLowerCase()).find((x) => x !== b.adresse && !/mailer-daemon|postmaster|google/.test(x)) ?? ""
              : "");
          if (/mailer-daemon|postmaster/.test(de) || mail.headers.has("x-failed-recipients")) {
            if (echec) {
              const [e] = await sql<{ id: string; name: string }[]>`
                select e.id, p.name from public.emails e join public.prospects p on p.id = e.prospect_id
                where lower(p.email) = ${echec} and e.sent_at is not null order by e.sent_at desc limit 1`;
              if (e) {
                await sql`update public.emails set delivery_status = 'bounced', delivery_checked_at = now() where id = ${e.id}`;
                await sql`insert into public.opposition_list (email, business_name, reason, notes, is_demo)
                          values (${echec}, ${e.name}, 'adresse_invalide', ${`Rebond à l'envoi (${b.adresse}).`}, false)
                          on conflict do nothing`;
                r.rebonds++;
              }
            }
          } else {
            // 9/11 : les e-mails de prospection donnent pour réponse la boîte elle-même avec l'étiquette du prospect
            // (a.leclerc+p-<id>@…) : on garde cette adresse pour qu'Inès sache qui répond (prospectDepuisAdresse).
            const etiquetee = [...adresses(mail.to), ...adresses(mail.cc), String(mail.headers.get("delivered-to") ?? "").toLowerCase()]
              .find((x) => /\+p-[0-9a-f-]{36}@/.test(x));
            const auto = /^(auto|r[ée]ponse automatique|automatic reply|absence|out of office|absent)/i.test(sujet.trim())
              || (String(mail.headers.get("auto-submitted") ?? "no").toLowerCase() !== "no");
            await sql`
              insert into public.mailbox_messages (direction, status, from_email, from_name, to_email, subject, body_text, body_html,
                message_id, in_reply_to, references_ids, attachments, auto_submitted, received_at)
              values ('entrant', 'nouveau', ${de || null}, ${(Array.isArray(mail.from) ? mail.from[0] : mail.from)?.value[0]?.name || null},
                ${etiquetee ?? b.adresse}, ${sujet.slice(0, 500)}, ${(mail.text ?? "").slice(0, 100_000)},
                ${typeof mail.html === "string" ? mail.html.slice(0, 200_000) : null}, ${mail.messageId ?? null},
                ${mail.inReplyTo ?? null}, ${Array.isArray(mail.references) ? mail.references.join(" ") : mail.references ?? null},
                ${sql.json((mail.attachments ?? []).map((a) => ({ nom: a.filename ?? "sans nom", type: a.contentType, taille: a.size })))},
                ${auto}, ${(mail.date ?? new Date()).toISOString()})
              on conflict (message_id) where direction = 'entrant' and message_id is not null do nothing`;
            r.recus++;
          }
          await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
        }
      } finally {
        verrou.release();
      }
      r.boites++;
    } catch (err) {
      r.erreurs.push(`${b.adresse} : ${(err as Error).message}`);
    } finally {
      await client.logout().catch(() => {});
    }
  }
  return r;
}

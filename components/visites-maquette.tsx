// Détail des ouvertures d'une maquette (5/11) : date, durée et appareil de chaque visite mesurée.
// 9/11 : le compteur « vues » ne compte qu'une ouverture par 30 minutes (public.maquette_vue), alors qu'un rechargement
// ou un 2e onglet crée une 2e visite mesurée. Les visites sont donc regroupées par 30 minutes avant de déduire les
// ouvertures d'avant le 5/11 (sinon deux visites à 9 h 48 cachaient l'ouverture du 2/11).
import { formatDate, formatSecondes } from "@/lib/format";
import type { Envoi, VisiteMaquette } from "@/lib/visites-maquettes";

const TRENTE_MIN = 30 * 60 * 1000;

/** Nombre d'ouvertures au sens du compteur : une nouvelle seulement après 30 minutes sans visite. */
function ouverturesMesurees(visites: VisiteMaquette[]): number {
  const temps = visites.map((v) => new Date(v.debut).getTime()).sort((a, b) => a - b);
  let n = 0;
  let precedente = -Infinity;
  for (const t of temps) {
    if (t - precedente >= TRENTE_MIN) n++;
    precedente = t;
  }
  return n;
}

/** 18/11 : l'e-mail qui a amené une ouverture = le dernier parti avant elle (envois du plus ancien au plus récent). */
export function envoiAvant(envois: Envoi[] | undefined, date: string): Envoi | null {
  const t = new Date(date).getTime();
  let dernier: Envoi | null = null;
  for (const e of envois ?? []) if (new Date(e.sent_at).getTime() <= t) dernier = e;
  return dernier;
}

/** Pastille « version A », « relance »… (vide si aucun e-mail n'était parti avant). */
export function PastilleEnvoi({ envoi }: { envoi: Envoi | null }) {
  if (!envoi) return null;
  const relance = envoi.type === "relance";
  return (
    <span className={`ml-1 rounded px-1.5 py-px text-[11px] font-medium ${relance ? "bg-amber-100 text-amber-900" : "bg-sky-100 text-sky-900"}`}
      title={`Dernier e-mail parti avant cette ouverture : ${relance ? "la relance" : `version ${envoi.type}`}, le ${formatDate(envoi.sent_at)}`}>
      {relance ? "relance" : `version ${envoi.type}`}
    </span>
  );
}

export function VisitesMaquette({ visites, vues, premiere, envois }: { visites: VisiteMaquette[]; vues: number; premiere?: string | null; envois?: Envoi[] }) {
  const sansDuree = Math.max(0, vues - ouverturesMesurees(visites));
  if (!visites.length && !sansDuree) return null;
  const total = visites.reduce((t, v) => t + v.duree_s, 0);
  return (
    <div className="mt-1 text-xs text-muted">
      {visites.length > 0 && (
        <ul className="space-y-0.5">
          {visites.map((v, i) => (
            <li key={i} className="tabular">
              {formatDate(v.debut)} · <span className="font-medium text-ink">{formatSecondes(v.duree_s)}</span>
              {v.appareil && <> · {v.appareil === "telephone" ? "téléphone" : "ordinateur"}</>}
              <PastilleEnvoi envoi={envoiAvant(envois, v.debut)} />
            </li>
          ))}
        </ul>
      )}
      {visites.length > 1 && <p className="tabular">Total : {formatSecondes(total)}</p>}
      {sansDuree > 0 && (
        <p className="tabular">
          {sansDuree === 1 ? "1 ouverture" : `${sansDuree} ouvertures`} d&apos;avant le 5/11, sans durée mesurée
          {premiere && <> (la 1re le {formatDate(premiere)}<PastilleEnvoi envoi={envoiAvant(envois, premiere)} />)</>}.
        </p>
      )}
    </div>
  );
}

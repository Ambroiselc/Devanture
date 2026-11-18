// Détail des dernières visites du site vitrine (13/11), avec les indices sur leur origine. Les robots (réseau
// d'hébergeur : Microsoft 365 qui vérifie les liens des e-mails, Google, Amazon…) sont montrés à part, en gris.
import { formatDate, formatSecondes } from "@/lib/format";
import type { VisiteSite } from "@/lib/visites-site";

const APPAREIL: Record<string, string> = { telephone: "téléphone", tablette: "tablette", ordinateur: "ordinateur" };
const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const estMicrosoft = (r: string | null) => Boolean(r && /microsoft/i.test(r));

function Ligne({ v }: { v: VisiteSite }) {
  const appareil = [v.appareil ? APPAREIL[v.appareil] ?? v.appareil : null, v.systeme, v.navigateur].filter(Boolean).join(" · ");
  const pages = v.pages.length ? v.pages : [v.page];
  const reseau = [v.reseau, v.pays].filter(Boolean).join(", ");
  if (v.robot) {
    const cible = v.maquettes[0];
    return (
      <li className="px-4 py-2 text-xs text-muted sm:px-5">
        <span className="tabular">{formatDate(v.debut)}</span> · robot{reseau && <> ({reseau})</>}
        {estMicrosoft(v.reseau) && cible
          ? <> : Microsoft 365 vérifiait les liens de l&apos;e-mail envoyé à <span className="text-ink">{cible.nom}</span>.</>
          : estMicrosoft(v.reseau) ? <> : Microsoft 365 vérifiait les liens d&apos;un e-mail.</> : "."}
      </li>
    );
  }
  return (
    <li className="px-4 py-2.5 text-sm sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <span className="tabular font-medium">{formatDate(v.debut)}</span>
        <span className="tabular text-muted">
          {v.duree_s === null ? "durée inconnue" : v.duree_s >= 4 ? formatSecondes(v.duree_s) : "moins de 4 s"}
          {" · "}{pages.length === 1 ? "1 page" : `${pages.length} pages`}
        </span>
      </div>
      <p className="text-muted">
        <span className="text-ink">{v.source}</span>{v.retrouvee && <> (retrouvée dans les journaux)</>}
        {appareil && <> · {appareil}</>}
        {reseau && <> · {reseau}</>}
        {" · "}{pages.join(" → ")}
      </p>
      {(v.maquettes.length > 0 || v.emails3h > 0) && (
        <p className="text-xs text-muted">
          {v.maquettes.map((m, j) => (
            <span key={j} className="mr-2 inline-block">
              {j === 0 ? "Juste après l'ouverture de la maquette de " : "et de "}
              <span className="font-medium text-ink">{m.nom}</span>{m.ville && <> ({m.ville})</>} à {heure(m.debut)}
              {m.memeAppareil ? ", même type d'appareil" : ""}.
            </span>
          ))}
          {v.emails3h > 0 && <span className="inline-block">{v.emails3h} e-mail(s) de prospection partis dans les 3 h d&apos;avant.</span>}
        </p>
      )}
    </li>
  );
}

export function VisitesSite({ visites }: { visites: VisiteSite[] }) {
  const personnes = visites.filter((v) => !v.robot).slice(0, 15);
  const robots = visites.filter((v) => v.robot).slice(0, 8);
  return (
    <>
      {personnes.length ? (
        <ul className="divide-y divide-line">{personnes.map((v, i) => <Ligne key={`p${i}`} v={v} />)}</ul>
      ) : (
        <p className="px-4 py-3 text-sm text-muted sm:px-5">Aucune vraie visite détaillée pour l&apos;instant.</p>
      )}
      {robots.length > 0 && (
        <details className="border-t border-line">
          <summary className="cursor-pointer px-4 py-2 text-xs text-muted sm:px-5">
            Robots écartés des compteurs ({robots.length} dernier{robots.length > 1 ? "s" : ""}) : ils se font passer pour un
            navigateur, mais viennent d&apos;un hébergeur (Microsoft, Google, Amazon…)
          </summary>
          <ul className="divide-y divide-line">{robots.map((v, i) => <Ligne key={`r${i}`} v={v} />)}</ul>
        </details>
      )}
    </>
  );
}

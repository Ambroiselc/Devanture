// Carte « Liens de paiement » : les liens Stripe de production, rangés par moment (signature / mise en ligne),
// avec un bouton pour copier chacun. Affichée sur la page d'Inès et dans la boîte mail (à côté d'une réponse).
import { LIENS_PAIEMENT, OFFRE_LANCEMENT_OUVERTE, type LienPaiement } from "@/agents/lib/paiement";
import { Copier } from "@/components/copier";
import { Panel } from "@/components/ui";

function Ligne({ l }: { l: LienPaiement }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2 sm:px-5">
      <span className="min-w-0">
        <span className="font-medium">{l.formule}</span> · {l.titre}
        <span className="tabular block text-xs text-muted">{l.prix}{l.lancement ? " (5 premiers clients)" : ""}</span>
      </span>
      <span className="flex items-center gap-2">
        <a href={l.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-shop hover:underline">Ouvrir</a>
        <Copier texte={l.url} />
      </span>
    </li>
  );
}

export function LiensPaiement({ className = "" }: { className?: string }) {
  const signature = LIENS_PAIEMENT.filter((l) => l.quand === "signature" && (OFFRE_LANCEMENT_OUVERTE || !l.lancement));
  const miseEnLigne = LIENS_PAIEMENT.filter((l) => l.quand === "mise_en_ligne");
  return (
    <Panel title="Liens de paiement" className={className}>
      <p className="px-4 pt-3 text-xs text-muted sm:px-5">
        À la commande : la création, ou le premier mois avec 0 € de départ.{OFFRE_LANCEMENT_OUVERTE ? " Avec 0 € de départ, le client peut taper le code LANCEMENT (3 mois à moitié prix, 5 fois au plus)." : ""}
      </p>
      <ul className="divide-y divide-line text-sm">{signature.map((l) => <Ligne key={l.cle} l={l} />)}</ul>
      <p className="border-t border-line px-4 pt-3 text-xs text-muted sm:px-5">
        À la mise en ligne du site : l&apos;abonnement sans engagement.
      </p>
      <ul className="divide-y divide-line text-sm">{miseEnLigne.map((l) => <Ligne key={l.cle} l={l} />)}</ul>
      <p className="border-t border-line px-4 py-3 text-xs text-muted sm:px-5">
        Carte ou prélèvement SEPA. Chaque paiement crée une facture dans Stripe (avec ton SIRET et les mentions obligatoires).
      </p>
    </Panel>
  );
}

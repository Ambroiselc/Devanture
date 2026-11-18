"use client";
// Filet de sécurité (27/10) : si une page du tableau de bord plante, on affiche un message clair au lieu
// d'un écran cassé, avec un bouton pour réessayer et le code à transmettre (« digest ») pour retrouver l'erreur.
import { useEffect } from "react";

export default function Erreur({ error, retry }: { error: unknown; retry: () => void }) {
  const e = error as { message?: string; digest?: string } | null;
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto max-w-xl space-y-4 rounded-xl border border-line bg-surface px-5 py-6">
      <h1 className="font-display text-xl font-semibold">Oups, cette page a planté</h1>
      <p className="text-sm">
        Si tu venais d&apos;enregistrer quelque chose, c&apos;est peut-être quand même enregistré : réessaie, ou
        recharge la page pour vérifier avant de recommencer.
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => retry()}
          className="rounded-lg bg-shop px-4 py-2 font-semibold text-white hover:opacity-90 dark:text-[var(--paper)]">
          Réessayer
        </button>
        <a href="/" className="rounded-lg border border-shop px-4 py-2 font-semibold text-shop hover:bg-shop-soft">Vue d&apos;ensemble</a>
      </div>
      <p className="text-xs text-muted">
        Si ça recommence, envoie-moi ce code : <span className="font-mono">{e?.digest ?? "—"}</span>
        {e?.message && <><br />Message : <span className="font-mono">{e.message}</span></>}
      </p>
    </div>
  );
}

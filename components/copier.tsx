"use client";
// Petit bouton « Copier » : met le texte dans le presse-papiers et affiche « Copié » deux secondes.
import { useState } from "react";

export function Copier({ texte, label = "Copier" }: { texte: string; label?: string }) {
  const [copie, setCopie] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texte);
          setCopie(true);
          setTimeout(() => setCopie(false), 2000);
        } catch {
          window.prompt("Copie ce lien :", texte);
        }
      }}
      className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium hover:bg-paper"
    >
      {copie ? "Copié ✓" : label}
    </button>
  );
}

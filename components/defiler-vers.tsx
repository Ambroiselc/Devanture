"use client";
// Après un bouton (« Enregistrer », réglages…), l'action renvoie vers la page avec ?vers=<id> au lieu d'une
// ancre #<id> : une redirection avec ancre faisait planter la page en ligne (27/10). Ce petit composant fait
// défiler jusqu'à l'élément <id> à chaque changement d'adresse.
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function DefilerVers() {
  const params = useSearchParams();
  const vers = params.get("vers");
  useEffect(() => {
    if (!vers || !/^[\w-]{1,80}$/.test(vers)) return;
    const el = document.getElementById(vers);
    if (el) el.scrollIntoView({ block: "start" });
  }, [vers, params]);
  return null;
}

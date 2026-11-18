"use client";
// Recharge les données de la page tant que `active` est vrai (par exemple pendant que Loïc travaille),
// pour suivre son avancement en direct.
// 3/11 (erreur Cloudflare 1102) : toutes les 60 s au lieu de 10 s, et seulement si l'onglet est visible :
// chaque rechargement recalcule toute la page sur Cloudflare, et une vague d'envoi dure parfois 20 minutes.
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function AutoRefresh({ active, everyMs = 60_000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, Math.max(everyMs, 30_000));
    return () => clearInterval(id);
  }, [active, everyMs, router]);
  return null;
}

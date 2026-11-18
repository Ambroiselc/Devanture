// Lien interne SANS préchargement (3/11, erreur Cloudflare 1102).
// Par défaut, Next.js précharge chaque lien visible : avec le menu, chaque page faisait calculer une dizaine d'autres
// pages en arrière-plan sur Cloudflare, ce qui épuisait le temps de calcul du plan gratuit (10 ms) et coupait les pages
// suivantes. La page n'est plus calculée qu'au clic (un peu moins instantané, mais elle ne plante plus).
import NextLink from "next/link";
import type { ComponentProps } from "react";

export default function Link(props: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={false} {...props} />;
}

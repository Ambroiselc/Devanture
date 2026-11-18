import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Masque l'en-tête « X-Powered-By: Next.js » (petite mesure de sécurité).
  poweredByHeader: false,
  // 5/11 : pour Google Cloud Run (tableau de bord), la construction produit un dossier autonome
  // (.next/standalone) qui tourne sans node_modules. Activé seulement par le Dockerfile.
  ...(process.env.SORTIE_AUTONOME === "1" ? { output: "standalone" as const } : {}),
  // 5/11 : Devi s'appelle désormais Pedro ; l'ancienne adresse /devi renvoie vers /pedro.
  async redirects() {
    return [{ source: "/devi", destination: "/pedro", permanent: true }];
  },
};

export default nextConfig;

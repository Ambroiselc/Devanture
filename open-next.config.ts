// Configuration d'OpenNext : l'outil qui transforme l'application Next.js en Worker Cloudflare.
// Réglages par défaut : pas de cache partagé (le tableau de bord affiche toujours des données fraîches).
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();

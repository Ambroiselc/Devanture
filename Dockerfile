# Tableau de bord Devanture sur Google Cloud Run (5/11, voir docs/cloud-run.md).
# Construit par le workflow « Tableau de bord — Cloud Run » (tableau-cloud-run.yml).
FROM node:22-slim AS construction
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Les NEXT_PUBLIC_* sont lues au moment de la construction (comme sur Cloudflare).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    SORTIE_AUTONOME=1 \
    NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p public && npx next build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
COPY --from=construction /app/.next/standalone ./
COPY --from=construction /app/.next/static ./.next/static
COPY --from=construction /app/public ./public
USER node
EXPOSE 8080
CMD ["node", "server.js"]

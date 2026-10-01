# Dockerfile optimizado para Next.js en Dokploy
# Evita que se acumulen capas innecesarias

FROM node:24-alpine AS base

# 1. Instalar dependencias (solo cuando package.json cambia)
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# 2. Prisma CLI aislado para aplicar migraciones al arrancar
# (la imagen standalone de Next.js no incluye el CLI)
FROM base AS migrator
RUN apk add --no-cache openssl
WORKDIR /migrator
COPY package.json /tmp/app-package.json
RUN PRISMA_VERSION="$(node -p "require('/tmp/app-package.json').devDependencies.prisma")" \
  && npm init -y >/dev/null \
  && npm pkg set "overrides.@prisma/config.deepmerge-ts=8.0.2" \
  && npm install --omit=dev --no-audit --no-fund "prisma@${PRISMA_VERSION}"

# 3. Build de la aplicación
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Variables de entorno necesarias para el build
ENV NEXT_TELEMETRY_DISABLED=1

# Generar Prisma Client
RUN npx prisma generate

# Build de Next.js (genera .next/standalone)
RUN npm run build

# 4. Imagen final de producción (la más pequeña posible)
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# El schema engine de Prisma necesita OpenSSL
RUN apk add --no-cache openssl

# Crear usuario no-root por seguridad
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copiar solo lo necesario desde el builder
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
# Fuentes de las miniaturas de marca (se leen en tiempo de ejecución)
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=migrator /migrator/node_modules /opt/prisma/node_modules
COPY scripts/docker-entrypoint.mjs ./docker-entrypoint.mjs

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Aplica migraciones pendientes y arranca la app (SKIP_MIGRATIONS=true lo desactiva)
CMD ["node", "docker-entrypoint.mjs"]

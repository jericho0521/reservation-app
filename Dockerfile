# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS base
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/ai-chat/package.json packages/ai-chat/package.json
COPY packages/contract-types/package.json packages/contract-types/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/reservation-chat-core/package.json packages/reservation-chat-core/package.json
COPY packages/reservation-platform-api/package.json packages/reservation-platform-api/package.json
COPY packages/reservations-core/package.json packages/reservations-core/package.json
COPY packages/reservations-supabase/package.json packages/reservations-supabase/package.json
COPY packages/sdk/package.json packages/sdk/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4100
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN addgroup -g 1001 -S reservation && \
    adduser -S reservation -u 1001 -G reservation

COPY --from=build --chown=reservation:reservation /app/package.json ./package.json
COPY --from=build --chown=reservation:reservation /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build --chown=reservation:reservation /app/node_modules ./node_modules
COPY --from=build --chown=reservation:reservation /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=reservation:reservation /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=reservation:reservation /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=reservation:reservation /app/apps/api/deployment.config.json ./apps/api/deployment.config.json
COPY --from=build --chown=reservation:reservation /app/packages ./packages

USER reservation
EXPOSE 4100

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '4100') + '/v1/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/api/dist/server.js"]

# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS base
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

FROM base AS deps
COPY . .
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN --mount=type=cache,target=/app/.embedding-model-cache \
    node scripts/fetch-embedding-model.mjs /app/.embedding-model/reservation-multilingual-minilm
RUN pnpm run build
RUN node scripts/verify-embedding-retrieval.mjs /app/.embedding-model reservation-multilingual-minilm
RUN pnpm --filter @reservation-platform/standalone-api-skeleton deploy --prod /app/deploy/api
RUN pnpm --filter @reservation-platform/worker deploy --prod /app/deploy/worker

FROM node:24-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS runtime-base
WORKDIR /app
ENV NODE_ENV=production
ENV RESERVATION_RUN_AS_UID=1001
ENV RESERVATION_RUN_AS_GID=1001

RUN apt-get update && \
    apt-get install --no-install-recommends -y gosu && \
    rm -rf /var/lib/apt/lists/* && \
    ln -s /usr/sbin/gosu /sbin/su-exec && \
    groupadd --gid 1001 reservation && \
    useradd --uid 1001 --gid reservation --create-home --shell /usr/sbin/nologin reservation

COPY --from=build /app/docker/local-stack/run-with-config.sh /usr/local/bin/run-with-config
COPY --from=build /app/docker/production/run-with-secrets.sh /usr/local/bin/run-with-secrets
RUN chmod 755 /usr/local/bin/run-with-config /usr/local/bin/run-with-secrets

FROM runtime-base AS runtime
ENV PORT=4100
COPY --from=build --chown=reservation:reservation /app/deploy/api ./apps/api
USER reservation
EXPOSE 4100

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '4100') + '/v1/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/api/dist/server.js"]

FROM runtime-base AS worker-runtime
COPY --from=build --chown=reservation:reservation /app/deploy/worker ./apps/worker
COPY --from=build --chown=reservation:reservation /app/.embedding-model ./models
COPY --from=build --chown=reservation:reservation /app/docs/THIRD_PARTY_NOTICES.md ./THIRD_PARTY_NOTICES.md

USER reservation

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "try { process.kill(1, 0); process.exit(0); } catch { process.exit(1); }"

CMD ["node", "apps/worker/dist/server.js"]

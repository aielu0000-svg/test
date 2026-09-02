# syntax=docker/dockerfile:1.7
FROM node:22.12.0-bookworm-slim AS build

WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build \
  && npm prune --omit=dev \
  && npm cache clean --force

FROM node:22.12.0-bookworm-slim AS runtime

LABEL org.opencontainers.image.title="The Test Web" \
      org.opencontainers.image.description="Web-based test management application" \
      org.opencontainers.image.source="https://github.com/aielu0000-svg/test"

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    HOME=/tmp \
    TMPDIR=/tmp \
    MIGRATIONS_DIR=/app/web/migrations \
    WEB_STATIC_DIR=/app/dist-web/client \
    EVIDENCE_STORAGE_PATH=/var/lib/the-test/evidence

COPY --from=build /app/web/package.json ./package.json
COPY --from=build /app/web/node_modules ./node_modules
COPY --from=build /app/dist-web ./dist-web
COPY --from=build /app/web/migrations ./web/migrations
COPY --from=build /app/web/openapi.yaml ./web/openapi.yaml

RUN mkdir -p /var/lib/the-test/evidence /tmp \
  && chgrp -R 0 /app /var/lib/the-test /tmp \
  && chmod -R g=u /app /var/lib/the-test /tmp

USER 1001
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist-web/server/server/server.js"]

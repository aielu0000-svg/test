FROM node:20-bookworm-slim AS build

WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV MIGRATIONS_DIR=/app/web/migrations
ENV WEB_STATIC_DIR=/app/dist-web/client
ENV EVIDENCE_STORAGE_PATH=/var/lib/the-test/evidence

COPY --from=build /app/web/node_modules ./web/node_modules
COPY --from=build /app/dist-web ./dist-web
COPY --from=build /app/web/migrations ./web/migrations
COPY --from=build /app/web/openapi.yaml ./web/openapi.yaml
RUN mkdir -p /var/lib/the-test/evidence \
  && chgrp -R 0 /app /var/lib/the-test \
  && chmod -R g=u /app /var/lib/the-test

USER 1001
EXPOSE 3000
CMD ["node", "dist-web/server/server.js"]

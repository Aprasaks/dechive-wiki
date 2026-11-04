# Exact release tag; CI also records the resolved image digest in its artifact.
ARG READER_BASE=node:22.23.4-bookworm-slim
FROM ${READER_BASE}
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --chown=node:node .next/standalone/ ./
COPY --chown=node:node .next/static/ ./.next/static/
COPY --chown=node:node public/ ./public/
USER node
EXPOSE 3000
CMD ["node", "server.js"]

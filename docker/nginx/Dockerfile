FROM node:22-bookworm-slim AS web-build

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:$PATH"

RUN corepack enable \
    && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/package.json
COPY mobile/package.json ./mobile/package.json
COPY apps/ops-mobile/package.json ./apps/ops-mobile/package.json
COPY packages/sdk/package.json ./packages/sdk/package.json
COPY packages/sdk/tsconfig.json ./packages/sdk/tsconfig.json
COPY packages/sdk/src ./packages/sdk/src
COPY packages/i18n/package.json ./packages/i18n/package.json
COPY packages/i18n/tsconfig.json ./packages/i18n/tsconfig.json
COPY packages/i18n/src ./packages/i18n/src
COPY scripts/load-root-env.cjs ./scripts/load-root-env.cjs
COPY web ./web

ARG VITE_GOOGLE_PLACES_API_KEY=
ENV VITE_GOOGLE_PLACES_API_KEY=${VITE_GOOGLE_PLACES_API_KEY}

RUN pnpm install --frozen-lockfile --filter @ie-platform/web... \
    && pnpm --dir web build


FROM nginx:1.27-alpine

RUN apk add --no-cache curl openssl

COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY docker/nginx/templates /etc/nginx/templates
COPY docker/nginx/docker-entrypoint.d/40-generate-self-signed.sh /docker-entrypoint.d/40-generate-self-signed.sh
COPY --from=web-build /app/web/dist /usr/share/nginx/html

RUN chmod +x /docker-entrypoint.d/40-generate-self-signed.sh \
    && mkdir -p /etc/nginx/certs /var/www/static \
    && rm -f /etc/nginx/conf.d/default.conf

EXPOSE 80 443

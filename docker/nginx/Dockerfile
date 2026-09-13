FROM node:22-bookworm-slim AS web-build

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:$PATH"
ENV CI=1
ENV EXPO_NO_TELEMETRY=1
ENV EXPO_NO_METRO_WORKSPACE_ROOT=1
ARG NODE_MAX_OLD_SPACE_SIZE=4096
ENV NODE_OPTIONS=--max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE}

RUN corepack enable \
    && corepack prepare pnpm@9.15.0 --activate \
    && apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
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
COPY scripts/withPinnedPlayServicesAds.cjs ./scripts/withPinnedPlayServicesAds.cjs
COPY web ./web
COPY apps/ops-mobile ./apps/ops-mobile

ARG VITE_GOOGLE_PLACES_API_KEY=
ARG VITE_GOOGLE_OAUTH_CLIENT_ID=
ARG GOOGLE_OAUTH_CLIENT_ID=
ARG VITE_OPS_MOBILE_WEB_URL=https://ops.ie-orbit.com
ARG VITE_OPS_ANDROID_STORE_URL=https://play.google.com/store/apps/details?id=com.ieorbit.ops&hl=en_IN
ARG VITE_OPS_IOS_STORE_URL=
ARG VITE_PUBLIC_SITE_URL=https://ie-orbit.com
ARG VITE_ADMIN_APP_URL=https://app.ie-orbit.com
ARG VITE_GA_MEASUREMENT_ID=
ARG GOOGLE_PLACES_API_KEY=
ARG EXPO_PUBLIC_GOOGLE_PLACES_API_KEY=
ARG EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=
ARG EXPO_PUBLIC_API_BASE_URL=https://api.ie-orbit.com/api/v1
ARG EXPO_PUBLIC_REFERRAL_LINK_BASE_URL=https://ie-orbit.com
ARG EXPO_PUBLIC_APP_DOWNLOAD_URL=https://ie-orbit.com/download

ENV VITE_GOOGLE_PLACES_API_KEY=${VITE_GOOGLE_PLACES_API_KEY}
ENV VITE_GOOGLE_OAUTH_CLIENT_ID=${VITE_GOOGLE_OAUTH_CLIENT_ID}
ENV GOOGLE_OAUTH_CLIENT_ID=${GOOGLE_OAUTH_CLIENT_ID}
ENV VITE_OPS_MOBILE_WEB_URL=${VITE_OPS_MOBILE_WEB_URL}
ENV VITE_OPS_ANDROID_STORE_URL=${VITE_OPS_ANDROID_STORE_URL}
ENV VITE_OPS_IOS_STORE_URL=${VITE_OPS_IOS_STORE_URL}
ENV VITE_PUBLIC_SITE_URL=${VITE_PUBLIC_SITE_URL}
ENV VITE_ADMIN_APP_URL=${VITE_ADMIN_APP_URL}
ENV VITE_GA_MEASUREMENT_ID=${VITE_GA_MEASUREMENT_ID}
ENV GOOGLE_PLACES_API_KEY=${GOOGLE_PLACES_API_KEY}
ENV EXPO_PUBLIC_GOOGLE_PLACES_API_KEY=${EXPO_PUBLIC_GOOGLE_PLACES_API_KEY}
ENV EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}
ENV EXPO_PUBLIC_API_BASE_URL=${EXPO_PUBLIC_API_BASE_URL}
ENV EXPO_PUBLIC_REFERRAL_LINK_BASE_URL=${EXPO_PUBLIC_REFERRAL_LINK_BASE_URL}
ENV EXPO_PUBLIC_APP_DOWNLOAD_URL=${EXPO_PUBLIC_APP_DOWNLOAD_URL}

RUN pnpm install --frozen-lockfile --filter @ie-orbit/web... --filter @ie-orbit/ops-mobile... \
    && pnpm --dir web build \
    && pnpm --dir apps/ops-mobile export:web


FROM nginx:1.27-alpine

RUN apk add --no-cache curl openssl

ARG NGINX_TEMPLATES_DIR=docker/nginx/templates

COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY ${NGINX_TEMPLATES_DIR} /etc/nginx/templates
COPY docker/nginx/docker-entrypoint.d/40-generate-self-signed.sh /docker-entrypoint.d/40-generate-self-signed.sh
COPY --from=web-build /app/web/dist /usr/share/nginx/html
COPY --from=web-build /app/apps/ops-mobile/dist /usr/share/nginx/ops

RUN chmod +x /docker-entrypoint.d/40-generate-self-signed.sh \
    && mkdir -p /etc/nginx/certs /var/www/static \
    && rm -f /etc/nginx/conf.d/default.conf

EXPOSE 80 443

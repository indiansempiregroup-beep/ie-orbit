FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm \
    PATH="${PNPM_HOME}:$PATH" \
    NODE_ENV=development

RUN corepack enable \
    && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/package.json
COPY mobile/package.json ./mobile/package.json
COPY packages/sdk/package.json ./packages/sdk/package.json
COPY packages/sdk/tsconfig.json ./packages/sdk/tsconfig.json
COPY packages/sdk/src ./packages/sdk/src
COPY packages/i18n/package.json ./packages/i18n/package.json
COPY packages/i18n/tsconfig.json ./packages/i18n/tsconfig.json
COPY packages/i18n/src ./packages/i18n/src
COPY web ./web

RUN pnpm install --frozen-lockfile --filter @ie-orbit/web...

ARG APP_ENV=development
ENV APP_ENV=${APP_ENV}

EXPOSE 3000

CMD ["sh", "-c", "if [ \"$APP_ENV\" = \"production\" ]; then pnpm --dir web build && pnpm --dir web exec vite preview --host 0.0.0.0 --port 3000; else pnpm --dir web dev --host 0.0.0.0 --port 3000; fi"]

# syntax=docker/dockerfile:1
# Образ Caddy со статикой Nuxt. Сборка из корня монорепо: docker build -f docker/web.Dockerfile .

FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile --filter @memequiz/web...
# адрес сайта для абсолютных og:image/og:url (превью ссылки); пустой — пути относительные
ARG SITE_ADDRESS=
ENV SITE_ADDRESS=$SITE_ADDRESS
# false — без скрипта Telegram Mini App (сервер в РФ: только сайт)
ARG TELEGRAM_SDK=true
ENV TELEGRAM_SDK=$TELEGRAM_SDK
# собирает shared, затем nuxt generate
RUN pnpm --filter @memequiz/web... build

FROM caddy:2-alpine
COPY --from=build /repo/apps/web/.output/public /srv

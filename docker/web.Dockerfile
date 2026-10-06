# syntax=docker/dockerfile:1
# Образ Caddy со статикой Nuxt. Сборка из корня монорепо: docker build -f docker/web.Dockerfile .

FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile --filter @memequiz/web...
# собирает shared, затем nuxt generate
RUN pnpm --filter @memequiz/web... build

FROM caddy:2-alpine
COPY --from=build /repo/apps/web/.output/public /srv

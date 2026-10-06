# syntax=docker/dockerfile:1
# Сборка из корня монорепо: docker build -f docker/api.Dockerfile .

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
# сначала только lockfile: слой со скачанными пакетами кэшируется, пока зависимости не меняются
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile --filter @memequiz/api...
# собирает shared, затем api (prebuild api = prisma generate)
RUN pnpm --filter @memequiz/api... build
# автономная папка с prod-зависимостями и файлами из "files" в package.json api
RUN pnpm --filter @memequiz/api deploy --prod --legacy /out

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
# миграции применяются при каждом старте; на уже актуальной БД это no-op
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]

FROM node:24.18.0-bookworm-slim AS system

RUN apt-get update \
  && apt-get install --yes --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

FROM system AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@11.17.0 --activate

WORKDIR /workspace

FROM base AS build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/time/package.json packages/time/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @mrb/time build
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm exec prisma generate
RUN pnpm --filter @mrb/api build
ENV API_INTERNAL_URL=http://api:3001
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @mrb/web build
RUN pnpm --filter @mrb/api deploy --prod --legacy /output/api
RUN cp -R packages/time/dist /output/api/node_modules/@mrb/time/dist

FROM build AS tools

FROM system AS api

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /output/api ./
EXPOSE 3001
CMD ["node", "dist/main.js"]

FROM node:24.18.0-bookworm-slim AS web

ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY --from=build /workspace/apps/web/.next/standalone ./
COPY --from=build /workspace/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

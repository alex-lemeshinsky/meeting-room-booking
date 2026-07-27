# Meeting Room Booking

Foundation-скелет для застосунку бронювання переговорних кімнат. Репозиторій
є pnpm workspace з окремими Next.js web і NestJS API застосунками,
PostgreSQL/Prisma межею та контрактами, згенерованими з OpenAPI.

## Передумови

- Node.js `24.18.0`;
- pnpm `11.17.0`;
- Docker із Compose plugin.

## Перший запуск

```bash
corepack enable
corepack prepare pnpm@11.17.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev:infra
pnpm exec prisma migrate deploy
pnpm exec prisma generate
pnpm dev
```

Після запуску:

- web: <http://localhost:3000>;
- API liveness: <http://localhost:3001/api/v1/health/live>;
- API readiness: <http://localhost:3001/api/v1/health/ready>.

`pnpm dev:infra` запускає лише локальний PostgreSQL. Web звертається до API
через same-origin `/api/*`; Next.js проксіює ці запити до NestJS у локальній
розробці.

## Перевірки

```bash
npm test
pnpm test:integration
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm contracts:check
pnpm build
pnpm format:check
pnpm verify:workspace
```

- `npm test` запускає unit/component tests у workspace.
- `pnpm test:integration` піднімає PostgreSQL 18.4 через Testcontainers,
  застосовує Prisma migration і перевіряє readiness повного NestJS app.
- `pnpm test:e2e` перевіряє desktop/mobile shell і same-origin API у Chromium.
- `pnpm lint` перевіряє ESLint-правила.
- `pnpm typecheck` перевіряє строгі TypeScript-контракти.
- `pnpm contracts:check` гарантує актуальність OpenAPI й generated types.
- `pnpm build` збирає всі workspace-пакети, що мають build script.
- `pnpm format:check` перевіряє форматування.
- `pnpm verify:workspace` перевіряє структуру та ідентичності пакетів.

## Межі foundation-слайсу

На цьому етапі немає користувачів, кімнат, seed-даних, автентифікації,
бронювань, повторень, сповіщень або календаря. Тестові облікові дані з’являться
у наступному auth/rooms slice. Реалізованих бонусів поки немає.

Архітектура вже вимагає зберігати моменти часу в UTC, оцінювати офісні години
як `09:00–19:00 Europe/Kyiv` і працювати з часом через `packages/time`, але
foundation не реалізує доменні часові правила.

## Структура

```text
apps/
  api/        NestJS API та database boundary
  web/        Next.js App Router shell
packages/
  config/     спільний strict TypeScript config
  contracts/  OpenAPI-generated public types
  time/       Clock boundary
prisma/       schema та foundation migration
e2e/          Playwright smoke tests
```

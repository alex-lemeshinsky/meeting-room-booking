# Meeting Room Booking

Застосунок для бронювання переговорних кімнат. Репозиторій є pnpm workspace
з окремими Next.js web і NestJS API застосунками, PostgreSQL/Prisma межею та
контрактами, згенерованими з OpenAPI.

## Передумови

- Node.js `24.18.0`;
- pnpm `11.17.0`;
- Docker із Compose plugin.

## Перший запуск

```bash
nvm install
nvm use
npm install --global pnpm@11.17.0
cp .env.example .env
npm run doctor:fast
pnpm install --frozen-lockfile
npm run doctor:full
pnpm dev:infra
pnpm exec prisma migrate deploy
pnpm exec prisma generate
pnpm db:seed
pnpm dev
```

Можна використати інший менеджер Node.js замість `nvm`, але активна версія
має відповідати `.nvmrc`. `npm run doctor:fast` не потребує `node_modules`,
Docker або registry та перевіряє Node.js і pnpm. `npm run doctor:full` додатково
перевіряє Docker CLI і Compose plugin перед integration або E2E work. Виправте
всі позначені `✗` перед відповідним етапом.

Після запуску:

- web: <http://localhost:3000>;
- API liveness: <http://localhost:3001/api/v1/health/live>;
- API readiness: <http://localhost:3001/api/v1/health/ready>.

`pnpm dev:infra` запускає лише локальний PostgreSQL. Web звертається до API
через same-origin `/api/*`; Next.js проксіює ці запити до NestJS у локальній
розробці.

Після seed локально доступні два тестові облікові записи:

- `olena@example.com` / `Rooms123!`;
- `alex@example.com` / `Meeting123!`.

Ці дані призначені лише для локальної розробки та E2E-перевірок. Не
використовуйте їх у production.

## Перевірки

```bash
pnpm verify:fast
npm run doctor:full
pnpm verify:all
```

- `pnpm verify:fast` запускає repository policy, форматування, lint, typecheck,
  unit/component tests, перевірку актуальності контрактів і production build.
  Для цієї перевірки не потрібні Docker або браузер.
- `pnpm verify:all` спочатку запускає fast gate, а потім додає integration-тести
  з PostgreSQL через Testcontainers і Playwright E2E у Chromium.

Focused-команди з root `package.json` залишаються доступними для розробки та
діагностики окремого етапу. `pnpm contracts:check` перед порівнянням
перегенеровує OpenAPI та public TypeScript contracts, тому локальна перевірка
може змінити generated files у working tree.

## Межі поточного слайсу

Поточний слайс реалізує обов’язкову реєстрацію, вхід, stateful-сесії, вихід,
захист авторизованих маршрутів, список переговорних кімнат і тижневий розклад
вибраної кімнати. Read-only календар показує сім локальних днів, бронювання
поточного тижня, власника, часовий пояс, порожні тижні та помилки завантаження;
на mobile решта днів доступна контрольованим горизонтальним scroll.

Seed створює стабільні демонстраційні бронювання для тестових облікових записів.
Моменти зберігаються в UTC, робочі години обчислюються як
`09:00–19:00 Europe/Kyiv`, а DST-безпечні календарні розрахунки зосереджені в
`packages/time`.

Верифікація email, фільтрація кімнат за місткістю, створення й скасування
бронювань, повторення та сповіщення залишаються для наступних слайсів.

## Структура

```text
apps/
  api/        NestJS API та database boundary
  web/        Next.js App Router shell
packages/
  config/     спільний strict TypeScript config
  contracts/  OpenAPI-generated public types
  time/       DST-безпечні календарні та Clock примітиви
prisma/       schema, міграції та deterministic seed
e2e/          Playwright user journeys
```

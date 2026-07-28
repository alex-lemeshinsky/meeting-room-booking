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
npm run doctor
pnpm install --frozen-lockfile
pnpm dev:infra
pnpm exec prisma migrate deploy
pnpm exec prisma generate
pnpm db:seed
pnpm dev
```

Можна використати інший менеджер Node.js замість `nvm`, але активна версія
має відповідати `.nvmrc`. `npm run doctor` не потребує `node_modules`, не
запускає Docker і не звертається до registry. Команда одразу перевіряє Node.js,
pnpm, Docker CLI, Compose plugin і наявність `DATABASE_URL` у середовищі або
локальному `.env`, не виводячи його значення. Виправте всі позначені `✗` перед
встановленням залежностей.

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
захист авторизованих маршрутів і список переговорних кімнат із seed-даними.
Верифікація email, фільтрація кімнат за місткістю та календарі залишаються для
наступних слайсів. Бронювання, повторення й сповіщення також ще не реалізовані.

Архітектура вже вимагає зберігати моменти часу в UTC, оцінювати офісні години
як `09:00–19:00 Europe/Kyiv` і працювати з часом через `packages/time`, але
поточний слайс не реалізує доменні часові правила.

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

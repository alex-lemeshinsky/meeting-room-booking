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

## Production-like запуск у Docker

```bash
cp .env.example .env
npm run doctor:full
docker compose up --build --wait
```

Після запуску весь застосунок доступний на <http://localhost:3000>. Назовні
публікується тільки nginx: він передає `/api/*` до NestJS, `/events` до NestJS
без proxy buffering, а решту запитів — до Next.js. Compose чекає готовності
PostgreSQL, одноразово застосовує Prisma migrations та ідемпотентний seed, а
потім запускає production images API і web.

`POSTGRES_DB`, `POSTGRES_USER` і `POSTGRES_PASSWORD` можна змінити в `.env`.
Значення з `.env.example` призначені лише для локального запуску; для реального
розгортання задайте власний пароль через захищену конфігурацію середовища.
Дані PostgreSQL зберігаються в named volume після звичайної зупинки:

```bash
docker compose down
```

Щоб навмисно видалити локальні дані разом із volume:

```bash
docker compose down --volumes
```

Після seed локально доступні два тестові облікові записи:

- `olena@example.com` / `Rooms123!`;
- `alex@example.com` / `Meeting123!`.

Ці дані призначені лише для локальної розробки та E2E-перевірок. Не
використовуйте їх у production. Обидва seed-акаунти вже мають підтверджений
email, тому ними можна одразу створювати бронювання.

## Підтвердження email

Реєстрація створює одноразове посилання для підтвердження email, дійсне 24
години. У локальній розробці API виводить це посилання у свій журнал після
успішної транзакції реєстрації. Production не надсилає email і не виводить
посилання: зовнішній поштовий провайдер не входить до поточного слайсу.

Перехід за посиланням лише відкриває сторінку. Токен використовується після
явного натискання кнопки `Підтвердити email`; недійсне, прострочене й уже
використане посилання мають окремі повідомлення. У PostgreSQL зберігається
лише SHA-256 хеш токена.

До підтвердження email користувач може увійти, відновити сесію, переглядати
кімнати й розклад, але створення бронювання повертає
`403 EMAIL_NOT_VERIFIED`. Після підтвердження бронювання стає доступним без
повторної реєстрації.

## Перевірки

```bash
pnpm verify:fast
npm run doctor:full
pnpm verify:all
pnpm test:compose
```

- `pnpm verify:fast` запускає repository policy, форматування, lint, typecheck,
  unit/component tests, перевірку актуальності контрактів і production build.
  Для цієї перевірки не потрібні Docker або браузер.
- `pnpm verify:all` спочатку запускає fast gate, а потім додає integration-тести
  з PostgreSQL через Testcontainers і Playwright E2E у Chromium.
- `pnpm test:compose` збирає production images у тимчасовому Compose project,
  перевіряє migrations, seed, авторизований фільтр кімнат через nginx,
  відновлення після перезапуску PostgreSQL і завжди видаляє тестовий volume.

Focused-команди з root `package.json` залишаються доступними для розробки та
діагностики окремого етапу. `pnpm contracts:check` перед порівнянням
перегенеровує OpenAPI та public TypeScript contracts, тому локальна перевірка
може змінити generated files у working tree.

## Обсяг реалізації

Проєкт реалізує повний погоджений обсяг, включно зі Stage 11 (фіналізація): реєстрацію з підтвердженням email, вхід, сесії, вихід, захист маршрутів, список кімнат з фільтром за місткістю, тижневий розклад, створення й скасування бронювань із захистом від конкурентної гонки, повторювані щотижневі бронювання, сторінку `Мої бронювання` з історією та cursor-пагінацією, сповіщення про завершення бронювань реального часу з SSE, а також персоналізацію першого дня тижня в календарі — користувач обирає будь-який із семи днів на сторінці налаштувань (`/settings`), значення зберігається через `PATCH /api/v1/me`, а глибокі посилання з параметром `?week=` автоматично прив'язуються до початку тижня поточного глядача.

Stage 11 закрив фіналізацію: повний прогін `pnpm verify:all` і `pnpm test:compose`, перевірку чистого запуску за цим README, перевірку ідемпотентності сідів, ручну перевірку desktop- і mobile-сценаріїв у браузері, актуалізацію списку бонусів нижче та очищення мертвого коду (`knip`).

Реалізовані офіційні бонуси: Docker Compose з автоматичними міграціями та seed, фільтр кімнат за місткістю, інтеграційні API-тести, захист від конкурентного подвійного бронювання, повноцінний mobile-сценарій, підтвердження email у dev-режимі, повторювані бронювання, ідемпотентні сповіщення реального часу із транзакційними блокуваннями й SSE, а також персоналізація першого дня тижня в календарі (`SETTINGS-01`).

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

# Meeting Room Booking — технічний дизайн

Дата: 2026-07-27
Статус: секції погоджено, очікує перевірки записаної специфікації

## 1. Мета і межі документа

Цей документ фіксує технічну архітектуру застосунку для бронювання
переговорних кімнат. Повний продуктовий обсяг описано в
[`docs/features.md`](../../features.md).

Проєкт реалізує обов'язкові та бонусні функції поетапно. Архітектура одразу
передбачає весь погоджений обсяг, але кожен етап має залишати застосунок у
робочому та перевіреному стані.

Основні цілі:

- чітко відокремити інтерфейс від бізнес-правил;
- гарантувати відсутність подвійних бронювань навіть за конкурентних запитів;
- коректно працювати з часовими поясами й DST;
- не вводити Redis або окремі сервіси, поки PostgreSQL достатньо;
- забезпечити відтворюваний запуск і тестування на чистій машині.

## 2. Обраний архітектурний підхід

Використовується модульний моноліт у pnpm workspace:

- `Next.js App Router` — вебінтерфейс і серверний рендеринг сторінок;
- `NestJS` — окремий REST API, бізнес-правила, фонові задачі й SSE;
- `PostgreSQL` — єдине джерело істини;
- `Prisma` — доступ до даних і міграції;
- `nginx` — єдина зовнішня точка входу та same-origin reverse proxy.

Цей варіант обрано замість єдиного Next.js-застосунку або набору
мікросервісів. Окремий NestJS API створює явну межу для бізнес-правил і
конкурентних операцій, а модульний моноліт не додає передчасної операційної
складності.

Next.js не звертається до Prisma або PostgreSQL напряму. Усі доменні зміни
проходять через NestJS.

## 3. Структура репозиторію

```text
apps/
  web/                     # Next.js App Router
  api/                     # NestJS
packages/
  contracts/               # згенерований API-клієнт і публічні типи
  time/                    # спільні безпечні операції з часом
  config/                  # спільні налаштування TypeScript, lint тощо
prisma/
  schema.prisma
  migrations/
  seed.ts
e2e/                       # Playwright
docs/
  features.md
  superpowers/specs/
compose.yaml
nginx/
```

Окремий shared UI package на початку не створюється. Компоненти інтерфейсу
залишаються в `apps/web`, доки не з'явиться реальна потреба в повторному
використанні за межами одного застосунку.

Prisma-моделі не експортуються як API-контракти. Публічні DTO генеруються з
OpenAPI-схеми NestJS у `packages/contracts`.

## 4. Межі модулів

### 4.1. NestJS

API поділяється на модулі:

- `AuthModule` — реєстрація, вхід, вихід, сесії, CSRF і підтвердження email;
- `UsersModule` — профіль і налаштування першого дня тижня;
- `RoomsModule` — список кімнат і фільтрація за місткістю;
- `BookingsModule` — читання розкладу, створення та скасування бронювань;
- `RecurrenceModule` — побудова й керування щотижневими серіями;
- `NotificationsModule` — фонове виявлення, збереження і доставка сповіщень;
- `DatabaseModule` — Prisma та транзакційні примітиви;
- `HealthModule` — readiness/liveness endpoints;
- `CommonModule` — конфігурація, логування, request ID, clock та спільні
  винятки.

Допустимі залежності:

```text
Auth ──────────> Users
Bookings ──────> Users, Rooms
Recurrence ────> Bookings
Notifications ─> Bookings
```

Зворотні залежності й цикли не допускаються. Модулі взаємодіють через
публічні сервіси або внутрішні доменні події після успішного commit.

Кожна нетривіальна функція може містити:

- controller — HTTP і DTO;
- service/use case — оркестрація;
- policy — чисті бізнес-правила;
- repository — запити до даних;
- DTO та mapper.

Не потрібно створювати всі шари для простого читання. Межа вводиться лише
там, де вона робить правило незалежно тестованим.

### 4.2. Next.js

```text
app/
  (auth)/
  (protected)/
features/
  auth/
  rooms/
  calendar/
  bookings/
  recurrence/
  notifications/
components/
  ui/
lib/
  api/
  time/
  validation/
```

Route groups відділяють публічні екрани входу й реєстрації від захищеної
частини. Захищений layout перевіряє сесію через NestJS.

Next.js відповідає за:

- рендеринг і маршрутизацію;
- локальний стан форми та календаря;
- запити через згенерований клієнт;
- відображення loading, empty, error і success states;
- перетворення UTC-моментів для показу користувачу.

Next.js не містить альтернативної реалізації серверних бізнес-правил.
Клієнтська валідація покращує UX, але NestJS завжди повторює її.

## 5. Модель даних

### 5.1. `users`

Основні поля:

- `id`;
- `name`;
- `email_normalized` з унікальним індексом;
- `password_hash`;
- `email_verified_at`;
- `week_starts_on`, ISO-значення `1..7`, де понеділок — `1`, а неділя —
  `7`; за замовчуванням `1`;
- `created_at`, `updated_at`.

### 5.2. `sessions`

- `id`;
- `user_id`;
- `token_hash`;
- `csrf_token_hash`;
- `last_seen_at`;
- `idle_expires_at`;
- `absolute_expires_at`;
- `created_at`.

У базі зберігаються тільки хеші секретних токенів.

### 5.3. `email_verification_tokens`

- `id`;
- `user_id`;
- `token_hash`;
- `expires_at`;
- `used_at`;
- `created_at`.

Токен одноразовий і чинний 24 години.

### 5.4. `rooms`

- `id`;
- `name`;
- `floor`;
- `capacity`;
- `created_at`, `updated_at`.

Кімнати додаються ідемпотентним seed. Адміністративного CRUD немає.

### 5.5. `booking_series`

- `id`;
- `user_id`;
- `room_id`;
- `title`;
- `office_timezone`, завжди `Europe/Kyiv`;
- локальна офісна дата й час першого повторення;
- `duration_minutes`;
- `occurrence_count`;
- правило повторення, у поточному обсязі тільки `WEEKLY`;
- `created_at`.

Серія зберігає київський wall-clock час, тому після DST-переходу UTC-момент
окремого повторення може змінитися.

### 5.6. `bookings`

- `id`;
- `room_id`;
- `user_id`;
- необов'язковий `series_id`;
- необов'язковий `occurrence_index`;
- `title`;
- `start_at`, `end_at` як UTC `timestamptz`;
- `status`: `ACTIVE` або `CANCELLED`;
- `cancelled_at`;
- `created_at`, `updated_at`.

Кожне повторення серії є окремим матеріалізованим бронюванням. Це спрощує
читання календаря, скасування одного повторення та перевірку конфліктів.

Для сумісності з правилом напіввідкритих інтервалів база використовує:

```sql
tstzrange(start_at, end_at, '[)')
```

### 5.7. `notifications`

- `id`;
- `user_id`;
- `current_booking_id`;
- `next_booking_id`;
- `type`;
- `scheduled_for`;
- `created_at`;
- `read_at`.

Унікальне обмеження на тип і пару бронювань забезпечує створення рівно одного
сповіщення.

## 6. Гарантія відсутності перетинів

Попередня перевірка в `BookingsService` потрібна для дружнього повідомлення,
але остаточну гарантію дає PostgreSQL:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings
ADD CONSTRAINT bookings_no_active_overlap
EXCLUDE USING gist (
  room_id WITH =,
  tstzrange(start_at, end_at, '[)') WITH &&
)
WHERE (status = 'ACTIVE');
```

Цей SQL додається в кастомну Prisma migration.

Наслідки:

- суміжні інтервали дозволені;
- скасовані записи не блокують кімнату;
- два конкурентні запити не можуть обидва завершитися успішно;
- помилка exclusion constraint перетворюється на
  `409 BOOKING_CONFLICT`.

Створення серії виконується в одній транзакції. Якщо хоча б одне повторення
порушує правило, вся транзакція відкочується.

Скасування виконується атомарним conditional update із перевіркою автора,
активного статусу та `end_at > serverNow`.

## 7. Автентифікація і безпека

### 7.1. Паролі й email

- email обрізається та приводиться до нижнього регістру;
- пароль хешується Argon2id;
- пароль і сирі токени не журналюються;
- помилка входу не розкриває існування email.

### 7.2. Сесії

Після входу сервер генерує криптографічно випадковий opaque token:

- сире значення зберігається тільки в cookie;
- SHA-256 хеш зберігається у `sessions`;
- idle timeout — 7 днів;
- absolute timeout — 30 днів;
- успішне використання сесії пересуває idle expiration ще на 7 днів, але
  ніколи не далі absolute expiration;
- дозволено кілька пристроїв;
- вихід видаляє поточну сесію й обидві пов'язані cookies.

Session cookie:

```text
HttpOnly
Secure у production
SameSite=Lax
Path=/
```

Наявність cookie може використовуватися Next.js лише для раннього redirect.
Авторитетна перевірка виконується запитом
`GET /api/v1/auth/session` до NestJS.

### 7.3. CSRF

Для `POST`, `PATCH` і `DELETE` застосовуються:

- перевірка `Origin`;
- окремий випадковий CSRF token у доступній браузерному JavaScript cookie;
- SHA-256 хеш CSRF token у відповідному записі `sessions`;
- те саме сире значення в заголовку `X-CSRF-Token`, яке API звіряє з
  хешем сесії;
- приймання mutation body тільки як JSON.

CSRF cookie має `Secure` у production, `SameSite=Lax` і `Path=/`, але не має
`HttpOnly`, бо клієнт повинен скопіювати її значення в заголовок. Вона не
надає доступу до облікового запису без HttpOnly session cookie.

SSE є read-only GET і авторизується сесійною cookie.

### 7.4. Підтвердження email

Після реєстрації NestJS створює випадковий одноразовий токен, зберігає його
хеш і в dev-режимі журналює URL сторінки підтвердження. Сама сторінка
Next.js виконує `POST` до API, щоб сканер посилань не використав токен
простим GET-запитом.

Непідтверджений користувач може читати розклад, але mutation створення
бронювання повертає `EMAIL_NOT_VERIFIED`.

## 8. API-контракти

API має версіонований префікс `/api/v1`. NestJS генерує OpenAPI-схему, з
якої створюється TypeScript-клієнт для Next.js.

Основні маршрути:

```text
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/auth/session
POST   /api/v1/auth/verify-email
GET    /api/v1/users/me
PATCH  /api/v1/users/me
GET    /api/v1/rooms
GET    /api/v1/rooms/:roomId/schedule
POST   /api/v1/bookings
POST   /api/v1/bookings/:bookingId/cancel
POST   /api/v1/booking-series
POST   /api/v1/booking-series/:seriesId/cancel
GET    /api/v1/my-bookings
GET    /api/v1/notifications
PATCH  /api/v1/notifications/:notificationId/read
GET    /api/v1/health/live
GET    /api/v1/health/ready
GET    /events
```

Операції скасування є явними commands через `POST`, бо вони виконують
доменний перехід стану, а не загальне редагування ресурсу.

Правила контракту:

- моменти часу передаються як UTC ISO 8601;
- часові пояси передаються як IANA-ідентифікатори;
- cursor є непрозорим рядком;
- сервер не повертає Prisma-моделі;
- одна помилка має один стабільний машинний code.

Стандартна відповідь із помилкою:

```json
{
  "error": {
    "code": "BOOKING_CONFLICT",
    "message": "Цей час уже зайнятий",
    "fieldErrors": {
      "startAt": "Оберіть інший інтервал"
    },
    "requestId": "opaque-request-id"
  }
}
```

`fieldErrors` необов'язковий. Інтерфейс відображає локалізований текст за
`code`, а не аналізує довільний `message`.

## 9. Час, календар і DST

### 9.1. Єдина модель часу

- база й API оперують UTC-моментами;
- офісні години будуються як `09:00–19:00 Europe/Kyiv` для конкретної
  офісної дати;
- браузер показує моменти в IANA-поясі користувача;
- ручна арифметика через фіксований UTC offset заборонена.

Для операцій із зонами використовується Luxon. Спільні чисті функції
знаходяться в `packages/time`.

NestJS отримує поточний час через ін'єкцію `Clock`, щоб тести могли його
зафіксувати.

### 9.2. Запит тижневого розкладу

1. Браузер визначає пояс через `Intl.DateTimeFormat`.
2. Пояс зберігається в несекретній cookie для server render.
3. Клієнт обчислює локальні межі вибраного тижня за `week_starts_on` із
   профілю.
4. Межі перетворюються в UTC і надсилаються як `from` та `to`.
5. API перевіряє `from < to` і максимальну ширину запиту 8 днів.
6. API вибирає активні бронювання за правилом:

   ```text
   start_at < to AND end_at > from
   ```

7. API повертає UTC-моменти; групування по локальних датах робить web.

На першому відвідуванні, доки timezone cookie відсутня, календар показує
стабільний skeleton. Це уникає hydration mismatch.

### 9.3. Адаптивна локальна сітка

Колонки завжди є локальними датами користувача. Якщо перетворені київські
робочі години перетинають локальну північ, сітка розширюється до 24 годин,
неробочий час затінюється, а подія візуально ділиться на пов'язані
фрагменти.

У DST-перехід:

- неіснуючий локальний слот не створюється;
- повторена година показується двічі;
- підпис містить offset або назву зони;
- ідентичність слота базується на UTC-моменті.

## 10. Клієнтські дані

TanStack Query керує серверним станом у Next.js.

Основні query keys:

```text
schedule(roomId, weekStart, timezone)
rooms(minCapacity)
myBookings(section, cursor)
notifications
```

Після створення або скасування інвалідується відповідний schedule і список
власних бронювань.

Створення бронювання не є optimistic: до відповіді сервера календар не
показує підтверджену подію. Для скасування допускається обережне optimistic
оновлення з rollback, бо сервер усе одно може відхилити дію.

## 11. Повторювані бронювання

Форма створення містить inline-перемикач повторення і кількість щотижневих
повторень.

`RecurrenceModule`:

1. перевіряє базове правило;
2. будує кожне повторення в `Europe/Kyiv`, зберігаючи wall-clock час;
3. переводить кожен інтервал у UTC;
4. виконує звичайні policy-перевірки для кожного повторення;
5. вставляє series та bookings в одній транзакції.

Діалог скасування елемента серії пропонує:

- `Лише цю подію`;
- `Усю серію`.

Скасування всієї серії атомарно позначає скасованими всі активні екземпляри
з `end_at > serverNow`. Завершені екземпляри залишаються в історії.

## 12. Сповіщення і фоновий процес

Окремий Redis або message broker не використовується.

Кожні 15 секунд scheduler у NestJS:

1. отримує PostgreSQL advisory lock, щоб лише один API instance був leader;
2. знаходить поточні активні бронювання, для яких
   `end_at - NOTIFY_BEFORE_MINUTES <= serverNow < end_at`;
3. перевіряє активне наступне бронювання тієї самої кімнати, де
   `next.start_at = current.end_at`;
4. вставляє notification з унікальним idempotency constraint;
5. після commit публікує внутрішню подію для SSE.

У межах одного циклу використовується transaction-level
`pg_try_advisory_xact_lock`; транзакція охоплює пошук і вставлення
сповіщень.

SSE дає швидку доставку відкритій вкладці. PostgreSQL залишається джерелом
істини: якщо користувач був offline або SSE розірвався, непрочитане
сповіщення завантажиться звичайним API-запитом.

Інтерфейс показує нове повідомлення як toast і зберігає його в панелі
дзвіночка з unread count.

## 13. Історія й пагінація

`Мої бронювання` має дві вкладки:

- `Майбутні та активні`;
- `Історія`.

Історія включає завершені та скасовані записи. Вона використовує стабільне
сортування за датою й id, opaque cursor, сторінку з 20 елементів і кнопку
`Завантажити ще`.

Cursor кодує останню пару sort keys, але клієнт не залежить від його
внутрішнього формату.

## 14. Обробка помилок і спостережуваність

- кожен HTTP-запит отримує `requestId`;
- structured logs містять requestId, route, status і тривалість;
- паролі, cookies, CSRF, verification та session tokens редагуються;
- очікувані доменні помилки мають стабільні codes;
- неочікувані помилки повертають `INTERNAL_ERROR` без stack trace;
- Prisma/PostgreSQL errors перетворюються в доменні помилки в одному місці;
- UI зберігає введені дані після виправної помилки й дозволяє retry.

SSE-клієнт автоматично перепідключається. Після reconnect виконується
звичайне оновлення notifications query, тому доставка не залежить від
історії мережевого каналу.

## 15. Тестова стратегія

### 15.1. Unit

- Jest у NestJS для policies, services і часових правил;
- Vitest + React Testing Library у Next.js для форм, calendar layout,
  notifications і UI states;
- `npm test` запускає весь unit-набір, як вимагає ТЗ.

Обов'язково перевіряються всі види перетинів, `[)`-межі, робочі години,
30-хвилинна кратність, `startAt > serverNow`, DST і права на скасування.

### 15.2. Integration

Jest + Supertest запускає повний NestJS application проти тимчасової
PostgreSQL у Testcontainers.

SQLite й mock database не використовуються для інтеграційних тестів, бо
вони не перевірять PostgreSQL exclusion constraint.

Критичний race test надсилає два паралельні запити на один конфліктний
інтервал і перевіряє:

- один `201`;
- один `409 BOOKING_CONFLICT`;
- рівно одне активне бронювання в базі.

Окремо перевіряються транзакційний rollback серії та унікальність
сповіщення після повторного запуску scheduler.

### 15.3. E2E

Playwright у Chromium перевіряє:

- реєстрацію, підтвердження email, вхід і відновлення сесії;
- створення, конфлікт і скасування бронювання;
- повторювану серію;
- перехід із `Мої бронювання` до календаря;
- сповіщення;
- desktop і mobile viewport.

Async Server Components перевіряються переважно E2E, а не через крихкі
ізольовані рендери.

## 16. Docker і запуск

Фіксується Node.js 24 LTS у `.nvmrc`, `package.json#engines` і Docker
images.

`docker compose up --build` запускає:

- `db` — PostgreSQL із persistent volume і healthcheck;
- `migrate` — одноразово застосовує Prisma migrations;
- `seed` — ідемпотентно додає тестові дані;
- `api` — production build NestJS;
- `web` — production build Next.js;
- `proxy` — nginx.

Залежності Compose:

```text
db healthy
  └─> migrate completed
        └─> seed completed
              └─> api healthy
                    └─> proxy
web healthy ─────────────> proxy
```

nginx маршрутизує:

```text
/api/*  -> api
/events -> api, proxy buffering off
/*      -> web
```

Зовні публікується тільки proxy. CORS для браузера не потрібний, бо всі
запити same-origin.

Для локальної розробки:

```text
pnpm dev:infra
pnpm dev
```

Для повного production-like запуску:

```text
docker compose up --build
```

## 17. Команди якості

```text
npm test
pnpm test:integration
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm build
```

README пояснює prerequisites, env, міграції, seed, тестові облікові дані,
запуск кожного test layer і повний Docker-сценарій.

## 18. CI

GitHub Actions запускається на push і pull request:

1. `pnpm install --frozen-lockfile`;
2. lint;
3. typecheck;
4. unit-тести;
5. integration-тести з PostgreSQL;
6. production build;
7. Playwright smoke-тести в Chromium.

Короткий Playwright smoke-набір запускається на кожен push. Повний E2E-набір
запускається на pull request і через ручний `workflow_dispatch`; на pull
request smoke-тести входять у повний набір і окремо не дублюються.

## 19. Поетапна реалізація

Архітектура впроваджується за етапами з
[`docs/features.md`](../../features.md):

1. каркас monorepo, база, env, тести;
2. auth, rooms і sessions;
3. читання календаря та timezone UI;
4. створення й конкурентний захист бронювань;
5. скасування, `Мої бронювання`, UX і доступність;
6. Docker та integration/E2E tests;
7. email verification;
8. recurrence;
9. notifications і SSE;
10. week-start setting;
11. фінальна перевірка й документація.

Кожен етап отримує окремий implementation plan і осмислені коміти.

## 20. Критерії архітектурної готовності

Архітектура вважається реалізованою, коли:

- Next.js не має прямого доступу до бази;
- усі mutations проходять серверні policies;
- exclusion constraint реально присутній у production migration;
- race test стабільно залишає лише одне бронювання;
- час зберігається в UTC, а офісні правила рахуються в `Europe/Kyiv`;
- DST-тести проходять для пропущеної та повтореної годин;
- сесійні й verification tokens не зберігаються відкрито;
- scheduler працює без дублів на кількох API instances;
- `docker compose up --build` піднімає готовий застосунок;
- команди lint, typecheck, test і build проходять у CI.

## 21. Довідкові матеріали

- [Next.js App Router](https://nextjs.org/docs/app)
- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [Next.js testing](https://nextjs.org/docs/app/guides/testing)
- [NestJS testing](https://docs.nestjs.com/fundamentals/testing)
- [NestJS scheduling](https://docs.nestjs.com/techniques/task-scheduling)
- [NestJS server-sent events](https://docs.nestjs.com/techniques/server-sent-events)
- [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [Prisma custom migrations](https://docs.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations)
- [Luxon API](https://moment.github.io/luxon/api-docs/index.html)
- [TanStack Query](https://tanstack.com/query/latest/docs/react/overview)
- [Testcontainers PostgreSQL](https://node.testcontainers.org/modules/postgresql/)
- [Docker Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/)
- [Playwright web server](https://playwright.dev/docs/test-webserver)
- [Node.js releases](https://nodejs.org/en/about/previous-releases)

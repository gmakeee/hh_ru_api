# 🤖 HH.ru AI Candidate Scorer

> Умная система автоматической оценки кандидатов с HH.ru на базе GPT-4o-mini, Next.js 16 и Upstash QStash.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green?logo=supabase)](https://supabase.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?logo=tailwindcss)](https://tailwindcss.com)
[![Upstash QStash](https://img.shields.io/badge/QStash-Upstash-purple)](https://upstash.com/qstash)

---

## Что это такое

Система автоматически:
1. **Синхронизируется** с HH.ru API и забирает новые отклики на вакансии
2. **Оценивает** каждого кандидата через LLM (GPT-4o-mini via OpenRouter) по 4 критериям
3. **Генерирует** персонализированные вопросы для интервью на основе слабых мест
4. **Автоматически отклоняет** слабых кандидатов через API HH.ru
5. **Рассылает сообщения** подходящим кандидатам пачками через встроенную очередь
6. **Показывает** всё в удобном Admin Dashboard с фильтрами, пагинацией и live-трекером прогресса

---

## Содержание

- [Быстрый старт](#быстрый-старт)
- [Переменные окружения](#переменные-окружения)
- [Архитектура](#архитектура)
- [Функциональность](#функциональность)
- [API Эндпоинты](#api-эндпоинты)
- [База данных](#база-данных)
- [Структура проекта](#структура-проекта)
- [Дорожная карта](#дорожная-карта)

---

## Быстрый старт

### Требования

- Node.js 20+
- Аккаунт [Supabase](https://supabase.com)
- Приложение на [dev.hh.ru](https://dev.hh.ru/admin) с OAuth 2.0
- API-ключ [OpenRouter](https://openrouter.ai)
- Аккаунт [Upstash](https://upstash.com) с QStash

### Установка

```bash
# 1. Клонируй репозиторий
git clone <repo-url>
cd hh-ru-api

# 2. Установи зависимости
npm install

# 3. Скопируй и заполни переменные окружения
cp .env.example .env
# → Отредактируй .env (см. раздел ниже)

# 4. Примени миграции в Supabase (в порядке имён файлов)
# Выполни SQL-файлы из supabase/migrations/ в Supabase SQL Editor

# 5. Запусти в dev-режиме
npm run dev
```

Открой [http://localhost:3000/admin](http://localhost:3000/admin).

---

## Переменные окружения

Скопируй `.env.example` → `.env` и заполни все поля:

```env
# ── Supabase ───────────────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...          # Только серверный, никогда не в браузер

# ── HH.ru OAuth 2.0 ───────────────────────────────────────────────────────────
HH_CLIENT_ID=<your-hh-app-client-id>
HH_CLIENT_SECRET=<your-hh-app-client-secret>
# hh_access_token и hh_refresh_token хранятся в таблице app_settings (id=1)

# ── OpenRouter (LLM API) ───────────────────────────────────────────────────────
OPENROUTER_API_KEY=sk-or-...

# ── Upstash QStash (Очередь задач) ────────────────────────────────────────────
APP_URL=https://your-project.vercel.app   # Публичный URL для QStash callback
QSTASH_TOKEN=<your-qstash-token>
QSTASH_CURRENT_SIGNING_KEY=sig_...
QSTASH_NEXT_SIGNING_KEY=sig_...
```

> **Безопасность:** `SUPABASE_SERVICE_ROLE_KEY` используется только на сервере. Он даёт полный обход Row Level Security — никогда не передавай его в клиентский код.

---

## Архитектура

### Общая схема

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js 16 App                           │
│                                                                 │
│  ┌──────────────┐    ┌─────────────────┐    ┌───────────────┐  │
│  │  Admin UI    │    │   API Routes    │    │Server Actions │  │
│  │  (Client     │    │  (Edge-compat)  │    │  (Server-     │  │
│  │  Components) │    │                 │    │  only funcs)  │  │
│  └──────┬───────┘    └────────┬────────┘    └───────┬───────┘  │
│         │                    │                      │           │
└─────────┼────────────────────┼──────────────────────┼──────────┘
          │                    │                      │
          ▼                    ▼                      ▼
   ┌─────────────┐    ┌────────────────┐    ┌────────────────┐
   │  Supabase   │    │  QStash Queue  │    │  HH.ru API     │
   │ (PostgreSQL)│    │  (Upstash)     │    │  (OAuth 2.0)   │
   └─────────────┘    └────────┬───────┘    └────────────────┘
                               │
              ┌────────────────┼─────────────────┐
              ▼                                   ▼
   ┌─────────────────────┐           ┌─────────────────────┐
   │ /api/queue/score    │           │ /api/queue/message  │
   │ LLM Scoring Job     │           │ Message Broadcast   │
   └────────┬────────────┘           └──────────┬──────────┘
            │                                   │
            ▼                                   ▼
   ┌─────────────────────┐           ┌─────────────────────┐
   │  OpenRouter API     │           │  HH.ru Messages API │
   │  (GPT-4o-mini)      │           │  (sendMessage)      │
   └─────────────────────┘           └─────────────────────┘
```

### Пайплайн скоринга

```
Cron (каждые N минут) или кнопка "Sync"
    ↓
POST /api/sync-hh
    ↓  (синхронизирует отклики из HH.ru → candidates table)
triggerScoringJob()  →  QStash публикует job
    ↓  (задержка 0s)
POST /api/queue/score  [verifySignatureAppRouter]
    ↓
runScoringPipeline()
    ├─ Читает app_settings (промпт + авто-отказ настройки)
    ├─ getValidAccessToken()  →  обновляет OAuth токен если нужно
    ├─ Берёт batch из 5 кандидатов (status=pending или error<3)
    └─ Для каждого:
         ├─ anonymizeCandidateData()  →  убирает ПДн перед отправкой
         ├─ POST OpenRouter/GPT-4o-mini
         ├─ Парсит JSON: score, summary, tech_skills, soft_skills,
         │              experience_match, interview_questions[3]
         ├─ Если авто-отказ включён и score < threshold:
         │    └─ hhService.rejectCandidate()  →  status='rejected'
         └─ UPDATE candidates SET status='scored', score=..., ...
```

### Пайплайн рассылки

```
HR выбирает кандидатов → вводит текст → нажимает "Send"
    ↓
startBroadcast(ids[], customMessage)  [Server Action]
    ├─ UPDATE candidates SET message_status='queued' WHERE id IN (...)
    └─ Цикл: для каждого id, delay = index * 5 секунд
         └─ triggerMessageJob(id, msg, delay)  →  QStash
                ↓  (каждые 5s, сериализованно)
         POST /api/queue/message  [verifySignatureAppRouter]
             ├─ Читает кандидата из БД
             ├─ Если customMessage — использует его
             │  Иначе — формирует текст из interview_questions
             ├─ hhService.sendMessage(negotiationId, text)
             └─ UPDATE message_status = 'sent' | 'failed'
                  ⚠️ Всегда возвращает 200 — иначе QStash повторит
                     и кандидат получит дублированное сообщение
```

---

## Функциональность

### 🎯 AI-оценка кандидатов (Scoring Pipeline)

Каждый кандидат оценивается по **4 критериям** одновременно:

| Критерий | Поле в БД | Описание |
|---|---|---|
| Общий балл | `score` | Итоговая оценка 0-100 |
| Технические навыки | `score_tech` | Соответствие технических компетенций |
| Soft skills | `score_soft` | Коммуникация, командная работа, отношение |
| Соответствие опыта | `score_exp` | Релевантность прошлого опыта вакансии |

**Дополнительно:** LLM генерирует ровно **3 персонализированных вопроса** для интервью, нацеленных на слабые места кандидата. Вопросы хранятся в JSONB-колонке `interview_questions`.

**Защита от галлюцинаций:** Если LLM возвращает неполный JSON или не те типы — кандидат помечается `error`, `retry_count` увеличивается. После 3 попыток — `fatal_error`.

### 🔒 Защита персональных данных (PII Anonymization)

**До** отправки данных в OpenRouter вызывается `anonymizeCandidateData()`:
- Удаляет ФИО, email, телефон, ссылки на соцсети из резюме
- Маскирует контактные данные в переписке
- Данные в базе данных **никогда не изменяются** — только транзитная копия анонимизируется

Это обеспечивает соответствие **152-ФЗ** и **GDPR** при работе с иностранными LLM-провайдерами.

### 🔄 OAuth 2.0 Token Manager

Автоматическое управление жизненным циклом токена HH.ru:

```
getValidAccessToken()
    ├─ Читает token + expires_at из app_settings
    ├─ Если expires_at - 5min > now  →  возвращает текущий токен
    └─ Иначе  →  POST /token с refresh_token
                  ├─ Обновляет access_token + refresh_token в БД
                  │  ⚠️ Если запись в БД упала — бросает ошибку
                  │     (HH.ru ротирует refresh-токены, потеря = навсегда)
                  └─ Возвращает новый access_token
```

### 🚫 Авто-отказы (Auto-Rejection)

Настраивается через Admin Dashboard → Settings:

- **Переключатель** включения/выключения
- **Ползунок порога** (0–100, шаг 1)
- При `score < threshold` → `PUT /negotiations/discard_by_employer/{id}`
- Если HH.ru вернул ошибку — логируется предупреждение, кандидат всё равно помечается `rejected` в нашей БД

### 📨 Массовая рассылка (Bulk Broadcast)

- HR выбирает произвольный набор кандидатов через чекбоксы
- Опциональный кастомный текст (если пусто — используются вопросы для интервью)
- Задачи ставятся в очередь с **интервалом 5 секунд** между каждым кандидатом — соблюдение лимитов HH.ru API
- Live-трекер прогресса обновляется каждые 3 секунды, останавливается когда очередь пустеет

### 📊 Admin Dashboard

**Таблица кандидатов:**
- Серверная пагинация (50 строк на страницу)
- Фильтрация по 4 score-критериям через URL-параметры
- Чекбоксы для массовых операций с indeterminate-состоянием "выбрать все"
- Выделенные строки подсвечиваются фоном
- Значок статуса рассылки (⏳ / ✅ / ❌) рядом с ID кандидата

**Развёрнутая карточка кандидата:**
- Прогресс-бары технических/soft/experience оценок с анимацией
- Пронумерованный список вопросов для интервью с индиго-карточками
- Graceful degradation для старых записей (до обновления)

**Live Broadcast Tracker:**
- Виджет появляется только при активной рассылке
- Показывает `N remaining...` + счётчики `sent` / `failed` за сегодня
- Автоматически останавливает поллинг при пустой очереди

**Settings:**
- Редактирование системного промпта через встроенный редактор
- Управление авто-отказами (toggle + range-инпут, отключается при выключенном toggle)
- Янтарное предупреждение об необратимости действия при включённом авто-отказе

---

## API Эндпоинты

### Публичные (защищены middleware)

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/admin` | Admin Dashboard |
| `GET` | `/admin/settings` | Страница настроек |
| `GET` | `/login` | Страница авторизации |

### Internal API Routes

| Метод | Путь | Описание |
|---|---|---|
| `GET/POST` | `/api/sync-hh` | Cron endpoint: синхронизация откликов + публикация scoring job |
| `POST` | `/api/queue/score` | QStash receiver: запуск LLM scoring pipeline |
| `POST` | `/api/queue/message` | QStash receiver: отправка сообщения кандидату |

> `/api/queue/*` защищены криптографической подписью Upstash QStash через `verifySignatureAppRouter`. Прямые вызовы без валидной подписи получают `401 Unauthorized`.

### Server Actions

| Функция | Файл | Описание |
|---|---|---|
| `startBroadcast()` | `app/actions/broadcast.ts` | Запуск массовой рассылки |
| `getBroadcastStats()` | `app/actions/getBroadcastStats.ts` | Статистика рассылки (для поллинга) |
| `getSettings()` | `app/actions/settings.ts` | Чтение настроек системы |
| `updateSystemSettings()` | `app/actions/settings.ts` | Сохранение настроек |
| `updateCandidateStatus()` | `app/actions/candidates.ts` | Ручное изменение статуса |

---

## База данных

### `candidates`

```sql
id                  UUID        PK
hh_negotiation_id   TEXT        ID отклика на HH.ru
status              TEXT        pending|processing|scored|rejected|error|fatal_error
score               INTEGER     Общий балл 0-100
score_tech          INTEGER     Технические навыки 0-100
score_soft          INTEGER     Soft skills 0-100
score_exp           INTEGER     Соответствие опыта 0-100
summary             TEXT        Текстовая оценка от LLM
interview_questions JSONB       Массив из 3 строк
message_status      TEXT        queued|sent|failed|null
raw_cv_data         JSONB       Сырые данные резюме с HH.ru
raw_chat_history    JSONB       История переписки
retry_count         INTEGER     Счётчик попыток (max 3 → fatal_error)
prompt_id           INTEGER     FK → prompts.id
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ
```

### `app_settings` (одна строка, id = 1)

```sql
id                    INTEGER     PK = 1
hh_access_token       TEXT        Текущий OAuth access token
hh_refresh_token      TEXT        Refresh token для обновления
hh_token_expires_at   TIMESTAMPTZ Время истечения токена
active_prompt_id      INTEGER     FK → prompts.id
auto_reject_enabled   BOOLEAN     Вкл/выкл авто-отказов
auto_reject_threshold INTEGER     Порог балла (0-100)
```

### `prompts`

```sql
id          INTEGER     PK
name        TEXT        Название профиля оценки
prompt_text TEXT        Системный промпт для LLM
created_at  TIMESTAMPTZ
```

### `system_logs`

```sql
id          UUID        PK
level       TEXT        info|warning|error
message     TEXT        Описание события
details     JSONB       Дополнительные данные
created_at  TIMESTAMPTZ
```

### Миграции

Все миграции в `supabase/migrations/`, формат `YYYYMMDD_name.sql`:

| Файл | Содержимое |
|---|---|
| `20260529_oauth_tokens.sql` | `hh_refresh_token`, `hh_token_expires_at` в `app_settings` |
| `20260529_multi_criteria.sql` | `score_tech`, `score_soft`, `score_exp` в `candidates` |
| `20260529_auto_reject.sql` | `auto_reject_enabled`, `auto_reject_threshold` в `app_settings` |
| `20260529_interview_questions.sql` | `interview_questions` JSONB в `candidates` |
| `20260529_message_status.sql` | `message_status` в `candidates` |

> Все миграции **идемпотентны** — используют `ADD COLUMN IF NOT EXISTS`.

---

## Структура проекта

```
.
├── app/
│   ├── admin/
│   │   ├── page.tsx              # Server Component. Пагинация, фильтры (await searchParams)
│   │   ├── layout.tsx            # Layout для /admin
│   │   ├── CandidateTable.tsx    # Client. Чекбоксы, toolbar, broadcast, трекер
│   │   ├── CandidateRow.tsx      # Client. Expand/collapse, score bars, вопросы
│   │   ├── CandidateFilters.tsx  # Client. Форма фильтров + пагинация
│   │   ├── CandidateActionButton.tsx  # Client. Кнопка изменения статуса
│   │   └── BroadcastTracker.tsx  # Client. Поллинг каждые 3s, auto-stop
│   ├── actions/
│   │   ├── broadcast.ts          # startBroadcast() — bulk update + QStash loop
│   │   ├── getBroadcastStats.ts  # getBroadcastStats() — 3x параллельных COUNT
│   │   ├── candidates.ts         # updateCandidateStatus()
│   │   └── settings.ts           # getSettings(), updateSystemSettings()
│   ├── api/
│   │   ├── sync-hh/route.ts      # Cron: синхронизация + publish scoring job
│   │   └── queue/
│   │       ├── score/route.ts    # QStash receiver: скоринг (500=retry ok)
│   │       └── message/route.ts  # QStash receiver: рассылка (200=no retry!)
│   ├── login/page.tsx            # Страница входа
│   ├── layout.tsx                # Root layout
│   └── globals.css
│
├── lib/
│   ├── hh/
│   │   ├── apiClient.ts          # HhApiService: все методы HH.ru API
│   │   └── tokenManager.ts       # getValidAccessToken() + auto-refresh
│   ├── scoring/
│   │   └── scoringService.ts     # runScoringPipeline() — весь LLM flow
│   ├── queue/
│   │   └── qstashClient.ts       # triggerScoringJob(), triggerMessageJob()
│   ├── security/
│   │   └── anonymizer.ts         # anonymizeCandidateData() — удаление ПДн
│   ├── supabase/
│   │   └── adminClient.ts        # supabaseAdmin (service role)
│   ├── sync/
│   │   └── syncService.ts        # runSyncNew() — синхронизация откликов
│   └── utils/
│       └── sleep.ts              # sleep(ms) для backoff
│
├── supabase/
│   └── migrations/               # SQL-миграции (идемпотентные)
│
├── middleware.ts                 # Защита /admin маршрутов
├── .env.example                  # Шаблон переменных окружения
├── plan.md                       # Технический roadmap + AI meta-prompt
└── package.json
```

---

## Дорожная карта

### ✅ Реализовано (MVP 0.5 + MVP 0.6)

- [x] **Синхронизация откликов** с HH.ru API
- [x] **AI-оценка** по 4 критериям (GPT-4o-mini via OpenRouter)
- [x] **Генерация вопросов** для интервью (3 персонализированных вопроса)
- [x] **Защита ПДн** — анонимизация резюме перед отправкой в LLM
- [x] **OAuth 2.0** — автоматическое обновление токена HH.ru
- [x] **Async pipeline** — Upstash QStash вместо синхронных Vercel функций
- [x] **Авто-отказы** — автоматическое отклонение слабых кандидатов через API
- [x] **Массовая рассылка** — сериализованная очередь сообщений (5s интервал)
- [x] **Live tracker** — виджет прогресса рассылки с поллингом
- [x] **Admin Dashboard** — пагинация, фильтры, чекбоксы, expand/collapse карточки
- [x] **Settings UI** — управление промптами и авто-отказами
- [x] **Retry logic** — до 3 попыток скоринга, потом `fatal_error`
- [x] **Structured logging** — все события в `system_logs`

### 🚧 В разработке (MVP 0.7)

- [ ] **Историчность оценок** — таблица `candidate_evaluations` (one-to-many)
  - Возможность прогнать кандидата через несколько профилей оценки
  - История всех оценок без перезаписи
- [ ] **Многопользовательская авторизация**
  - Таблица `users`, bcrypt для паролей
  - JWT-куки через `jose`
  - Роли: Admin, HR (read-only)

### 📋 Backlog (MVP 0.8+)

- [ ] **Профили оценки** — редизайн промптов как «карточек», не textarea
- [ ] **Расширенный поиск** — по имени кандидата, дате, использованному промпту
- [ ] **Автогенерация типов БД** — `supabase gen types typescript`
- [ ] **Шифрование токенов** — `pgcrypto` для `hh_access_token` в БД
- [ ] **Webhook вместо поллинга** — Supabase Realtime для live-трекера
- [ ] **Локализация** — полный перевод UI на русский язык
- [ ] **Экспорт** — выгрузка списка кандидатов в CSV/Excel
- [ ] **Аналитика** — дашборд с метриками воронки найма

---

## Технические детали

### Почему QStash, а не Vercel Cron?

Vercel Serverless Functions имеют **лимит 10 секунд** на исполнение. Один LLM-запрос занимает 3–8 секунд. Батч из 5 кандидатов = 15–40 секунд → timeout.

QStash решает это: `/api/sync-hh` мгновенно публикует job и завершается. QStash самостоятельно вызывает `/api/queue/score` уже без ограничений по времени (точнее, с лимитом Vercel Pro = 60s или 300s на функцию).

### Почему `/api/queue/message` всегда возвращает 200?

QStash повторяет задачу при получении `4xx`/`5xx`. Для скоринга это правильно — если OpenRouter упал, повтор через 30 секунд имеет смысл.

Для рассылки сообщений — **нет**. Если HH.ru вернул `403 Forbidden` (кандидат заблокировал сообщения от работодателя), повтор через 30 секунд даст тот же 403. А если HH.ru вернул `200`, то повтор отправит сообщение **дважды**. Поэтому мы всегда отвечаем `200` и управляем ошибками через `message_status = 'failed'` в БД.

### QStash `delay` типизация

Upstash SDK типизирует поле `delay` как `` `${bigint}s` ``, а не `string`. При попытке передать `` `${number}s` `` TypeScript выдаёт ошибку. Правильно:

```typescript
delay: `${BigInt(Math.trunc(delaySeconds))}s`
```

### `candidate.id` — это UUID строка

Supabase возвращает UUID как `string`. Никогда не кастуй `candidate.id` в `number` — это тихо сломает все запросы к БД.

---

## Лицензия

MIT

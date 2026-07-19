# MC-AFK Bot Panel Developer Onboarding Guide

## 1. System Overview

This repository is a full-stack Node.js system that combines:

- a web dashboard and REST API for managing Minecraft AFK bot servers,
- a Telegram bot for user interaction and server management,
- per-project child Node processes that actually run the Minecraft AFK bot logic,
- MongoDB for persistent metadata,
- filesystem storage for per-project logs, events, and Telegram-related JSON state.

The system is not a single monolithic app. It is a split runtime architecture:

1. Web/API runtime: `server.js` starts an Express server and serves the HTML/CSS/JS frontend plus the REST API.
2. Telegram bot runtime: `telegram_bot.js` starts `node-telegram-bot-api` in polling mode.
3. Per-project runner: `api/api.js` launches one child Node process per server instance from the `projects/<projectId>/index.js` template.

The website and Telegram bot share the same backend logic in `api/` and the same MongoDB database. They do not share a common process and do not share a real-time transport; the integration is mostly via REST calls and direct Telegram Bot API calls.

---

## 2. Architecture Diagram

```mermaid
flowchart LR
    User[Website User] --> Web[Express Web Frontend\nserver.js]
    TelegramUser[Telegram User] --> Bot[Telegram Bot\ntelegram_bot.js + bot/index.js]

    Web --> API[REST API\napi/routes.js]
    Bot --> API

    API --> Services[Business Logic\napi/api.js]
    Services --> Mongo[(MongoDB\nMongoose)]
    Services --> FS[(File System\ndata/, projects/, templates/)]

    Services --> Runner[Child Process per Project\nspawn('node', ['index.js'])]
    Runner --> MC[Minecraft server / AFK Bot runtime]

    Bot --> TG[Telegram Bot API]
    API --> Notify[Notification + Error pipeline]
    Notify --> TG
```

---

## 3. Folder Structure Explanation

- `server.js`: main Express web server entry point.
- `telegram_bot.js`: Telegram bot process entry point.
- `api/`: REST API, JWT/auth, DB connection, Mongoose models, and business logic.
- `bot/`: Telegram bot command/router/keyboard/session handlers.
- `public/`: static website pages and vanilla JavaScript UI.
- `templates/`: Java and Bedrock project templates copied into `projects/<projectId>` when a server is created.
- `projects/`: runtime project directories created per server instance.
- `data/`: persistent JSON and logs for TG users, tickets, group chat registration, event logs, and player state.
- `notifications/`: notification persistence service for error alerts.
- `errors/`: error classification helpers.
- `mc-status-bot/`: a separate, newer Telegraf/Prisma-based status bot subproject. It appears to be a parallel prototype or secondary system, not the main active runtime used by the root app.

---

## 4. Backend Documentation

### Server framework

The main web server uses Express 5.x.

Key functions:

- `app.use(express.json())` and `app.use(express.urlencoded())`
- CORS middleware with `Access-Control-Allow-Origin: *`
- static file serving from `public/`
- route mounting under `/api`
- HTML serving for `/`, `/create`, `/edit`, `/auth/login`, `/auth/signup`

### API routes

Routes are registered in `api/routes.js` and cover:

- auth: `/api/auth/signup`, `/api/auth/login`, `/api/auth/verify`
- projects: `/api/projects`, `/api/projects/:id/start`, `/api/projects/:id/stop`, `/api/projects/:id`, `/api/projects/:id/status`, `/api/projects/:id/logs`, `/api/projects/:id/events`, `/api/projects/:id/players`
- global events and versions: `/api/events`, `/api/versions`
- notifications: `/api/notifications`, `/api/notifications/:id/read`, `/api/notifications/read-all`, `/api/notifications/:id`, `/api/notifications/test`

### Business logic

All core service logic lives in `api/api.js`.

Important responsibilities:

- `createUser()` and `authenticateUser()`
- `createServer()`, `updateServer()`, `deleteServer()`
- `startServer()`, `stopServer()`, `getServerStatus()`
- `listServers()`, `getServerLogs()`, `getServerEvents()`, `getAllEvents()`
- `initialize()` to reset stale state and create required filesystem folders
- `spawn()` to create per-project child processes
- `appendEvent()` to persist lifecycle lines into `data/events/<projectId>.log`
- `saveNotification()` to write structured error notifications into MongoDB

### Authentication and authorization

- Authentication is JWT-based.
- `authenticate()` in `api/routes.js` extracts `Authorization: Bearer <token>` and runs `verifyToken()`.
- JWT is signed using `JWT_SECRET`.
- Ownership checks are enforced by comparing `project.owner` to the authenticated username.
- Admin authorization is derived from `ADMIN_USERNAME`.

### Database communication

- MongoDB connection is created in `api/db.js` using Mongoose.
- models live in `api/models/`:
  - `User.js`
  - `Project.js`
  - `Notification.js`
- The app relies on MongoDB as the system of record for users, projects, and notifications.

### File-backed state

Several parts of the system intentionally use lightweight JSON and logs on disk instead of MongoDB:

- `data/tg_users.json`: Telegram-to-panel credentials mapping
- `data/tickets.json`: support ticket storage
- `data/known_users.json`: tracked Telegram users
- `data/group_chats.json`: group chat registrations for announcements
- `data/players/<projectId>.json`: player list snapshots
- `data/logs/<projectId>.log`: stdout/stderr logs
- `data/events/<projectId>.log`: lifecycle event logs

This means the system is hybrid: MongoDB for authoritative structured metadata, filesystem for operational logs and lightweight bot state.

---

## 5. Frontend Documentation

### Frontend framework

The website is not built with React/Vue/Angular. It is a static HTML/CSS/JS application served by Express.

The `vite.config.ts` file includes React and Tailwind Vite plugins, but the actual UI in `public/` is plain DOM scripting and direct `fetch()` calls. The root app is therefore a vanilla frontend, not a modern component framework.

### Pages

- `/`: dashboard page
- `/create`: server creation page
- `/edit`: server edit page
- `/auth/login`: login page
- `/auth/signup`: signup page

### UI architecture

- `public/index.html`: main dashboard and server list
- `public/create.html`: server creation form
- `public/edit.html`: edit form
- `public/auth/login.html` and `public/auth/signup.html`: auth pages
- static CSS lives in `public/*.css`

### State management

Frontend state is simple and browser-local:

- `localStorage.token` stores the JWT for web app use
- DOM state is used for rendering server cards, events, logs, popups
- `localStorage.popupsEnabled` toggles notification popups

### User interactions

The website:

- redirects unauthenticated users to `/auth/login.html`
- fetches `/api/projects` to render the dashboard
- starts, stops, and deletes servers via POST/DELETE requests
- reads log and event tails via GET endpoints
- opens an edit modal for server mutation

### Authentication flow

1. User logs in via `/api/auth/login`.
2. Server returns a JWT token.
3. Browser stores token in `localStorage`.
4. Subsequent API calls use `Authorization: Bearer <token>`.
5. `/api/auth/verify` confirms freshness.

### Full user journey

User opens website → Express serves the HTML page from `public/` → browser loads static assets → user enters credentials → login page POSTs to `/api/auth/login` → backend verifies password via Mongoose `User` model and returns JWT → browser stores it locally → dashboard calls `/api/projects` with the token → backend queries MongoDB and returns project list → the DOM renders cards/logs/events → user starts/stops or edits a server → frontend calls `/api/projects/:id/start`, `/api/projects/:id/stop`, or `/api/projects/:id` → backend updates the child process and MongoDB record → front-end re-fetches or updates the UI state.

---

## 6. Telegram Bot Documentation

### Bot framework

The active bot uses `node-telegram-bot-api` and long polling.

Main bot initialization happens in:

- `telegram_bot.js`
- `bot/index.js`
- `bot/router.js`
- `bot/commands.js`

### Bot initialization

- `bot/config.js` loads `TELEGRAM_BOT_TOKEN` from `.env`.
- `bot/index.js` creates `new TelegramBot(TOKEN, { polling: { params: { allowed_updates: ... }}})`.
- `bot/router.js` registers `message`, `callback_query`, `my_chat_member`, and `chat_member` handlers.
- `connectDB()` is called on startup so bot actions can use shared MongoDB state.

### Update handling model

The bot uses a stateful route pattern with:

- `bot.onText(/pattern/, handler)` for commands
- `bot.on('callback_query', handler)` for inline button actions
- `bot.on('my_chat_member', handler)` for group add/remove events
- `sess.state` and `sess.draft` in `bot/session.js` to track multi-step flows

### Session model

Each Telegram chat gets a session object in-memory:

- `token`
- `username`
- `state`
- `draft`
- `lastMsgId`

This allows the bot to preserve command/wizard progression across messages without an external session store.

### Commands

#### /start
- Purpose: start the bot, auto-authenticate the Telegram user, and show the main menu.
- Who can use it: any Telegram user in private chat; groups are registered but not shown a private menu.
- Files involved: `bot/commands.js`, `bot/auth.js`, `bot/handlers/menu.js`, `bot/store.js`
- Execution flow: user sends `/start` → `ensureTelegramAuth()` auto-creates or logs in a `tg_<chatId>` account → `sendMenu()` returns the inline keyboard main menu.
- Database/API interaction: calls `/api/auth/signup` and `/api/auth/login` behind the scenes.
- Response: main menu with server management buttons.
- Errors: failed signup/login, expired token, missing API.

#### /menu
- Purpose: re-open the main menu.
- Who can use it: any authenticated private chat user.
- Files involved: `bot/commands.js`, `bot/handlers/menu.js`, `bot/auth.js`
- Execution flow: clear state, verify token, render menu.
- Database/API interaction: `GET /auth/verify` via `ensureTelegramAuth()`.
- Response: menu text and keyboard.
- Errors: auth failure, API outage.

#### /help
- Purpose: show help text and supported commands.
- Who can use it: all users in private chat.
- Files involved: `bot/commands.js`, `bot/handlers/menu.js`
- Execution flow: message triggers `handleHelp()`.
- Database/API interaction: none.
- Response: formatted help text.
- Errors: none beyond formatting issues.

#### /edit [projectId]
- Purpose: open the Telegram mini app edit screen for a project.
- Who can use it: authenticated user.
- Files involved: `bot/commands.js`, `bot/handlers/servers.js`, `bot/keyboards.js`
- Execution flow: ensure auth → if project ID omitted, list owned servers → call `handleEditServer()`.
- Database/API interaction: `GET /api/projects/:id/status`.
- Response: button with a `web_app` URL that launches the edit mini app.
- Errors: invalid project, unauthorized user, token expiry.

### Callback query flows

The bot heavily uses inline keyboards with `callback_data` values such as:

- `list_servers`
- `create_server`
- `srvinfo_<id>`
- `srvstart_<id>`
- `srvstop_<id>`
- `srvdel_<id>`
- `srvlogs_<id>`
- `srvevents_<id>`
- `srvplayers_<id>`
- `support_new`
- `admin_panel`
- `admin_support`

The router in `bot/router.js` dispatches these callback actions to the correct handler.

### Inline keyboards and web app

The Telegram bot uses inline keyboards for all navigation. The edit and create flow uses Telegram `web_app` buttons that point to the website URLs. The hardcoded `http://localhost:4000/...` URLs in `bot/keyboards.js` and `bot/handlers/create.js` are a major deployment risk because they bind the bot to localhost rather than the production domain.

### Conversation flows

The bot uses a state machine in `sess.state` for multi-step wizards:

- server creation wizard
- support request wizard
- admin broadcast wizard
- admin version add/delete wizard

### Admin commands and permissions

Admin rights are not backed by a real role model in MongoDB. They are effectively derived from a username match against `ADMIN_USERNAME` in the bot runtime.

Admin capabilities include:

- admin panel access
- global server list
- user tracking view
- broadcast to all tracked Telegram users
- support ticket management
- version list management

### Permission system

- Bot-side admin check: `sess.username === ADMIN_USERNAME`
- API-side ownership check: project owner must match `req.user.username`
- The admin user may be created from `ADMIN_USERNAME` and `ADMIN_PASSWORD` on startup.

This is workable for small deployments but has limited role granularity.

---

## 7. Website + Telegram Bot Connection

### Shared database usage

Both systems use the same MongoDB database:

- `User` records
- `Project` records
- `Notification` records

### Shared APIs

The bot does not call internal modules directly in a clean domain layer. It calls the public REST API using the `bot/api.js` helper to send requests such as:

- `/api/auth/login`
- `/api/auth/signup`
- `/api/auth/verify`
- `/api/projects`
- `/api/projects/:id/start`
- `/api/projects/:id/stop`
- `/api/projects/:id/logs`
- `/api/projects/:id/events`
- `/api/projects/:id/players`

### Authentication between systems

The Telegram bot authenticates to the web backend by:

- auto-creating a `tg_<chatId>` user
- logging in with the generated password
- storing the JWT in memory session
- reusing the token for future API requests

The backend trusts a request header named `x-telegram-bot-token` for special bot-driven password overwrite operations.

### User identity linking

Telegram identity is linked to a web user through the username pattern:

- web username: `tg_<chatId>`
- Telegram chat id: the numeric chat id from Telegram

This creates a stable mapping but does not use a separate user profile table with a foreign key or explicit user-link model.

### Telegram ID handling

The bot stores:

- `tg_users.json`: chatId → username/password pair
- `known_users.json`: chatId → username for admin/broadcast tracking
- `sessions` Map in memory: chatId → session object

### Webhooks or polling

The active bot uses polling, not webhooks.

This means:

- the process continuously polls Telegram for new updates,
- it is stateful and always on,
- it is less scalable for very large bot usage than webhook-driven event ingestion.

### Shared services and synchronization

The most important integration points are:

- Project creation from the web UI and Telegram bot both result in a `Project` document in MongoDB.
- Notification and error classification are shared in backend logic.
- Some Telegram actions directly write to the same `data/` files used by the website runtime.

### Complete data flow

1. A user logs into the website or Telegram bot.
2. The backend creates or authenticates a corresponding `User` in MongoDB.
3. The user creates a server project through the website or the bot wizard.
4. `api/api.js` writes `Project` metadata to MongoDB and copies the appropriate template into `projects/<projectId>`.
5. Starting a project spawns a child process that runs the AFK bot code.
6. The child process emits logs and events to filesystem.
7. These logs are aggregated into the dashboard and Telegram bot screens.
8. Errors are classified and transformed into notifications stored in MongoDB and pushed to the Telegram user via the notification service.

---

## 8. Database Documentation

### Existing database system

There is a MongoDB-backed data store using Mongoose.

### Models and schemas

#### `User`
Fields:

- `username` unique
- `passwordHash`
- `projects` array of project IDs
- `createdAt`

Purpose:

- authentication and ownership mapping
- per-user server ownership

#### `Project`
Fields:

- `projectId` unique
- `host`, `port`, `version`, `type`
- `status`, `owner`
- `movementInterval`, `reconnectHours`, `usernameFile`, `actions`
- `createdAt`, `startedAt`, `stoppedAt`

Purpose:

- persistent server metadata
- authoritative status record for the dashboard and bot

#### `Notification`
Fields:

- `projectId`, `userId`
- `errorCode`, `title`, `message`, `suggestion`, `severity`
- `rawError`, `isRead`, `createdAt`

Purpose:

- structured error notifications for dashboard and Telegram

### Relationships

This is a very lightweight relational model:

- `User.projects[]` holds the list of child project IDs.
- `Project.owner` points back to the owning username.
- There is no normalized role table or explicit foreign-key enforcement beyond the string references.

### Query patterns

The hot queries are primarily:

- find a `User` by username for login
- find a `Project` by `projectId`
- find all projects for a particular owner
- find all projects for admin listing
- find notifications by `userId` and unread flag

### What data is created, changed, deleted

Created:

- `User` on signup or auto-registration
- `Project` on server creation
- `Notification` on runtime errors

Changed:

- `Project.status` and timestamps during start/stop events
- `User.projects` when a project is created or deleted
- `Notification.isRead` when a user reads or dismisses notifications
- version lists stored in JSON and editable by admin commands

Deleted:

- `Project` when the user deletes a server
- `User.projects[]` membership when the project is deleted
- some log/event files on stop/delete

---

## 9. API Documentation

### Main API surface

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/verify`
- `POST /api/projects`
- `GET /api/projects`
- `POST /api/projects/:id/start`
- `POST /api/projects/:id/stop`
- `DELETE /api/projects/:id`
- `PUT /api/projects/:id`
- `GET /api/projects/:id/status`
- `GET /api/projects/:id/logs`
- `GET /api/projects/:id/events`
- `GET /api/projects/:id/players`
- `GET /api/events`
- `GET /api/versions`
- `GET /api/notifications`
- `PATCH /api/notifications/:id/read`
- `PATCH /api/notifications/read-all`
- `DELETE /api/notifications/:id`
- `POST /api/notifications/test`

### Authentication expectations

The API expects a bearer token for most protected calls.

### Response shape

Most endpoints return JSON like:

```json
{
  "success": true,
  "message": "...",
  "projects": { ... }
}
```

Error responses usually return:

```json
{
  "success": false,
  "error": "..."
}
```

---

## 10. Deployment Process

Current deployment shape:

1. Ensure Node.js 18+ and MongoDB are available.
2. Set environment variables such as `JWT_SECRET`, `MONGODB_URI`, `TELEGRAM_BOT_TOKEN`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
3. Run `npm install` in the root project.
4. Run `npm start` to launch the website/API runtime.
5. Run `npm run bot` or `node telegram_bot.js` to launch the Telegram bot runtime.

Operational notes:

- the website and bot are separate runtime processes;
- there is no process manager or Docker setup in the root app;
- no CI/CD pipeline is shown in the repository root;
- no deployment manifests or Helm/K8s files were found.

---

## 11. Development Workflow

Typical development flow:

1. Edit code under `api/`, `bot/`, or `public/`.
2. Run the website via `npm start`.
3. Run the bot via `npm run bot`.
4. Use MongoDB locally or on a hosted instance.
5. Use the filesystem-backed `data/` directory for logs and state during development.
6. Validate with manual browser and Telegram interaction flows.

Recommended senior-dev onboarding tasks:

- start the Express server and inspect `/api/projects` flow,
- confirm the Telegram bot auto-auth flow with a real Telegram account,
- inspect the project spawn lifecycle in `api/api.js`,
- exercise log/event retrieval via the dashboard.

---

## 12. Known Issues

1. Hardcoded `http://localhost:4000` web app URLs in Telegram keyboard code.
2. Mixed runtime model: website and bot are separate processes, so deployment and restart coordination are manual.
3. Root app relies on local filesystem JSON state (`tg_users.json`, `tickets.json`, `known_users.json`) in addition to MongoDB.
4. LocalStorage JWT storage is exposed to XSS risk.
5. Telegram credentials are sent to the user after auto-registration, which is convenient but sensitive.
6. Bot admin authorization is a username string check, not a proper RBAC or DB-backed role system.
7. No persistent queueing for long-running or high-volume operations.
8. No obvious CI or production monitoring scaffolding beyond console logs.

---

## 13. Future Improvements

Recommended roadmap:

- move the frontend to a real framework or at least a structured JS module architecture,
- replace localStorage JWT storage with an HttpOnly cookie pattern or secure token exchange,
- add database-backed RBAC for admins and moderators,
- add a proper job worker/queue for heavy bot lifecycle operations,
- add Prometheus/OpenTelemetry monitoring and structured JSON logging,
- convert Telegram polling to webhook mode for production-scale deployments,
- unify the active bot runtime around one framework (preferably the newer `mc-status-bot` architecture or a clean single abstraction),
- add integration tests for signup/login, project lifecycle, and Telegram callback flows,
- add rate limiting to bot conversation handlers and bot-wide update throttling.

---

## 14. Production Readiness Summary

### Can it handle 100 users?

Possibly, if the MongoDB instance is healthy and the server is not overloaded by child process spawn behavior. The architecture is serviceable for a small deployment because the runtime is simple and mostly single-process for the web/API side.

### Can it handle 10,000 users?

Not safely in its current form.

The system would likely break first in these areas:

- Telegram polling bot scaling
- local file-based state writes and logs
- per-user child process management with no queue or worker pool
- naive in-memory session model for the bot
- lack of strong observability and rate limiting

### What needs caching?

- version lists and static version metadata
- server list results for dashboard browsing
- notifications retrieval when the same user repeatedly polls the UI
- player counts if the bot updates them frequently

### What needs queues/workers?

- high-volume bot lifecycle management
- notification fan-out
- background command execution for long-running operations

### What needs monitoring?

- process spawn failures
- DB connection health
- bot polling error rate
- child process exit codes
- notification save failure rate
- disk growth in `data/logs` and `data/events`

### What should be redesigned before scaling?

- web and bot should use a common service layer with a production-grade event bus
- bot session storage should be externalized
- admin roles should be DB-backed
- logging should be structured and rotated
- runtime should be containerized with a process manager
- the TLS/public URL strategy should be unified to remove hardcoded localhost references

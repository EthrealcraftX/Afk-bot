# Afk‑bot — Minecraft Server Manager

🔧 Qisqacha: Bu loyiha — oddiy Minecraft serverlarni yaratish, yoqish, o‘chirish va ularning loglari hamda voqealarini ko‘rish uchun web-panel.

---

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Features](#features)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Scripts & Commands](#scripts--commands)
- [Development](#development)
- [Project Roadmap](#project-roadmap)

---

## ⚡ Quick Start

### One-Command Startup

**Windows:**
```bash
start.bat
```

**Linux/macOS:**
```bash
chmod +x start.sh
./start.sh
```

### What the startup script does:
✅ Checks Node.js and npm installation  
✅ Verifies .env file exists (auto-creates template if missing)  
✅ Installs dependencies (if needed)  
✅ Validates all required environment variables  
✅ **Automatically opens browser** at `http://localhost:3000`  
✅ Starts Express server on port 3000

### Starting the Telegram Bot (separate terminal)

**Windows:**
```bash
bot.bat
```

**Linux/macOS:**
```bash
chmod +x bot.sh
./bot.sh
```

### First Run Setup:
1. Run the startup script (it will create `.env` if missing)
2. Edit `.env` file with your credentials:
   - `JWT_SECRET` — Any strong random string
   - `TELEGRAM_BOT_TOKEN` — From [@BotFather](https://t.me/botfather)
   - `MONGODB_URI` — From [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
3. Run the startup script again
4. Browser opens automatically at `http://localhost:3000`
5. Create an account and log in!

---

## ✨ Features

### 🌐 Web Dashboard
- **User Authentication** — Secure JWT-based login system
- **Server Management** — Create, start, stop, and delete Minecraft servers
- **Real-time Monitoring** — View server logs and player events in real-time
- **Multi-Server Support** — Manage multiple servers simultaneously
- **Server Templates** — Pre-configured Java & Bedrock templates
- **Player Tracking** — Monitor connected players and their actions
- **Event Logging** — Comprehensive event tracking with persistent storage

### 🤖 Telegram Bot Integration
- **Command-based Control** — Manage servers directly from Telegram
- **/start** — Initialize bot and view main menu
- **/menu** — Navigate server management options
- **/help** — Get help information
- **Group Announcements** — Auto-notify groups when new servers are created
- **Status Queries** — Get real-time server status and player counts
- **User Synchronization** — Link Telegram users with web panel accounts

### ⚙️ Server Automation
- **AFK Bot Management** — Automatically deploy AFK bots to keep players active
- **Configurable Intervals** — Set custom player movement intervals
- **Auto-Reconnect** — Configurable reconnection settings (default: 2 hours)
- **Java & Bedrock Support** — Works with both Minecraft editions
- **Dynamic Username Loading** — Support for multiple player usernames per server
- **Log Archival** — Persistent event and log storage

### 🔐 Security Features
- **Password Hashing** — bcryptjs for secure password storage
- **JWT Authentication** — 24-hour session tokens
- **Rate Limiting** — Built-in protection against brute-force attacks
- **CORS Support** — Secure cross-origin access for mobile and external apps
- **Admin Panel** — Restricted admin-only operations

---

## 📁 Project Structure

```
afk-bot/
├── api/                      # Express backend API
│   ├── api.js               # Core API logic (users, projects, servers)
│   ├── auth.js              # JWT authentication middleware
│   ├── db.js                # MongoDB connection
│   ├── routes.js            # API route handlers
│   └── models/
│       ├── User.js          # User schema
│       └── Project.js       # Project/Server schema
├── bot/                      # Telegram bot implementation
│   ├── index.js             # Bot entry point
│   ├── config.js            # Telegram config (TOKEN, API_URL)
│   ├── context.js           # Shared bot context
│   ├── commands.js          # Bot commands (/start, /menu, /help)
│   ├── router.js            # Telegram message routing
│   ├── session.js           # User session management
│   ├── auth.js              # Bot authentication logic
│   ├── keyboards.js         # Telegram keyboard layouts
│   ├── formatters.js        # Message formatting utilities
│   ├── store.js             # Data persistence
│   ├── ui.js                # UI components
│   ├── group_store.js       # Group chat management
│   ├── group_announce.js    # Group notifications
│   └── handlers/
│       ├── admin.js         # Admin commands
│       ├── create.js        # Server creation workflow
│       ├── group.js         # Group management
│       ├── menu.js          # Main menu
│       ├── servers.js       # Server management
│       └── support.js       # Support handlers
├── public/                   # Frontend static files
│   ├── index.html           # Dashboard landing page
│   ├── create.html          # Server creation page
│   ├── auth/
│   │   ├── login.html       # Login page
│   │   └── signup.html      # Registration page
│   ├── assets/              # Images, icons, etc.
│   └── styles.css           # Global styles
├── projects/                 # Active server instances
│   ├── project_1775317753413/
│   │   ├── config.json
│   │   ├── index.js         # Server process
│   │   ├── package.json
│   │   └── username.txt
│   └── ...
├── templates/                # Server templates
│   ├── java/
│   │   ├── index.js
│   │   ├── package.json
│   │   ├── version.json
│   │   └── usernames.txt
│   └── bedrock/
│       ├── index.js
│       ├── package.json
│       ├── version.json
│       └── username.txt
├── data/                     # Persistent data storage
│   ├── users.json           # User accounts
│   ├── projects.json        # Project metadata
│   ├── tg_users.json        # Telegram user mappings
│   ├── logs/                # Server logs
│   ├── events/              # Server events
│   └── players/             # Player tracking
├── scripts/                  # Utility scripts
│   ├── migrate-passwords.js
│   ├── rebuild-raknet.js
│   ├── test_log_lifecycle.js
│   └── http_events_test.js
├── tools/                    # Development tools
│   └── check_script_syntax.js
├── server.js                # Express server entry point
├── telegram_bot.js          # Telegram bot entry point
├── package.json             # Dependencies & scripts
├── vite.config.ts           # Vite build configuration
├── tsconfig.json            # TypeScript configuration
└── README.md                # This file
```

---

## Talablar
- Node.js 18+
- npm

---

## Loyihani ishga tushirish
1. Paketlarni o‘rnatish:
```bash
npm install
```
2. Muhit o‘zgaruvchilarini sozlash (masalan):
```bash
set JWT_SECRET=test
set PORT=5000
npm start
```
3. Brauzerda ochish: `http://localhost:5000` yoki siz ishlatayotgan tunneling URL orqali.

---

## Fayl tuzilmasi (muxtasar)
- `server.js` — Express server
- `public/` — frontend (HTML/CSS/JS va `assets/`)
- `api/` — backend routerlar
- `projects/`, `templates/` — bot kodlari
- `data/` — faylga yozilgan JSON maqomli ma'lumotlar

---

## Muhim API endpointlar
- `POST /api/auth/login` — login (token oladi)
- `GET /api/projects` — foydalanuvchi loyihalari
- `POST /api/projects/:id/start` — serverni yoqish
- `POST /api/projects/:id/stop` — serverni o‘chirish
- `GET /api/projects/:id/logs?lines=N` — server loglari
- `GET /api/projects/:id/events?lines=N` — per-project events (text)
- `GET /api/events?lines=N` — global events (text)

---

## Frontend eslatmalar
- Popup faqat lifecycle voqealarni ko‘rsatadi; reconnect-attempt xabarlari ham ko‘rinadi
- Popupni o‘chirish — `localStorage` orqali saqlanadi (`popupsEnabled`)
- `public/assets/favicon.ico` fayli favicon uchun

---

## Testlar va skriptlar
- `scripts/` papkasida bir nechta smoke/test skriptlar mavjud (masalan `scripts/event_smoke_test.js`).

---

## Troubleshooting tezkor maslahatlar
- Favicon ko‘rinmasa → brauzerni hard-refresh (Ctrl+F5) qiling yoki incognito oynada oching; to‘g‘ri URL: `/assets/favicon.ico`
- Agar tunnel orqali assetlar 404 qaytsa — server loglarini tekshiring va tunneling xizmatining forwarded port sozlamalarini ko‘rib chiqing
- JWT bilan 401 kasallanishida `JWT_SECRET` to‘g‘ri sozlanganligini tekshiring

---

## Taklif qilinadigan yaxshilanishlar
- Pollingni SSE/WebSocket bilan almashtirish (real-time push)
- Server-side event classification va log rotation
- Integration tests/CI qo‘shish

---

## Litsenziya
- ISC (package.json ga mos)

---

Agar xohlasangiz, inglizcha README versiyasini ham qo‘shib beraman yoki README mazmunini qisqartirib, loyiha sahifasiga mos rasmiy tavsif yozib bera olaman.
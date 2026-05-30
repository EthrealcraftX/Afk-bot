# 🤖 MC-AFK Bot Panel

**A comprehensive Minecraft server management system** with both a modern web dashboard and Telegram bot integration. Create, manage, and monitor Minecraft servers (Java & Bedrock) directly from your browser or Telegram.

> **Qisqacha (Uzbek):** Bu loyiha — oddiy Minecraft serverlarni qoshish, yoqish, o'chirish va ularning loglari hamda voqealarini ko'rish uchun web-panel.

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

## 🛠 Tech Stack

### Backend
- **Runtime:** Node.js
- **Framework:** Express.js 5.x
- **Database:** MongoDB with Mongoose
- **Authentication:** JWT (jsonwebtoken)
- **Security:** bcryptjs for password hashing
- **Minecraft Protocols:**
  - **Java Edition:** mineflayer
  - **Bedrock Edition:** bedrock-protocol
- **Telegram Bot:** node-telegram-bot-api

### Frontend
- **Build Tool:** Vite
- **UI Framework:** React + TypeScript
- **Styling:** Tailwind CSS
- **Icons:** Lucide React

### DevOps & Testing
- **Environment:** dotenv for config management
- **Rate Limiting:** express-rate-limit
- **Process Management:** Child process spawning

---

## 📦 Installation

### Prerequisites
- Node.js 16+ and npm/yarn
- MongoDB instance (local or cloud, e.g., MongoDB Atlas)
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- Environment variables configured

### Step 1: Clone & Install Dependencies

```bash
git clone https://github.com/EthrealcraftX/Afk-bot.git
cd afk-bot
npm install
```

### Step 2: Configure Environment Variables

Create a `.env` file in the root directory:

```bash
# JWT Secret (used for session tokens)
JWT_SECRET=your-super-secret-jwt-key-here

# Telegram Bot Token (from @BotFather)
TELEGRAM_BOT_TOKEN=your-telegram-bot-token

# MongoDB Connection String
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/afk-bot

# API Configuration
BOT_API_URL=https://afk.hypepath.uz
EXPO_PUBLIC_API_URL=https://afk.hypepath.uz

# Admin Settings
ADMIN_USERNAME=admin

# Optional: Project Limits
MAX_PROJECTS_PER_USER=3
```

### Step 3: Build & Run

```bash
# Start the Express server (port 3000)
npm start

# In a separate terminal, start the Telegram bot
npm run bot
```

The web dashboard will be available at `http://localhost:3000`

---

## 🔑 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `JWT_SECRET` | Secret key for JWT token signing | ✅ Yes |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather | ✅ Yes |
| `MONGODB_URI` | MongoDB connection string | ✅ Yes |
| `BOT_API_URL` | Public API URL for bot callbacks | ✅ Yes |
| `ADMIN_USERNAME` | Admin account username | ❌ (default: "admin") |
| `MAX_PROJECTS_PER_USER` | Max servers per user | ❌ (default: 3) |

---

## 🎮 Usage

### Web Dashboard

#### 1. Authentication
- Navigate to `http://localhost:3000/auth/login`
- Sign up with a username and password
- Log in to access the dashboard

#### 2. Create a Server
- Click "Create Server" on the dashboard
- Enter server details:
  - **Server IP** (e.g., `play.example.com` or Aternos domain)
  - **Port** (default: 25565 for Java, 19132 for Bedrock)
  - **Version** (e.g., 1.20.1 for Java, latest for Bedrock)
  - **Type** (Java or Bedrock)
- Select AFK bot configuration
- Deploy!

#### 3. Monitor Servers
- View real-time player counts
- Track server status (online/offline)
- View event logs and player join/leave events
- Manage server settings

#### 4. Stop/Delete Servers
- Use the dashboard controls to stop or permanently delete servers

### Telegram Bot

#### 1. Start the Bot
- Add your bot to Telegram (search for your bot username)
- Send `/start` to initialize

#### 2. Available Commands

| Command | Description |
|---------|-------------|
| `/start` | Initialize bot and show main menu |
| `/menu` | Return to main menu |
| `/help` | Show help information |

#### 3. Features
- **Create Server** — Create new servers from Telegram
- **View Servers** — List all your servers
- **Start/Stop Server** — Control server status
- **Check Status** — Get real-time player info
- **View Logs** — Access server events
- **Delete Server** — Remove servers

#### 4. Group Notifications
- Add the bot to your Telegram group
- When a server is created, the group gets auto-notified
- For Aternos Bedrock servers, a direct join link is provided

---

## 📡 API Reference

### Authentication Endpoints

#### Register User
```
POST /api/register
Content-Type: application/json

{
  "username": "myuser",
  "password": "securepassword"
}

Response: { "success": true, "message": "User created successfully" }
```

#### Login
```
POST /api/login
Content-Type: application/json

{
  "username": "myuser",
  "password": "securepassword"
}

Response: { "success": true, "token": "eyJhbGc..." }
```

### Server Endpoints

#### Create Server
```
POST /api/create-server
Authorization: Bearer {token}
Content-Type: application/json

{
  "ip": "play.example.com",
  "port": 25565,
  "version": "1.20.1",
  "type": "java"
}

Response: { "success": true, "projectId": "project_1775317753413" }
```

#### Get Server Status
```
GET /api/server-status/:projectId
Authorization: Bearer {token}

Response: { 
  "status": "running",
  "players": 5,
  "maxPlayers": 20,
  "motd": "Welcome!"
}
```

#### Stop Server
```
POST /api/stop-server/:projectId
Authorization: Bearer {token}

Response: { "success": true }
```

#### Delete Server
```
POST /api/delete-server/:projectId
Authorization: Bearer {token}

Response: { "success": true }
```

#### Get Logs
```
GET /api/logs/:projectId?limit=100
Authorization: Bearer {token}

Response: [
  { "timestamp": "2024-05-30T10:15:00Z", "message": "[INFO] Player joined" }
]
```

---

## 🗄️ Database Schema

### User Model

```javascript
{
  _id: ObjectId,
  username: String (unique, required),
  passwordHash: String (bcryptjs hash),
  projects: [String], // Array of project IDs
  createdAt: Date
}
```

### Project Model

```javascript
{
  _id: ObjectId,
  projectId: String (unique, required, timestamp-based),
  host: String (server IP/domain),
  port: Number (1-65535),
  version: String (e.g., "1.20.1", "latest"),
  type: String (enum: ['java', 'bedrock']),
  status: String (default: 'stopped'),
  owner: String (username),
  movementInterval: Number (milliseconds, default: 5000),
  reconnectHours: Number (default: 2),
  usernameFile: String (default: 'usernames.txt'),
  actions: [String], // Action history
  createdAt: Date,
  startedAt: Date,
  stoppedAt: Date
}
```

### Telegram User Mapping (tg_users.json)

```json
{
  "123456789": {
    "telegramId": 123456789,
    "username": "myuser",
    "firstName": "John",
    "createdAt": "2024-05-30T10:00:00Z"
  }
}
```

---

## 🚀 Scripts & Commands

### npm Scripts

```bash
# Start the Express server
npm start

# Start the Telegram bot
npm run bot
npm run bot:start

# Testing & Validation
npm test
npm run build
npm run lint
```

### Utility Scripts

| Script | Purpose |
|--------|---------|
| `scripts/migrate-passwords.js` | Migrate passwords from JSON to MongoDB |
| `scripts/rebuild-raknet.js` | Rebuild Bedrock RakNet connections |
| `scripts/test_log_lifecycle.js` | Test log storage and retrieval |
| `scripts/http_events_test.js` | Test HTTP event emission |
| `scripts/event_smoke_test.js` | Smoke tests for event system |
| `tools/check_script_syntax.js` | Validate JavaScript syntax |

---

## 💻 Development

### Project Layout

- **Frontend:** React/TypeScript with Vite (hot module replacement disabled in AI Studio)
- **Backend:** Express API with modular route handling
- **Bot:** Telegram bot with session-based state management
- **Database:** MongoDB with Mongoose ODM

### Key Architecture Decisions

1. **Modular Bot Design** — Separated command handlers, session management, and UI
2. **JWT Authentication** — Stateless, 24-hour expiring tokens
3. **Project Templating** — Pre-configured Java & Bedrock templates for quick deployment
4. **Event-Driven Logging** — Real-time events with persistent storage
5. **Child Process Management** — Isolated server processes for stability

### Running in Development

```bash
# Terminal 1: Start the Express server with auto-reload
npm start

# Terminal 2: Start the Telegram bot
npm run bot

# Terminal 3 (optional): Build frontend changes
npm run build
```

### Environment Setup

- **AI Studio HMR:** Disabled by setting `DISABLE_HMR=true`
- **File Watching:** Automatically disabled during agent edits
- **Port:** Locked to 3000 for consistency

---

## 🌍 Deployment

### Hosting Options

1. **Heroku** — Recommended for hobby projects
2. **Railway.app** — Modern Node.js hosting
3. **DigitalOcean** — VPS option for production
4. **AWS EC2** — Enterprise-grade hosting
5. **Vercel** — Frontend-only deployment (frontend separately)

### Pre-deployment Checklist

- ✅ Set `JWT_SECRET` to a strong random string
- ✅ Configure MongoDB Atlas for cloud storage
- ✅ Set `NODE_ENV=production`
- ✅ Configure CORS for your domain
- ✅ Enable HTTPS
- ✅ Set up SSL certificates
- ✅ Configure bot webhook (instead of polling)

---

## 📊 Project Roadmap

### Current Features ✅
- [x] Web dashboard with authentication
- [x] Java & Bedrock server support
- [x] Telegram bot integration
- [x] Real-time player monitoring
- [x] Event logging and history
- [x] AFK bot automation
- [x] Group announcements

### Planned Features 🗺️
- [ ] Performance dashboard with analytics
- [ ] Advanced scheduling for server restarts
- [ ] Custom server settings UI
- [ ] WebSocket real-time updates
- [ ] Server backup/restore functionality
- [ ] Multi-language support
- [ ] Docker containerization

---

## 📜 License

ISC License — See LICENSE file for details

---

## 🔗 Resources

- **Mineflayer:** [GitHub](https://github.com/PrismarineJS/mineflayer)
- **Bedrock Protocol:** [npm](https://www.npmjs.com/package/bedrock-protocol)
- **Express.js:** [Official Docs](https://expressjs.com/)
- **Telegram Bot API:** [Documentation](https://core.telegram.org/bots/api)
- **MongoDB:** [Official Docs](https://docs.mongodb.com/)

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📧 Support

For issues, questions, or suggestions:
- **GitHub Issues:** [Open an issue](https://github.com/EthrealcraftX/Afk-bot/issues)
- **Telegram:** Use the `/help` command in the bot

---

**Made with ❤️ by the EthrealcraftX Team**

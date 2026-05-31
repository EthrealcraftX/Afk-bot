# 🤖 MC-AFK Bot Panel

**Minecraft serverlarini boshqarish uchun to'liq tizim** — zamonaviy veb-paneli va Telegram bot integratsiyasi bilan. Minecraft serverlarini (Java & Bedrock) brauzeringizdan yoki Telegramdan to'g'ridan-to'g'ri yaratib, boshqaring va kuzatib turing.

> **Qisqacha:** Bu loyiha — oddiy Minecraft serverlarni qoshish, yoqish, o'chirish va ularning loglari hamda voqealarini ko'rish uchun web-panel.

---

## 📋 Maqolalar

- [Tezkor Boshlash](#-tezkor-boshlash)
- [Xususiyatlar](#-xususiyatlar)
- [Loyiha Tuzilishi](#-loyiha-tuzilishi)
- [Texnologiyalar](#-texnologiyalar)
- [O'rnatish](#-ornatish)
- [Muhit O'zgaruvchilari](#-muhit-ozgaruvchilari)
- [Foydalanish](#-foydalanish)
- [API Ma'lumotlari](#-api-malumotlari)
- [Ma'lumotlar Bazasi Sxemasi](#-malumotlar-bazasi-sxemasi)
- [Skriptlar va Buyruqlar](#-skriptlar-va-buyruqlar)
- [Ishlab Chiqish](#-ishlab-chiqish)
- [Loyiha Rejalari](#-loyiha-rejalari)

---

## ⚡ Tezkor Boshlash



### Birinchi Ishga Tushirish Sozlamasi:
1. Boshlang'ich skriptni ishga tushiring (.env yo'q bo'lsa, uni yaratadi)
2. `.env` faylni taqdim etilgan ma'lumotlar bilan tahrirlang:
   - `JWT_SECRET` — Istalgan kuchli tasodifiy satr
   - `TELEGRAM_BOT_TOKEN` — [@BotFather](https://t.me/botfather) dan
   - `MONGODB_URI` — [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) dan
3. Boshlang'ich skriptni yana ishga tushiring
4. Brauzer avtomatik ravishda `http://localhost:3000` da ochiladi
5. Hisob yarating va tizimga kiring!

---

## ✨ Xususiyatlar

### 🌐 Veb Paneli
- **Foydalanuvchi Autentifikatsiyasi** — Xavfli JWT asosidagi kirish tizimi
- **Server Boshqaruvi** — Minecraft serverlarini yaratish, ishga tushirish, to'xtatzish va o'chirish
- **Real-vaqtda Kuzatish** — Server loglarini va o'yinchi voqealarini real-vaqtda ko'ring
- **Ko'p Serverli Qo'llab-Quvvatlash** — Bir vaqtning o'zida bir nechta serverni boshqaring
- **Server Shablonlari** — Oldindan sozlangan Java & Bedrock shablonlari
- **O'yinchilari Kuzatish** — Ulangan o'yinchilarni va ularning harakatlarini kuzatib turing
- **Voqea Qaydlari** — To'liq voqea kuzatish va doimiy saqlash

### 🤖 Telegram Bot Integratsiyasi
- **Buyriq Asosidagi Boshqaruv** — Serverlarni Telegramdan to'g'ridan-to'g'ri boshqaring
- **/start** — Botni ishga tushirish va asosiy menyuni ko'rish
- **/menu** — Server boshqaruvi variantlarini navigatsiya qilish
- **/help** — Yordam ma'lumotlarini olish
- **Guruhlarga E'lon Qilish** — Yangi serverlar yaratilganda avtomatik guruhlarga xabarnoma
- **Statusni So'rash** — Real-vaqtda server holatini va o'yinchi sonini olish
- **Foydalanuvchi Sinxronizatsiyasi** — Telegram foydalanuvchilarini veb-panel hisoblariga bog'lash

### ⚙️ Server Avtomatikashuvi
- **AFK Bot Boshqaruvi** — Avtomatik AFK botlarini o'yinchilarni faol qilish uchun jonatish
- **Sozlanishi Mumkin Intervallar** — Custom o'yinchi harakati intervallarini o'rnatish
- **Avtomatik Qayta Ulanish** — Sozlanishi Mumkin qayta ulanish parametrlari (asosiy: 2 soat)
- **Java & Bedrock Qo'llab-Quvvatlash** — Ikkala Minecraft editionalari bilan ishlash
- **Dinamik Foydalanuvchi Nomi Yuklash** — Server uchun bir nechta o'yinchi foydalanuvchi nomlari qo'llab-quvvatlash
- **Log Arxivlash** — Doimiy voqea va log saqlash

### 🔐 Xavfsizlik Xususiyatlari
- **Parolni Xeshirlash** — bcryptjs bilan xavfli parol saqlash
- **JWT Autentifikatsiyasi** — 24 soatlik sessiya tokenlari
- **Chastota Chegaralash** — Brute-force hujumlaridan qo'llab-quv
- **CORS Qo'llab-Quvvatlash** — Mobil va tashqi ilovalar uchun xavfli o'zaro foydalanish
- **Admin Paneli** — Faqat admin foydalanishiga chegaralangan amallar

---

## 📁 Loyiha Tuzilishi

```
afk-bot/
├── api/                      # Express backend API
│   ├── api.js               # Asosiy API logikasi (foydalanuvchilar, loyihalar, serverlar)
│   ├── auth.js              # JWT autentifikatsiya middleware
│   ├── db.js                # MongoDB ulanish
│   ├── routes.js            # API marshrutu ishchi tomonlari
│   └── models/
│       ├── User.js          # Foydalanuvchi sxemasi
│       └── Project.js       # Loyiha/Server sxemasi
├── bot/                      # Telegram bot amalga oshirishi
│   ├── index.js             # Bot kirish nuqtasi
│   ├── config.js            # Telegram konfiguratsiyasi (TOKEN, API_URL)
│   ├── context.js           # Ulashilgan bot konteksti
│   ├── commands.js          # Bot buyriqlar (/start, /menu, /help)
│   ├── router.js            # Telegram xabari marshrutlash
│   ├── session.js           # Foydalanuvchi sessiya boshqaruvi
│   ├── auth.js              # Bot autentifikatsiya logikasi
│   ├── keyboards.js         # Telegram klaviatura rozlashuvi
│   ├── formatters.js        # Xabar formatlash utillitalari
│   ├── store.js             # Ma'lumotlar doimiyligi
│   ├── ui.js                # UI komponentlari
│   ├── group_store.js       # Guruh chati boshqaruvi
│   ├── group_announce.js    # Guruh bildirishnomasi
│   └── handlers/
│       ├── admin.js         # Admin buyriqlar
│       ├── create.js        # Server yaratish jarayoni
│       ├── group.js         # Guruh boshqaruvi
│       ├── menu.js          # Asosiy menyusi
│       ├── servers.js       # Server boshqaruvi
│       └── support.js       # Qo'llab-quv ishchi tomonlari
├── public/                   # Frontend statik fayllar
│   ├── index.html           # Paneli qo'llanma sahifasi
│   ├── create.html          # Server yaratish sahifasi
│   ├── auth/
│   │   ├── login.html       # Kirish sahifasi
│   │   └── signup.html      # Ro'yxatdan o'tish sahifasi
│   ├── assets/              # Rasmlar, ikonkalar, va boshqalar
│   └── styles.css           # Global uslublar
├── projects/                 # Faol server nusxalari
│   ├── project_1775317753413/
│   │   ├── config.json
│   │   ├── index.js         # Server jarayoni
│   │   ├── package.json
│   │   └── username.txt
│   └── ...
├── templates/                # Server shablonlari
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
├── data/                     # Doimiy ma'lumotlar saqlashi
│   ├── users.json           # Foydalanuvchi hisoblar
│   ├── projects.json        # Loyiha metama'lumotlari
│   ├── tg_users.json        # Telegram foydalanuvchi etalon
│   ├── logs/                # Server loglari
│   ├── events/              # Server voqealari
│   └── players/             # O'yinchi kuzatish
├── scripts/                  # Foydalanish skriptlari
│   ├── migrate-passwords.js
│   ├── rebuild-raknet.js
│   ├── test_log_lifecycle.js
│   └── http_events_test.js
├── tools/                    # Ishlab chiqish utillitalari
│   └── check_script_syntax.js
├── server.js                # Express server kirish nuqtasi
├── telegram_bot.js          # Telegram bot kirish nuqtasi
├── package.json             # Bog'liqliklar va skriptlar
├── vite.config.ts           # Vite qurish konfiguratsiyasi
├── tsconfig.json            # TypeScript konfiguratsiyasi
└── README.md                # Ushbu fayl
```

---

## 🛠 Texnologiyalar

### Backend
- **Runtime:** Node.js
- **Framework:** Express.js 5.x
- **Ma'lumotlar Bazasi:** MongoDB bilan Mongoose
- **Autentifikatsiya:** JWT (jsonwebtoken)
- **Xavfsizlik:** bcryptjs parol xeshirlash uchun
- **Minecraft Protokollari:**
  - **Java Edition:** mineflayer
  - **Bedrock Edition:** bedrock-protocol
- **Telegram Bot:** node-telegram-bot-api

### Frontend
- **Qurilish Vositas:** Vite
- **UI Framework:** React + TypeScript
- **Uslublash:** Tailwind CSS
- **Ikonkalar:** Lucide React

### DevOps & Sinov
- **Muhit:** dotenv konfiguratsiya boshqaruvi uchun
- **Chastota Chegaralash:** express-rate-limit
- **Jarayoni Boshqaruvi:** Child jarayoni spawning

---

## 📦 O'rnatish

### Oldindan Talab Qilinadigan Narsalar
- Node.js 16+ va npm/yarn
- MongoDB nusxasi (mahalliy yoki bulutda, masalan MongoDB Atlas)
- Telegram Bot Tokeni ([@BotFather](https://t.me/botfather) dan)
- Sozlangan muhit o'zgaruvchilari

### 1-Qadam: Klonlash va Bog'liqliklarni O'rnatish

```bash
git clone https://github.com/EthrealcraftX/Afk-bot.git
cd afk-bot
npm install
```

### 2-Qadam: Muhit O'zgaruvchilarini Sozlash

Root katalogda `.env` faylini yaratish:

```bash
# JWT Sirri (sessiya tokenlar uchun ishlatiladi)
JWT_SECRET=your-super-secret-jwt-key-here

# Telegram Bot Tokeni (@BotFather dan)
TELEGRAM_BOT_TOKEN=your-telegram-bot-token

# MongoDB Ulanish Satrochasi
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/afk-bot

# API Konfiguratsiyasi
BOT_API_URL=https://afk.hypepath.uz
EXPO_PUBLIC_API_URL=https://afk.hypepath.uz

# Admin Sozlamalari
ADMIN_USERNAME=admin

# Ixtiyoriy: Loyiha Chegaralari
MAX_PROJECTS_PER_USER=3
```

### 3-Qadam: Qurilish va Ishga Tushirish

```bash
# Express serverni ishga tushirish (3000-port)
npm start

# Alohida terminalda Telegram botni ishga tushirish
npm run bot
```

Veb-paneli `http://localhost:3000` da mavjud bo'ladi

---

## 🔑 Muhit O'zgaruvchilari

| O'zgaruvchi | Tavsif | Talab |
|----------|-------------|----------|
| `JWT_SECRET` | JWT token imzolash uchun sirli kalit | ✅ Ha |
| `TELEGRAM_BOT_TOKEN` | @BotFather dan Telegram bot tokeni | ✅ Ha |
| `MONGODB_URI` | MongoDB ulanish satrochasi | ✅ Ha |
| `BOT_API_URL` | Bot callback uchun ommaviy API URL | ✅ Ha |
| `ADMIN_USERNAME` | Admin hisob foydalanuvchi nomi | ❌ (asosiy: "admin") |
| `MAX_PROJECTS_PER_USER` | Foydalanuvchi uchun maksimal serverlar | ❌ (asosiy: 3) |

---

## 🎮 Foydalanish

### Veb Paneli

#### 1. Autentifikatsiya
- `http://localhost:3000/auth/login` sahifasiga o'ting
- Foydalanuvchi nomi va parol bilan ro'yxatdan o'ting
- Panelga kirish uchun tizimga kiring

#### 2. Server Yaratish
- Panelda "Server Yaratish" tugmasini bosing
- Server ma'lumotlarini kiriting:
  - **Server IP** (masalan `play.example.com` yoki Aternos domeni)
  - **Port** (asosiy: Java uchun 25565, Bedrock uchun 19132)
  - **Versiya** (masalan Java uchun 1.20.1, Bedrock uchun latest)
  - **Turi** (Java yoki Bedrock)
- AFK bot konfiguratsiyasini tanlang
- Joylashtiring!

#### 3. Serverlarni Kuzatish
- Real-vaqtda o'yinchi sonini ko'ring
- Server holatini kuzatib turing (online/offline)
- Voqea loglarini va o'yinchi kirish/chiqish voqealarini ko'ring
- Server sozlamalarini boshqaring

#### 4. Serverlarni To'xtatzish/O'chirish
- Paneldagi boshqaruvlardan foydalanib serverlarni to'xtatzish yoki doimiy o'chirish

### Telegram Bot

#### 1. Botni Ishga Tushirish
- Bot foydalanuvchi nomini Telegramda qidiring va bot qo'shing
- `/start` ni yuboring

#### 2. Mavjud Buyriqlar

| Buyriq | Tavsif |
|--------|-------------|
| `/start` | Botni ishga tushirish va asosiy menyuni ko'rsatish |
| `/menu` | Asosiy menyuya qaytish |
| `/help` | Yordam ma'lumotlarini ko'rsatish |

#### 3. Xususiyatlar
- **Server Yaratish** — Telegramdan yangi serverlar yarating
- **Serverlarni Ko'rish** — Barcha serverlaringizni ro'yxatlang
- **Serverni Ishga Tushirish/To'xtatzish** — Server holatini boshqaring
- **Holatni Tekshirish** — Real-vaqtda o'yinchi ma'lumotlarini olish
- **Loglarni Ko'rish** — Server voqealariga kirish
- **Serverni O'chirish** — Serverlarni o'chirib tashlash

#### 4. Guruh Bildirishnomasi
- Botni Telegram guruhiga qo'shing
- Server yaratilganda, guruh avtomatik ravishda xabarnoma oladi
- Aternos Bedrock serverlari uchun to'g'ridan-to'g'ri birlashtirish havolasi beriladi

---

## 📡 API Ma'lumotlari

### Autentifikatsiya Endpoint-lari

#### Foydalanuvchi Ro'yxatdan O'tkazish
```
POST /api/register
Content-Type: application/json

{
  "username": "myuser",
  "password": "securepassword"
}

Javob: { "success": true, "message": "User created successfully" }
```

#### Tizimga Kirish
```
POST /api/login
Content-Type: application/json

{
  "username": "myuser",
  "password": "securepassword"
}

Javob: { "success": true, "token": "eyJhbGc..." }
```

### Server Endpoint-lari

#### Server Yaratish
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

Javob: { "success": true, "projectId": "project_1775317753413" }
```

#### Server Holatini Olish
```
GET /api/server-status/:projectId
Authorization: Bearer {token}

Javob: { 
  "status": "running",
  "players": 5,
  "maxPlayers": 20,
  "motd": "Welcome!"
}
```

#### Serverni To'xtatzish
```
POST /api/stop-server/:projectId
Authorization: Bearer {token}

Javob: { "success": true }
```

#### Serverni O'chirish
```
POST /api/delete-server/:projectId
Authorization: Bearer {token}

Javob: { "success": true }
```

#### Loglarni Olish
```
GET /api/logs/:projectId?limit=100
Authorization: Bearer {token}

Javob: [
  { "timestamp": "2024-05-30T10:15:00Z", "message": "[INFO] Player joined" }
]
```

---

## 🗄️ Ma'lumotlar Bazasi Sxemasi

### Foydalanuvchi Modeli

```javascript
{
  _id: ObjectId,
  username: String (unique, talab qilinadi),
  passwordHash: String (bcryptjs xesh),
  projects: [String], // Loyiha ID-larning massivi
  createdAt: Date
}
```

### Loyiha Modeli

```javascript
{
  _id: ObjectId,
  projectId: String (unique, talab qilinadi, timestamp-asosida),
  host: String (server IP/domeni),
  port: Number (1-65535),
  version: String (masalan "1.20.1", "latest"),
  type: String (enum: ['java', 'bedrock']),
  status: String (asosiy: 'stopped'),
  owner: String (foydalanuvchi nomi),
  movementInterval: Number (millisekundlarda, asosiy: 5000),
  reconnectHours: Number (asosiy: 2),
  usernameFile: String (asosiy: 'usernames.txt'),
  actions: [String], // Amal tarixi
  createdAt: Date,
  startedAt: Date,
  stoppedAt: Date
}
```

### Telegram Foydalanuvchi Etaloni (tg_users.json)

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

## 🚀 Skriptlar va Buyruqlar

### npm Skriptlar

```bash
# Express serverni ishga tushirish
npm start

# Telegram botni ishga tushirish
npm run bot
npm run bot:start

# Sinov va Tekshirish
npm test
npm run build
npm run lint
```

### Foydalanish Skriptlari

| Skript | Maqsad |
|--------|---------|
| `scripts/migrate-passwords.js` | Parollarni JSON dan MongoDB ga ko'chirish |
| `scripts/rebuild-raknet.js` | Bedrock RakNet ulanishlarini qayta qurilish |
| `scripts/test_log_lifecycle.js` | Log saqlash va olishni sinov qilish |
| `scripts/http_events_test.js` | HTTP voqea yuborish testini sinov qilish |
| `scripts/event_smoke_test.js` | Voqea tizimi uchun tutun testlari |
| `tools/check_script_syntax.js` | JavaScript sintaksisini tekshirish |

---

## 💻 Ishlab Chiqish

### Loyiha Rozlashuvi

- **Frontend:** Vite bilan React/TypeScript (AI Studio-da hot module replacement o'chirilgan)
- **Backend:** Express API modulli marshrutu boshqaruvi bilan
- **Bot:** Sessiya-asosidagi holatni boshqaruv bilan Telegram boti
- **Ma'lumotlar Bazasi:** Mongoose ODM bilan MongoDB

### Asosiy Arxitektura Qarorlari

1. **Modulli Bot Dizayni** — Alohida buyriq ishchi tomonlari, sessiya boshqaruvi va UI
2. **JWT Autentifikatsiya** — Stateless, 24 soatning o'rasi bilan soni tugagan tokenlar
3. **Loyiha Shablon** — Tezkor joylashtirilish uchun oldindan sozlangan Java & Bedrock shablonlar
4. **Voqea-Boshqa Qaydlar** — Doimiy saqlash bilan real-vaqt voqealari
5. **Child Jarayoni Boshqaruvi** — Barqarorligi uchun izolyatsiya qilingan server jarayonlari

### Ishlab Chiqishda Ishga Tushirish

```bash
# Terminal 1: Express serverni avtomatik qayta yuklash bilan ishga tushirish
npm start

# Terminal 2: Telegram botni ishga tushirish
npm run bot

# Terminal 3 (ixtiyoriy): Frontend o'zgarishlari qurilish
npm run build
```

### Muhit O'rnatish

- **AI Studio HMR:** `DISABLE_HMR=true` orqali o'chirilgan
- **Fayl Kuzatish:** Agent tahrirlar vaqtida avtomatik o'chirilgan
- **Port:** Ketma-ketlik uchun 3000-portga qiflandi

---

## 🌍 Joylashtirish

### Hosting Variantlari

1. **Heroku** — Hobby loyihalar uchun tavsiya etiladi
2. **Railway.app** — Zamonaviy Node.js hosting
3. **DigitalOcean** — VPS option ishlab chiqarish uchun
4. **AWS EC2** — Korxona-daraja hosting
5. **Vercel** — Frontend-faqat joylashtirish (frontend alohida)

### Joylashtirish Oldindan Tekshirish Ro'yxati

- ✅ `JWT_SECRET` ni kuchli tasodifiy satrga o'rnating
- ✅ MongoDB Atlas bulut saqlash uchun sozlang
- ✅ `NODE_ENV=production` o'rnating
- ✅ CORS domeningiz uchun sozlang
- ✅ HTTPS ni yoqing
- ✅ SSL sertifikatlarini sozlang
- ✅ Bot webhook sozlang (polling o'rniga)

---

## 📊 Loyiha Rejalari

### Hozirgi Xususiyatlar ✅
- [x] Autentifikatsiya bilan veb-paneli
- [x] Java & Bedrock server qo'llab-quvvatlash
- [x] Telegram bot integratsiyasi
- [x] Real-vaqtda o'yinchi kuzatish
- [x] Voqea qayd etish va tarixi
- [x] AFK bot avtomatikashuvi
- [x] Guruh bildirishnomasi

### Rejalangan Xususiyatlar 🗺️
- [ ] Analitika bilan ishlash paneli
- [ ] Server qayta ishga tushirish uchun peshqadam jadval
- [ ] Custom server sozlamalari UI
- [ ] Mobil ilova (React Native)
- [ ] WebSocket real-vaqta yangilashuvi
- [ ] Server zaxira/tiklanish funktsiyasi
- [ ] Ko'p tilga qo'llab-quv
- [ ] Docker konteynerizatsiyasi

---

## 📜 Litsenziya

ISC Litsenziyasi — Batafsil ma'lumot uchun LICENSE faylini ko'ring

---

## 🔗 Manbalar

- **Mineflayer:** [GitHub](https://github.com/PrismarineJS/mineflayer)
- **Bedrock Protocol:** [npm](https://www.npmjs.com/package/bedrock-protocol)
- **Express.js:** [Rasmiy Hujjatlar](https://expressjs.com/)
- **Telegram Bot API:** [Hujjatlar](https://core.telegram.org/bots/api)
- **MongoDB:** [Rasmiy Hujjatlar](https://docs.mongodb.com/)

---

## 🤝 Hissa Qo'shish

Hissalar qabul qilinadi! Iltimos:

1. Loyihani fork qiling
2. Xususiyat shoxini yarating (`git checkout -b feature/amazing-feature`)
3. O'zgarishlarni commit qiling (`git commit -m 'Add amazing feature'`)
4. Shoxga push qiling (`git push origin feature/amazing-feature`)
5. Pull Request oching

---

## 📧 Qo'llab-Quv

Muammolar, savollar yoki takliflar uchun:
- **GitHub Masalalar:** [Masalani Oching](https://github.com/EthrealcraftX/Afk-bot/issues)
- **Telegram:** Botda `/help` buyrug'ini ishlating

---

**EthrealcraftX Jamoasi tomonidan ❤️ bilan yasalgan**

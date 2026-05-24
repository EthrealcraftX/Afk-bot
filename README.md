# Afk‑bot — Minecraft Server Manager

🔧 Qisqacha: Bu loyiha — oddiy Minecraft serverlarni yaratish, yoqish, o‘chirish va ularning loglari hamda voqealarini ko‘rish uchun web-panel.

---

## ✅ Asosiy xususiyatlar
- Server yaratish/yoqish/o‘chirish (dashboard)
- Server loglari va per-project/global events ko‘rish
- Right-side sliding popup: lifecycle events (timestamp yo‘q variant)
- Popupni o‘chirish (localStorage orqali saqlanadi)
- Voqealarni normalize va dedupe qilish (takroriy xabarlar bitta qatorga birlashtiriladi)
- Reconnect logicda paydo bo‘lgan stacked timers muammosi tuzatildi

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
3. Brauzerda ochish: `http://localhost:3000` yoki siz ishlatayotgan tunneling URL orqali.

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
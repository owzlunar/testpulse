# TestPulse API

REST API ของ TestPulse (Node.js 22 + TypeScript + Express 5 + Mongoose 8) จัดโครงสร้างแบบ **feature module**: `src/core` เป็นโครงสร้างพื้นฐานที่ทุก module ใช้ และ `src/modules/<ชื่อ>` เป็นฟีเจอร์ละโฟลเดอร์ ลบโฟลเดอร์ module กับบรรทัดใน `src/app-modules.ts` แล้วแอปยังทำงานได้

สัญญา API (endpoint และ type) อยู่ฝั่ง frontend ใน repo เดียวกัน: `frontend/src/api/contract/*.ts` และ `frontend/src/types` ส่วน backend เก็บสำเนา type ไว้ที่ `src/contract/types.ts` (CI ตรวจว่าตรงกันทุกครั้ง)

## เริ่มต้นใช้งาน

ต้องมี Node.js 22+, MongoDB 6+ แบบ replica set (ใช้ transaction) และ MinIO (ถ้าเก็บไฟล์ที่ MinIO)

```bash
npm ci
npm run env:init -- dev   # สร้าง .env.dev พร้อม secret ใหม่ (JWT keypair, encryption key, blind index salt)
# แก้ .env.dev: MONGODB_URI (ฐาน dev เช่น testpulse-dev), STORAGE_DRIVER / MINIO_*, MAIL_*
npm run db:indexes   # สร้าง index ทุก collection
npm run seed         # ข้อมูลตัวอย่าง (id เดียวกับ mock ของ frontend) รหัสผ่านทุกคน: password123
npm run migrate      # migration ที่ยังไม่ได้รัน (หลัง seed จะมี Admin แล้ว จึงไม่ต้องตั้ง INITIAL_ADMIN_*)
npm run dev          # http://localhost:4000/api/v1
```

ถ้าไม่ใช้ข้อมูลตัวอย่าง ให้ตั้ง `INITIAL_ADMIN_EMAIL` และ `INITIAL_ADMIN_PASSWORD` แล้วรัน `npm run migrate` ระบบจะสร้าง Admin คนแรกด้วยรหัสนั้น (เฉพาะเมื่อฐานยังไม่มี Admin) หลัง login ครั้งแรกให้เปลี่ยนรหัสผ่านและลบ `INITIAL_ADMIN_PASSWORD` ออก

### ไฟล์ตั้งค่า (dotenv-flow)

ใช้ชื่อ key เดียวกันทุก environment ไฟล์หลังทับไฟล์แรก และค่าที่ตั้งใน environment จริง (shell หรือ docker-compose) ทับทุกไฟล์

| ไฟล์        | ใช้เมื่อ                                                               | เก็บอะไร                                                      | git                   |
| ----------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------- |
| `.env`      | ทุก environment (โหลดก่อน)                                             | ค่ากลางที่ไม่ลับ: TTL, rate limit, BASE_PATH, ชื่อ bucket ฯลฯ | เข้า (ห้ามใส่ secret) |
| `.env.dev`  | `NODE_ENV=development` (ค่าเริ่มต้น: `npm run dev`, `seed`, `migrate`) | ฐาน dev, secret ของ dev, storage และเมลของเครื่อง             | ไม่เข้า               |
| `.env.prod` | `NODE_ENV=production` (container ผ่าน `env_file`, `npm start`)         | ฐาน production, secret ของ production, SMTP                   | ไม่เข้า               |
| `.env.test` | `npm test`                                                             | มีแค่ `MONGODB_URI` ของฐาน test                               | ไม่เข้า               |

**test:** อ่านเฉพาะ `MONGODB_URI` จาก `.env.test` ไม่อ่าน `.env`, `.env.dev` และไม่อ่านค่าจาก shell เพราะ test จะล้างข้อมูลทุกครั้ง ชื่อฐานจึงต้องมีคำว่า `test` และ test จะรันทีละไฟล์ ค่าอื่นรวมถึง secret ของ test จะถูกสร้างใหม่ทุกครั้งที่รัน ถ้าไม่มี `.env.test` (เช่นใน CI) test จะใช้ MongoDB ใน memory

```bash
echo 'MONGODB_URI=mongodb://user:pass@localhost:27017/testpulse-test?authSource=admin&replicaSet=rs0&directConnection=true' > .env.test
```

ตรวจสถานะ: `GET /health/live` (process ยังทำงาน) และ `GET /health/ready` (เชื่อม MongoDB ได้)

บัญชีตัวอย่าง: `admin@testpulse.dev` (Admin), `somchai.qa@testpulse.dev` (QA Lead), `pitchaya.qa@testpulse.dev` (QA Tester), `kittisak.dev@testpulse.dev` และ `thanakorn.dev@testpulse.dev` (Developer)

ระหว่างพัฒนา `MAIL_DRIVER=log` จะพิมพ์อีเมล (รวมลิงก์เชิญ) ลง console แทนการส่งจริง

## คำสั่ง

| คำสั่ง                                     | ทำอะไร                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| `npm run dev`                              | รันพร้อม reload เมื่อแก้ไฟล์                                           |
| `npm run build` / `npm start`              | build เป็น `dist/` แล้วรันแบบ production                               |
| `npm run check`                            | ตรวจ contract, type, lint, format และรัน test ทั้งหมด (รันก่อน commit) |
| `npm test` / `npm run test:coverage`       | test บน MongoDB จริง (ฐานใน `.env.test` หรือ in-memory replica set)    |
| `npm run contract:sync` / `contract:check` | คัดลอก / ตรวจ type จาก `frontend/src/types`                            |
| `npm run seed`                             | ใส่ข้อมูลตัวอย่าง (ไม่รันใน production)                                |
| `npm run db:indexes`                       | สร้าง index ตาม schema (`--drop-stale` ลบ index ที่ไม่ใช้แล้ว)         |
| `npm run migrate` / `migrate:status`       | รัน migration ที่ค้างอยู่ / ดูว่ารันอะไรไปแล้ว                         |
| `npm run keys:rotate`                      | เข้ารหัสฟิลด์ใหม่ด้วยกุญแจปัจจุบัน (ดูหัวข้อความปลอดภัย)               |
| `npm run make:module -- <ชื่อ>`            | สร้าง module ใหม่ตามแบบมาตรฐาน                                         |
| `npm run env:init -- dev\|prod`            | สร้าง `.env.dev` / `.env.prod` จาก `env-example` พร้อม secret ใหม่     |

## โครงสร้าง

```text
src/
├── core/                    ห้าม import จาก modules (ESLint บังคับ)
│   ├── app.ts               createApp({ modules })
│   ├── server.ts            start / graceful shutdown
│   ├── module.ts            สัญญาของ module (AppModule)
│   ├── config/              env (Joi, fail-fast), logger, db, redact
│   ├── http/                envelope, ApiError, validate, error handler, request id, security, rate limit, health
│   ├── auth/                token, password (scrypt), principal, guards
│   ├── database/            BaseRepository, ids, transaction, plugins (to-json, field-encryption, audit-trail)
│   ├── crypto/              AES-256-GCM key ring, blind index
│   ├── audit/               audit sink (module audit-log ลงทะเบียนตอนเริ่ม)
│   ├── events/              event bus ระหว่าง module
│   ├── storage/             Local / MinIO
│   ├── mail/                SMTP / log
│   └── jobs/                scheduler + distributed lock
├── modules/
│   ├── auth/  user/  role/  team/  project/  settings/  audit-log/  file/
│   └── <ชื่อ>/              model · repository · service · validation · controller · routes · seed · index.ts · __tests__
├── contract/types.ts        สำเนา type จาก frontend (ห้ามแก้ที่นี่)
├── app-modules.ts           รายการ module ที่เปิดใช้
├── migrations/              migration ข้อมูล เรียงตามลำดับใน index.ts (ตัวแรกสร้าง Admin คนแรก)
├── cli/                     seed, db-indexes, migrate, preflight, rotate-keys (build เป็น dist/cli ใช้ใน Docker image ได้)
└── index.ts                 composition root
```

ลำดับใน request: request id → access log → health → helmet / CORS → rate limit → body → กรอง `$operator` → route ของ module (authenticate → สิทธิ์ → validate → controller → service → repository) → 404 → error handler

### กฎของ module

1. module อื่นใช้ได้เฉพาะสิ่งที่ export จาก `index.ts`
2. controller เรียก service เท่านั้น service เรียก repository เท่านั้น
3. ถ้าการพึ่งพาจะย้อนทิศ (เช่น ลบทีมแล้วต้องแก้โปรเจกต์) ใช้ event bus: module ที่ลบ `emit('team.deleted')` และ module ที่เกี่ยวข้อง `on(...)` ใน `setup()`
4. route ทุกเส้นประกาศนโยบายสิทธิ์ที่ไฟล์ routes: `authenticate` แล้วตามด้วย `requireRole` / `requirePermission(...)` / `requireAdmin` ส่วนสิทธิ์รายโปรเจกต์ (ทีม) ตรวจใน service ด้วย `projectAccess`

### เพิ่ม module ใหม่

```bash
npm run make:module -- test-case
```

แล้วแก้ field ใน model / validation / service ให้ตรง type ใน contract, เลือก permission ใน routes, เพิ่ม module ใน `src/app-modules.ts` และรัน `npm run check`

## รูปแบบ API

- path ตาม JSDoc ใน `frontend/src/services` ภายใต้ `BASE_PATH` (ค่าเริ่มต้น `/api/v1`)
- สำเร็จ: `{ "status": true, "data": ... }`
- ผิดพลาด: `{ "status": false, "message": "ข้อความภาษาไทย", "code": "stale", "errors": [...], "requestId": "..." }`
  - 400 ข้อมูลไม่ถูกต้อง · 401 ยังไม่เข้าสู่ระบบ / token หมดอายุ · 403 ไม่มีสิทธิ์ · 404 ไม่พบ · 409 ซ้ำหรือข้อมูลเปลี่ยนไปแล้ว (`code`) · 413 ใหญ่เกินไป · 422 ทำตามที่ขอไม่ได้ · 429 เรียกถี่เกินไป
- การเข้าสู่ระบบ: `POST /auth/login` คืน `accessToken` (ส่งเป็น `Authorization: Bearer ...` อายุ 15 นาที) และตั้ง refresh token ใน cookie httpOnly (`tp_refresh`, อายุ 7 วัน นับใหม่ทุกครั้งที่ refresh) ก่อน access token หมดอายุให้เรียก `POST /auth/refresh` (ต้องส่ง cookie: `credentials: 'include'`) เว็บแอปทำให้เองแบบ silent refresh ราว 1 นาทีก่อนหมดอายุ ปรับได้ด้วย `ACCESS_TOKEN_TTL_SEC` และ `REFRESH_TOKEN_TTL_DAYS`
- ไฟล์: `POST /files` (multipart `file`, `category`) คืน `url` ไปใส่ใน `Project.logo` หรือ `User.avatar`

ระหว่างพัฒนาแนะนำให้ Vite proxy `/api` ไปที่ `http://localhost:4000` เพื่อให้ cookie และ URL ของไฟล์อยู่ origin เดียวกับเว็บ

## ความปลอดภัย

- **Token:** access token เป็น RS256 อายุสั้น เก็บแค่ user id ส่วนสิทธิ์อ่านจากฐานข้อมูลทุก request (เปลี่ยน Role แล้วมีผลทันที) refresh token หมุนทุกครั้งที่ใช้ ถ้ามีคนนำ token ที่หมุนไปแล้วมาใช้ซ้ำ ระบบจะยกเลิกการเข้าสู่ระบบนั้นทั้งชุด ยกเว้นภายใน `REFRESH_REUSE_GRACE_SEC` วินาที (ค่าเริ่มต้น 30) หลังการหมุน กรณีนี้ browser ยกเลิกคำขอกลางทางจนไม่ได้รับ cookie ใบใหม่ (รีเฟรชหน้าหรือเปลี่ยนหน้าเร็ว) หรือสองแท็บ refresh พร้อมกัน ส่วน logout จะยกเลิกการเข้าสู่ระบบนั้นทั้งชุดทันที
- **รหัสผ่านและคำเชิญ:** รหัสผ่านเก็บแบบ scrypt ผู้ใช้ที่ Admin เพิ่มจะได้ลิงก์เชิญทางอีเมล ซึ่งใช้ได้ครั้งเดียวและหมดอายุใน 72 ชั่วโมง ส่วนการเปลี่ยนรหัสผ่านจะออกจากระบบทุก session อื่น
- **ข้อมูลส่วนบุคคล:** อีเมลเข้ารหัส AES-256-GCM และค้นหาผ่าน blind index (HMAC-SHA256) logger จะปิดบัง token, password และ email ให้อัตโนมัติ
- **Key rotation:**
  1. เพิ่ม `ENCRYPTION_KEY_V2` และตั้ง `ENCRYPTION_CURRENT_KEY_ID=v2` แล้ว deploy (ข้อมูลเก่ายังอ่านได้ ส่วนข้อมูลใหม่ใช้ v2)
  2. รัน `npm run keys:rotate`
  3. ลบกุญแจเก่าเมื่อรายงานว่าไม่เหลือข้อมูลที่ใช้กุญแจนั้นแล้ว
- **ค่าตั้งต้นที่ปลอดภัย:** ถ้า secret ไม่ครบหรือเป็นค่าตัวอย่าง production จะไม่ยอม start เลย ไม่มีกุญแจสำรองฝังในโค้ด
- **ไฟล์อัปโหลด:** ตรวจชนิดจาก magic bytes และส่งกลับพร้อม `nosniff` และ CSP `sandbox`
- **Input:** กรอง `$operator` ออกจาก input, จำกัดขนาด body และจำกัดความถี่ของ API (เข้มกว่าสำหรับ endpoint เข้าสู่ระบบ)

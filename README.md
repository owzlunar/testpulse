# TestPulse

ระบบจัดการการทดสอบ (Dev ↔ QA, รอบทดสอบ, Defect, เอกสาร UAT) สเปกอยู่ที่ `PRD.md`

| โฟลเดอร์ | คืออะไร | เริ่มที่ |
| --- | --- | --- |
| `frontend/` | Vue 3 + Vuetify | `frontend/CLAUDE.md` |
| `backend/` | Express 5 + Mongoose (feature modules) | `backend/README.md` |
| `Dockerfile`, `docker/` | image เดียวชื่อ `testpulse` (nginx + API ภายใต้ supervisor) | หัวข้อด้านล่าง |

## Docker image `testpulse`

```text
            :8080 (expose ออกภายนอกพอร์ตเดียว)
 browser ──► nginx ──┬─ /            web app (static)
                     ├─ /api/*  ──► API 127.0.0.1:8081 (อยู่ในเครื่องเท่านั้น)
                     └─ /health/*──► API
```

- supervisor รัน nginx และ API ส่วน API, ขั้นตรวจระบบ และ nginx workers รันเป็น user `testpulse` (ไม่ใช่ root)
- ตอนเริ่ม container จะตรวจ MongoDB, ที่เก็บไฟล์ (MinIO หรือโฟลเดอร์ local), SMTP และโฟลเดอร์ log ก่อน ถ้าส่วนไหนเชื่อมต่อไม่ได้ container จะไม่ start และจะเขียนสาเหตุไว้ใน `docker logs testpulse`
- จากนั้นสร้าง index และรัน migration ที่ค้าง แล้วจึงเปิดให้ใช้งาน (ปิดได้ด้วย `RUN_DB_INDEXES=false` / `RUN_MIGRATIONS=false`)
  - ฐานใหม่จะได้ Role Admin และ Admin คนแรก (จาก `INITIAL_ADMIN_*`), Role เริ่มต้น QA Lead / QA Tester / Developer พร้อมสิทธิ์ตามค่ามาตรฐาน และ Test Case template ของระบบ
  - Role เริ่มต้นจะถูกเพิ่มเฉพาะตัวที่ยังไม่มี ถ้า Admin แก้ไขหรือสร้าง Role ชื่อเดียวกันไว้แล้วจะไม่ถูกทับ
- ถ้าฐานยังไม่มี Admin จะสร้างคนแรกจาก `INITIAL_ADMIN_EMAIL` และ `INITIAL_ADMIN_PASSWORD` ถ้าไม่ได้ตั้งไว้ container จะไม่ start เพราะถ้าขึ้นมาก็จะไม่มีใครเข้าระบบได้
- ถ้า API หรือ nginx ล้มซ้ำ 3 ครั้ง container จะหยุดตัวเองเพื่อให้ Docker หรือ orchestrator เริ่มใหม่

### รันในเครื่อง

```bash
# ครั้งแรก: สร้าง backend/.env.prod (ไม่เข้า git) พร้อม secret ใหม่ (JWT keypair, encryption key, blind index salt)
npm --prefix backend run env:init -- prod
# แล้วกรอกในไฟล์นั้น: MONGODB_URI (มีรหัสผ่านของฐาน), STORAGE_DRIVER / MINIO_*, SMTP_*
# และสำหรับการ start ครั้งแรกบนฐานว่าง: INITIAL_ADMIN_EMAIL + INITIAL_ADMIN_PASSWORD (ลบรหัสออกหลัง login ครั้งแรก)

# เมลทดสอบ (Mailpit): SMTP :1025 และกล่องจดหมาย http://localhost:8025
docker run -d --name mailpit --restart unless-stopped -p 1025:1025 -p 8025:8025 axllent/mailpit

docker compose up -d --build     # http://localhost:8080
docker logs -f testpulse
```

> secret ใน `.env.prod` ต้องเก็บไว้และใช้ชุดเดียวกับทุกตัวที่เชื่อมฐานข้อมูลเดียวกัน ข้อมูล (เช่นอีเมลผู้ใช้) ถูกเข้ารหัสด้วย key นี้ ถ้าเปลี่ยน key ข้อมูลเดิมจะอ่านไม่ได้

### Deploy บนเครื่องที่มีแค่ image

เครื่อง server ไม่ต้องมีซอร์สโค้ด ใช้แค่ image กับไฟล์ตั้งค่า (image ไม่มีไฟล์ env อยู่ข้างใน)

1. build และส่ง image (บนเครื่องที่มี repo)

   ```bash
   docker build -t testpulse:0.2.0 .
   # ส่งเป็นไฟล์ ...
   docker save testpulse:0.2.0 | gzip > testpulse-0.2.0.tar.gz
   scp testpulse-0.2.0.tar.gz server:/opt/testpulse/      # บน server: gunzip -c testpulse-0.2.0.tar.gz | docker load
   # ... หรือผ่าน registry: docker tag / docker push แล้ว docker pull บน server
   ```

2. เตรียมไฟล์ตั้งค่า (บนเครื่องที่มี repo) แล้วส่งไปแบบเข้ารหัส (`scp`)

   ```bash
   npm --prefix backend run env:init -- prod    # backend/.env.prod พร้อม secret ใหม่
   # กรอก BASE_URL, MONGODB_URI, STORAGE_DRIVER / MINIO_*, SMTP_*, INITIAL_ADMIN_* (ครั้งแรก)
   # เก็บสำเนา .env.prod ไว้ในที่เก็บ secret ของทีม (password manager / vault) ก่อน แล้วค่อยลบออกจากเครื่องนี้
   ```

3. บนเครื่อง server

   ```text
   /opt/testpulse
   |--- docker-compose.server.yml   จาก repo (แก้ image: ให้ตรงเวอร์ชัน)
   |--- backend/.env                จาก repo: ค่ากลาง ไม่มี secret
   |--- backend/.env.prod           จากข้อ 2 (chmod 600)
   |--- docker-data/                ไฟล์ upload และ log (สร้างให้เอง)
   ```

   ```bash
   cd /opt/testpulse
   docker compose -f docker-compose.server.yml up -d
   docker logs -f testpulse
   ```

- **แก้ค่าใน `.env.prod`** (รวมถึง key): `docker compose -f docker-compose.server.yml up -d --force-recreate` ไม่ต้อง build image ใหม่ (`docker compose restart` ไม่อ่าน env ใหม่)
- **อัปเดตเวอร์ชัน**: โหลด image ใหม่ แก้ `image:` แล้ว `docker compose -f docker-compose.server.yml up -d` (migration รันเองตอน start)
- **หมุน encryption key**: ดูหัวข้อ [หมุน encryption key](#หมุน-encryption-key-key-rotation)

### ค่าตั้งค่า (environment)

container อ่านค่าจากสองไฟล์ผ่าน `env_file` ของ compose ไฟล์หลังทับไฟล์แรก:

1. `backend/.env` ค่ากลางที่ใช้ร่วมกันทุก environment อยู่ใน git จึงห้ามใส่ secret
2. `backend/.env.prod` ค่าของ deployment นี้ ทั้งฐานข้อมูล, storage, SMTP และ secret ไม่เข้า git

ค่าที่ใส่ไว้ใน `environment:` ของ compose จะทับทั้งสองไฟล์ ส่วนพอร์ตและ path ภายใน container (API 127.0.0.1:8081, โฟลเดอร์ upload และ log) image กำหนดเองเสมอ

| ตัวแปร | ค่าใน `.env.prod` ที่ env:init สร้างให้ | หมายเหตุ |
| --- | --- | --- |
| `BASE_URL` | `http://localhost:8080` | URL ที่ผู้ใช้เปิด รวม sub path ถ้ามี เช่น `https://mydomain/testpulse` ใช้กับลิงก์เชิญ, CORS, path ของ cookie และ URL ไฟล์ |
| `MONGODB_URI` | host `:27017` ฐาน `testpulse` | MongoDB 6+ แบบ replica set (มี username/password อยู่ใน URI) |
| `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` / `INITIAL_ADMIN_NAME` | (ว่าง) / (ว่าง) / `ผู้ดูแลระบบ` | Admin คนแรกบนฐานว่าง ใน production รหัสต้องยาวอย่างน้อย 12 ตัว |
| `STORAGE_DRIVER` | `local` | `local` (เก็บที่โฟลเดอร์ `docker-data/uploads` ของ host) หรือ `minio` |
| `MINIO_ENDPOINT` / `MINIO_PORT` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | host | ใช้เมื่อ `STORAGE_DRIVER=minio` (bucket ชื่อตาม `MINIO_BUCKET` จะถูกสร้างให้ถ้ายังไม่มี) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | host | ใช้ส่งอีเมลเชิญผู้ใช้ (ทดสอบด้วย Mailpit `:1025`) |
| `AI_PROVIDER` / `OLLAMA_BASE_URL` / `OLLAMA_MODEL` / `AI_TIMEOUT_SEC` | `none` / (ว่าง) / (ว่าง) / `120` | ร่าง Test Case ด้วย AI จาก Ollama ที่ติดตั้งเอง ตั้ง `AI_PROVIDER=ollama` พร้อม URL ของ Ollama (เช่น `http://host.docker.internal:11434`) และชื่อ model ที่ pull ไว้แล้ว ถ้าเป็น `none` ปุ่ม AI จะถูกซ่อน |
| `COOKIE_SECURE` | `false` | ตั้ง `true` เมื่อเปิดผ่าน https |
| `TRUST_PROXY` | `loopback` | ถ้ามี reverse proxy ข้างหน้า ให้เพิ่ม address ของ proxy ด้วย (เช่น `loopback, 10.0.0.0/8`) เพื่อให้ IP ใน log และ rate limit ถูกต้อง |
| `LOG_LEVEL` / `LOG_RETENTION_DAYS` | `info` / `14` | ระดับ log ที่ console และจำนวนวันที่เก็บไฟล์ log |
| `RUN_DB_INDEXES` / `RUN_MIGRATIONS` | `true` | ตั้ง `false` ถ้าขั้น deploy อื่นทำให้แล้ว |

ค่ากลางอื่น ๆ (TTL ของ token, rate limit, BASE_PATH ฯลฯ) อยู่ใน `backend/.env` และแม่แบบของ `.env.prod` อยู่ใน `backend/env-example`

### หมุน encryption key (key rotation)

ข้อมูลส่วนตัว (เช่นอีเมลผู้ใช้) ถูกเข้ารหัสด้วย `ENCRYPTION_KEY_<ID>` ทุกค่าที่เข้ารหัสระบุ key ที่ใช้ไว้ในตัว (`enc:v1:…`) ระบบจึงอ่านได้ทุกค่าตราบที่ยังมี key นั้นใน environment ส่วน `ENCRYPTION_CURRENT_KEY_ID` บอกว่าข้อมูลที่เขียนใหม่ใช้ key ไหน

ทำบนเครื่อง server ได้เลย ไม่ต้อง build image ใหม่ ตัวอย่างด้านล่างหมุนจาก v1 ไป v2 ในโฟลเดอร์ deploy (เช่น `/opt/testpulse`)

1. **สร้าง key ใหม่ และเก็บลงที่เก็บ secret ก่อน** (password manager / vault) เพราะไม่มีที่ไหนแสดง key นี้ให้อีก

   ```bash
   openssl rand -hex 32
   ```

2. **แก้ `backend/.env.prod`**: เพิ่ม v2 และเปลี่ยน key ปัจจุบัน โดย **คง v1 ไว้**

   ```bash
   ENCRYPTION_KEY_V1=<key เดิม ห้ามลบในขั้นนี้>
   ENCRYPTION_KEY_V2=<key ใหม่จากข้อ 1>
   ENCRYPTION_CURRENT_KEY_ID=v2
   ```

   เพิ่มแค่ `ENCRYPTION_KEY_V2` โดยไม่เปลี่ยน `ENCRYPTION_CURRENT_KEY_ID` ระบบจะยังใช้ v1 ต่อ

3. **สร้าง container ใหม่ให้รับค่าใหม่** (`docker compose restart` ไม่อ่าน env ใหม่)

   ```bash
   docker compose -f docker-compose.server.yml up -d --force-recreate
   ```

   จากนี้ข้อมูลที่เขียนใหม่ใช้ v2 ส่วนข้อมูลเดิมยังเป็น v1 และยังอ่านได้ ระบบหยุดแค่ช่วงสร้าง container ใหม่ไม่กี่วินาที

4. **เข้ารหัสข้อมูลเดิมใหม่ด้วย v2** (ทำระหว่างระบบเปิดใช้งานได้ ทำทีละ 500 รายการ)

   ```bash
   docker exec -u testpulse -w /app/backend testpulse node dist/cli/rotate-keys.js
   ```

   log บอกจำนวนต่อ collection เช่น `[keys] users: 12 document(s) re-encrypted with "v2"`

5. **รันข้อ 4 ซ้ำ** จนทุก collection รายงาน `0 document(s)` แปลว่าไม่เหลือข้อมูลที่ใช้ v1 แล้ว

6. **เอา v1 ออก** จาก `backend/.env.prod` แล้วสร้าง container ใหม่อีกครั้ง

   ```bash
   docker compose -f docker-compose.server.yml up -d --force-recreate
   ```

   ตรวจว่า container ขึ้นปกติ (`docker logs testpulse`) และเข้าสู่ระบบด้วยบัญชีเดิมได้

ข้อควรระวัง

- **อย่าเอา key เก่าออกก่อนข้อ 5** ข้อมูลที่ยังใช้ key นั้นจะอ่านไม่ได้ทันที และผู้ใช้เข้าสู่ระบบไม่ได้
- **เก็บ key เก่าไว้ในที่เก็บ secret ต่อ** backup ฐานข้อมูลที่ทำก่อนหมุน key ยังเข้ารหัสด้วย key นั้น ถ้าต้อง restore ต้องใช้ ระบุให้ชัด เช่น "v1 ใช้กับ backup ก่อน 2026-11-01"
- **ทุก instance ที่ใช้ฐานเดียวกันต้องมีชุด key เดียวกัน** อัปเดต `.env.prod` และสร้าง container ใหม่ให้ครบทุกเครื่องก่อนรันข้อ 4
- **`BLIND_INDEX_SALT` ไม่ต้องหมุนและห้ามเปลี่ยน** ใช้ค้นผู้ใช้จากอีเมล (รวมถึงตอนเข้าสู่ระบบ) ไม่ได้ผูกกับ encryption key ถ้าเปลี่ยนจะค้นผู้ใช้เดิมไม่เจอ
- รอบต่อไปทำแบบเดียวกัน (v2 → v3) ชื่อ key เป็นตัวอักษรหรือตัวเลขอะไรก็ได้ (`ENCRYPTION_KEY_<ID>` คู่กับ `ENCRYPTION_CURRENT_KEY_ID=<id>` ไม่สนตัวพิมพ์เล็กใหญ่) แต่ละ key ต้องเป็น hex 64 ตัว

### Volume (เก็บไว้บน host)

| ใน container | ใน compose | เก็บอะไร |
| --- | --- | --- |
| `/app/backend/storage/uploads` | `./docker-data/uploads` | ไฟล์อัปโหลด (เมื่อ `STORAGE_DRIVER=local`) |
| `/app/backend/logs` | `./docker-data/logs` | `access-YYYY-MM-DD.log` (request ละบรรทัด) และ `error-YYYY-MM-DD.log` จาก winston หมุนไฟล์รายวัน |

container จะเปลี่ยนเจ้าของโฟลเดอร์ที่ mount ให้ user ในระบบเองตอนเริ่ม

### หลัง reverse proxy บน sub path

ตั้ง `BASE_URL=https://mydomain/testpulse` แล้วให้ proxy ส่งต่อมาที่พอร์ต 8080 ส่ง path มาทั้งแบบคง `/testpulse` ไว้หรือตัดออกก็ได้ ตัวอย่าง nginx:

```nginx
location /testpulse/ {
  proxy_pass http://testpulse-host:8080;      # คง /testpulse/ ไว้ใน path
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

และตั้ง `COOKIE_SECURE=true` (ถ้าเป็น https) กับ `TRUST_PROXY` ให้รวม address ของ proxy

### คำสั่งใน container

```bash
docker exec testpulse supervisorctl -c /etc/supervisord.conf status
docker exec -u testpulse -w /app/backend testpulse node dist/cli/rotate-keys.js   # หมุน encryption key (ดูขั้นตอนเต็มด้านบน)
```

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
docker exec -u testpulse -w /app/backend testpulse node dist/cli/rotate-keys.js   # หมุน encryption key
```

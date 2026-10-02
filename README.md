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
- จากนั้นสร้าง index ของฐานข้อมูล (ปิดได้ด้วย `RUN_DB_INDEXES=false`) แล้วจึงเปิดให้ใช้งาน
- ถ้า API หรือ nginx ล้มซ้ำ 3 ครั้ง container จะหยุดตัวเองเพื่อให้ Docker หรือ orchestrator เริ่มใหม่

### รันในเครื่อง

```bash
# ครั้งแรก: สร้าง secret (JWT keypair, encryption key, blind index salt) เก็บไว้ที่ docker/secrets.env (ไม่เข้า git)
npm --prefix backend run env:init -- --secrets-only ../docker/secrets.env
# แล้วเพิ่มรหัสของบริการในไฟล์เดียวกันตามที่ใช้: MINIO_ACCESS_KEY, MINIO_SECRET_KEY, SMTP_USER, SMTP_PASSWORD

# เมลทดสอบ (Mailpit): SMTP :1025 และกล่องจดหมาย http://localhost:8025
docker run -d --name mailpit --restart unless-stopped -p 1025:1025 -p 8025:8025 axllent/mailpit

docker compose up -d --build     # http://localhost:8080
docker logs -f testpulse
```

> secret ต้องเก็บไว้และใช้ชุดเดียวกับทุกตัวที่เชื่อมฐานข้อมูลเดียวกัน ข้อมูล (เช่นอีเมลผู้ใช้) ถูกเข้ารหัสด้วย key นี้ ถ้าเปลี่ยน key ข้อมูลเดิมจะอ่านไม่ได้

### ค่าตั้งค่า (environment)

ตั้งใน `docker-compose.yml` หรือส่งจาก shell หรือจากไฟล์ `.env` ข้างไฟล์ compose เช่น `STORAGE_DRIVER=minio docker compose up -d`

| ตัวแปร | ค่าเริ่มต้นใน compose | หมายเหตุ |
| --- | --- | --- |
| `BASE_URL` | `http://localhost:8080` | URL ที่ผู้ใช้เปิด รวม sub path ถ้ามี เช่น `https://mydomain/testpulse` ใช้กับลิงก์เชิญ, CORS, path ของ cookie และ URL ไฟล์ |
| `MONGODB_URI` | replica set บน host `:20001` | MongoDB 6+ แบบ replica set |
| `STORAGE_DRIVER` | `local` | `local` (เก็บที่โฟลเดอร์ `docker-data/uploads` ของ host) หรือ `minio` |
| `MINIO_ENDPOINT` / `MINIO_PORT` / `MINIO_USE_SSL` / `MINIO_BUCKET` | MinIO บน host `:9001` | ใช้เมื่อ `STORAGE_DRIVER=minio` (bucket จะถูกสร้างให้ถ้ายังไม่มี) ส่วน `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` ใส่ใน `docker/secrets.env` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `MAIL_FROM` | Mailpit บน host `:1025` | ใช้ส่งอีเมลเชิญผู้ใช้ ถ้า server ต้อง login ให้ใส่ `SMTP_USER` / `SMTP_PASSWORD` ใน `docker/secrets.env` |
| `COOKIE_SECURE` | `false` | ตั้ง `true` เมื่อเปิดผ่าน https |
| `TRUST_PROXY` | `loopback` | ถ้ามี reverse proxy ข้างหน้า ให้เพิ่ม address ของ proxy ด้วย (เช่น `loopback, 10.0.0.0/8`) เพื่อให้ IP ใน log และ rate limit ถูกต้อง |
| `LOG_LEVEL` / `LOG_RETENTION_DAYS` | `info` / `14` | ระดับ log ที่ console และจำนวนวันที่เก็บไฟล์ log |
| `RUN_DB_INDEXES` | `true` | ตั้ง `false` ถ้าขั้น deploy อื่นสร้าง index ให้แล้ว |

ค่าอื่นทั้งหมดอยู่ใน `backend/env-example`

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

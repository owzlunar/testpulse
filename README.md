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

> ติดตั้ง prod แบบครบชุด (MongoDB + MinIO + แอป บนเครื่องเดียวใน Docker network ภายใน, https ด้วย proxy, เครื่อง off-site สำหรับ backup, Ubuntu 24.04) ดู [deploy/README.md](deploy/README.md) หัวข้อนี้คือแบบแอปตัวเดียวที่ต่อ MongoDB / MinIO ที่มีอยู่แล้ว

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
   |--- scripts/ + backup.env       สำรองและกู้คืนข้อมูล (ดูหัวข้อด้านล่าง)
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

### สำรองและกู้คืนข้อมูล

`scripts/backup.sh` สำรองฐานข้อมูลและไฟล์อัปโหลดไปเก็บใน MinIO / S3 ใน bucket ที่ล็อกไว้ ไม่มีใครลบ backup ได้ก่อนครบอายุ (ค่าเริ่มต้น 14 วัน) แล้ว mirror ไปอีกเครื่อง (off-site) `scripts/restore.sh` ใช้กู้คืน และ `scripts/verify.sh` ใช้ตรวจว่า backup ครบและกู้ได้จริง ทุกตัวรันในโฟลเดอร์ deploy และใช้แค่ Docker บน server (`mongodump`, `mongorestore`, `mongosh` และ `mc` รันใน container)

```text
scripts/
|--- backup.sh            init (สร้าง bucket) / สำรอง / list
|--- restore.sh           กู้คืนลงฐานที่เลือก (+ ไฟล์อัปโหลดเมื่อเป็น local)
|--- verify.sh            ตรวจ storage / ตรวจผลการกู้ (อ่านอย่างเดียว)
|--- verify-db.js         ส่วนเทียบฐานข้อมูลของ verify.sh (mongosh)
|--- backup-common.sh     ส่วนที่ใช้ร่วมกัน
|--- backup.env.example   แม่แบบของ backup.env
```

| ข้อมูล | `STORAGE_DRIVER=local` | `STORAGE_DRIVER=minio` |
| --- | --- | --- |
| ฐานข้อมูล | `<bucket backup>/db/<ฐาน>-<วันเวลา>.archive.gz` | เหมือนกัน |
| ไฟล์อัปโหลด | `<bucket backup>/uploads/uploads-<วันเวลา>.tar.gz` | อยู่ใน bucket ของแอปอยู่แล้ว เปิด versioning ไว้ (ไฟล์ที่ถูกเขียนทับหรือลบ กู้เวอร์ชันเดิมได้ภายใน 14 วัน) และ mirror bucket นี้ไป off-site ด้วย |
| `backend/.env.prod` | **ไม่อยู่ใน backup** เก็บไว้ในที่เก็บ secret ของทีม พร้อม key ทุกเวอร์ชันที่ backup ยังใช้อยู่ | เหมือนกัน |

**ติดตั้ง (ครั้งเดียว)** วางโฟลเดอร์ `scripts/` จาก repo ไว้ในโฟลเดอร์ deploy แล้ว

```bash
cd /opt/testpulse
cp scripts/backup.env.example backup.env && chmod 600 backup.env
# กรอก MONGODB_URI (ตัวเดียวกับ .env.prod แต่ใช้ host.docker.internal แทน localhost),
# BACKUP_S3_* (พอร์ต API ของ MinIO ไม่ใช่หน้า console), OFFSITE_S3_*, STORAGE_DRIVER ให้ตรงกับ .env.prod
scripts/backup.sh init      # สร้าง bucket ทั้งสองฝั่ง: object lock, versioning, อายุ 14 วัน (รันซ้ำได้)
scripts/backup.sh && scripts/verify.sh    # ลองสำรองรอบแรกและตรวจ ต้องจบด้วย passed
```

- bucket backup ฝั่ง off-site ต้องเปิด object lock ตั้งแต่ตอนสร้าง ถ้ามี bucket ชื่อนั้นอยู่แล้วแบบไม่ล็อก `init` จะหยุดและแจ้ง เพราะเปิดล็อกภายหลังไม่ได้
- user ของ MongoDB ใน `MONGODB_URI` ต้องอ่านฐานได้ ส่วน `RESTORE_MONGODB_URI` (ถ้ามี) ใช้เขียนฐานที่จะกู้ลงไป
- MongoDB / MinIO ที่ไม่ได้เปิดพอร์ตบน host (อยู่ใน Docker network เดียวกับแอป เช่น [deploy/](deploy/README.md)): ตั้ง `BACKUP_DOCKER_NETWORK=<ชื่อ network>` แล้วใช้ชื่อ service ใน URI (`mongodb-prod:27017`, `http://minio-prod:9001`) container ของ `mongodump` / `mc` จะเข้า network นั้น

**สำรอง**

```bash
scripts/backup.sh           # dump ฐาน → ตรวจไฟล์ → อัปโหลด → (local) แพ็กไฟล์อัปโหลด → mirror off-site
scripts/backup.sh list      # รายการ backup ทั้งสองฝั่ง
```

ถ้าขั้นไหนล้ม สคริปต์จะหยุดพร้อมข้อความ `ERROR` และ exit code 1 ระหว่าง dump จะเก็บไฟล์ไว้ที่ `docker-data/backup-work` ก่อน และลบทิ้งเมื่อจบ dump ที่เสียจึงไม่ถูกอัปโหลดไปค้างใน bucket ที่ลบไม่ได้

**ตั้งเวลาสำรองอัตโนมัติ (cron)** สคริปต์ไม่ได้ตั้งเวลาเอง ใช้ crontab ของ user ที่สั่ง `docker` ได้ (`crontab -e`)

```cron
# ทุกวัน 02:00: สำรองแล้วตรวจ เก็บ log ไว้ที่ docker-data/backup.log
0 2 * * * cd /opt/testpulse && PATH=/usr/local/bin:/usr/bin:/bin && { scripts/backup.sh && scripts/verify.sh; } >> docker-data/backup.log 2>&1
```

- cron ไม่รู้จักโฟลเดอร์ deploy และ `PATH` สั้นมาก ต้องมี `cd` และ `PATH` ที่หา `docker` เจอเสมอ
- ดูผลด้วย `tail -n 30 docker-data/backup.log` ทุกรอบต้องจบด้วย `[verify] passed` ถ้าเจอ `ERROR` หรือ `FAILED` ให้แก้ก่อนรอบถัดไป
- macOS (เครื่องทดสอบ): เปิด Full Disk Access ให้ `/usr/sbin/cron` ถ้าโฟลเดอร์ deploy อยู่ใน Desktop / Documents, Docker Desktop ต้องเปิดอยู่ และเครื่องที่ sleep ตอนถึงเวลาจะข้ามรอบนั้น

**กู้คืน** ลองกู้ลงฐานอื่นก่อนเสมอ แล้วตรวจด้วย `verify.sh restore`

```bash
scripts/restore.sh --to-db testpulse-restore                    # backup ล่าสุดของฝั่งนี้
scripts/restore.sh --to-db testpulse-restore --from off \
  --file testpulse-20261005-020000.archive.gz                   # ไฟล์ที่ระบุ จาก off-site
scripts/restore.sh --to-db testpulse-restore --uploads-to ./docker-data/uploads-restored   # local: ได้ไฟล์อัปโหลดของรอบเดียวกันด้วย
```

กู้ทับฐานจริง (ตอนเกิดเหตุ) ต้องหยุดแอปก่อน ใส่ `--overwrite-live` และพิมพ์ชื่อฐานยืนยัน collection ที่อยู่ใน backup จะถูกแทนที่ทั้งหมด ถ้ามีเวลา ให้กู้ไฟล์เดียวกันลงฐานอื่นและผ่าน `verify.sh restore` ก่อน แล้วค่อยกู้ทับ

```bash
docker compose -f docker-compose.server.yml stop testpulse
scripts/restore.sh --to-db testpulse --overwrite-live
# local: กู้ไฟล์ลงโฟลเดอร์ใหม่ (--uploads-to) แล้วสลับกับ docker-data/uploads
docker compose -f docker-compose.server.yml start testpulse
```

**ตรวจ backup** (`scripts/verify.sh` อ่านอย่างเดียว ไม่แก้อะไรทั้งใน MongoDB และ MinIO)

```bash
scripts/verify.sh                                   # ตรวจ storage: ล็อก / versioning เปิดอยู่, ทุกไฟล์มีที่ off-site ขนาดตรงกัน,
                                                    #   dump ล่าสุดไม่เก่ากว่า 26 ชม. และเปิดอ่านได้ (ดึงจาก off-site)
scripts/verify.sh restore --db testpulse-restore    # หลัง restore.sh: เทียบกับฐานจริง แล้วหาไฟล์อัปโหลดทุกไฟล์ที่ข้อมูลอ้างถึง
scripts/verify.sh restore --db testpulse-restore --uploads-dir ./docker-data/uploads-restored   # local
```

แต่ละบรรทัดขึ้นต้นด้วย `ok`, `WARN` หรือ `FAIL` ถ้ามี `FAIL` จะได้ exit code 1

| ผล | ความหมาย |
| --- | --- |
| `ok` | จำนวน, index และเอกสารที่สุ่มเทียบ (ค่าเริ่มต้น 500 ต่อ collection, `--sample N`) ตรงกับฐานจริง |
| `WARN` | ต่างกันแบบที่เกิดได้หลัง backup เช่นมีข้อมูลใหม่หรือแก้ไข, collection ที่มีแต่ในฐานที่กู้ (ของค้างในฐานนั้นก่อนกู้ ควรกู้ลงฐานว่าง) หรือ backup เก่ากว่า `VERIFY_MAX_AGE_HOURS` |
| `FAIL` | collection หรือ index หาย, collection กลับมาว่าง, เอกสารที่เทียบไม่ตรงกับฐานจริงเลยสักตัว (เลือก backup หรือฐานผิด), ไฟล์ไม่มีที่ off-site หรือขนาดไม่ตรง, dump เสีย |

`refresh_tokens`, `notifications`, `audit_logs`, `job_locks`, `invites` และ `preflight` เปลี่ยนตลอดเวลาที่ใช้งาน จึงแสดงแค่จำนวนแต่ไม่นับเป็นความต่าง ใส่ `scripts/verify.sh` ต่อท้าย `backup.sh` ใน cron ได้ (`backup.sh && verify.sh`)

- backup ที่ทำก่อนหมุน encryption key ต้องใช้ key เก่าตอนกู้ (ดู [หมุน encryption key](#หมุน-encryption-key-key-rotation))
- `STORAGE_DRIVER=minio`: ไฟล์ที่ถูกลบหรือเขียนทับ ดูเวอร์ชันเดิมด้วย `mc ls --versions` แล้วกู้ด้วย `mc cp --version-id`
- ทดลองกู้เป็นระยะ backup ที่ไม่เคยลองกู้ ยังไม่รู้ว่าใช้ได้จริง

**ซ้อมกู้คืน (แนะนำเดือนละครั้ง)** ไม่กระทบข้อมูลจริง: `restore.sh` เขียนเฉพาะฐานใน `--to-db` และ `verify.sh` อ่านอย่างเดียว

```bash
cd /opt/testpulse
scripts/verify.sh                                              # 1. storage ครบและ dump ล่าสุดอ่านได้
scripts/restore.sh --to-db testpulse-restore --from off        # 2. กู้ dump ล่าสุดจาก off-site ลงฐานว่าง
#    local: เพิ่ม --uploads-to ./docker-data/uploads-restored
scripts/verify.sh restore --db testpulse-restore               # 3. เทียบกับฐานจริง + หาไฟล์อัปโหลดทุกไฟล์
#    local: เพิ่ม --uploads-dir ./docker-data/uploads-restored
# 4. เก็บกวาด: ลบฐาน testpulse-restore (และ docker-data/uploads-restored) แล้วจดผล: วันที่, ไฟล์ dump, passed / FAILED
```

- กู้ลงฐานที่ว่างหรือยังไม่มี ถ้าฐานนั้นมี collection อื่นค้างอยู่ `verify.sh` จะขึ้น `WARN` ว่ามีแต่ในฐานที่กู้
- `RESTORE_MONGODB_URI` ต้องเป็น user ที่สร้างหรือเขียนฐาน `testpulse-restore` ได้ (ใช้ทั้งตอนกู้และตอนอ่านฐานที่กู้) ส่วนฐานจริงอ่านด้วย `MONGODB_URI`

**กู้คืนบนเครื่องใหม่ (เครื่อง prod พัง)** ใช้สำเนา off-site ทั้งหมด ข้อมูลหลัง backup รอบสุดท้ายจะหาย (cron 02:00 = ไม่เกินประมาณ 1 วัน) และต้องกู้ก่อน backup ที่ off-site หมดอายุ (`BACKUP_RETENTION_DAYS`) เพราะไม่มีรอบใหม่เข้ามาแทนแล้ว

1. เตรียมเครื่องใหม่ **ยังไม่เปิดแอป**: Docker, MongoDB แบบ replica set พร้อม user ตาม `MONGODB_URI`, MinIO (ถ้าใช้ `STORAGE_DRIVER=minio` หรือจะเก็บ backup ฝั่งนี้ไว้ใน MinIO ของเครื่องนี้) และโฟลเดอร์ deploy ตามข้อ 3 ของ [Deploy บนเครื่องที่มีแค่ image](#deploy-บนเครื่องที่มีแค่-image) ใช้ image เวอร์ชันเดียวกับเครื่องเก่า
2. `backend/.env.prod` เอามาจากที่เก็บ secret ของทีม **ต้องเป็นชุด key เดิม** (encryption key ทุกเวอร์ชันที่ backup ยังใช้ และ `BLIND_INDEX_SALT` ตัวเดิม) ไม่อย่างนั้นอ่านข้อมูลที่เข้ารหัสไม่ได้และเข้าสู่ระบบไม่ได้ ถ้า host ของ MongoDB / MinIO เปลี่ยนให้แก้ในไฟล์นี้
3. สร้าง `backup.env`: `MONGODB_URI` และ `BACKUP_S3_*` ชี้ไปเครื่องใหม่, `OFFSITE_S3_*` ค่าเดิม, `STORAGE_DRIVER` ตรงกับ `.env.prod` (ฝั่ง `BACKUP_S3_*` ต้องกรอก แต่ตอนกู้ `--from off` ใช้เฉพาะเมื่อมี `--uploads-from-off`)
4. กู้ฐานและไฟล์อัปโหลดจาก off-site ลงฐานจริง (แอปยังไม่รัน จึงกู้ทับได้ทันที สคริปต์ให้พิมพ์ชื่อฐานยืนยัน)

   ```bash
   cd /opt/testpulse
   scripts/restore.sh list                   # ดูฝั่ง off-site ฝั่งนี้ยังว่าง
   # local: แตกไฟล์อัปโหลดของรอบเดียวกันลง docker-data/uploads (ต้องว่างหรือยังไม่มี)
   scripts/restore.sh --to-db testpulse --from off --overwrite-live --uploads-to ./docker-data/uploads
   # minio: copy bucket ไฟล์จาก off-site มา bucket ของเครื่องนี้ (ต้องว่างหรือยังไม่มี) ได้เวอร์ชันล่าสุดของทุกไฟล์
   scripts/restore.sh --to-db testpulse --from off --overwrite-live --uploads-from-off
   # ไม่ใช่ dump ล่าสุด: เพิ่ม --file testpulse-<วันเวลา>.archive.gz
   ```

5. เปิดแอป `docker compose -f docker-compose.server.yml up -d` ดู `docker logs -f testpulse` ว่า preflight / index / migration ผ่าน แล้วลองเข้าสู่ระบบด้วย user เดิมและเปิดไฟล์แนบ (`verify.sh restore` ใช้ไม่ได้ในกรณีนี้ เพราะเทียบกับฐานจริงซึ่งคือฐานที่เพิ่งกู้)
6. ตั้ง backup ของเครื่องใหม่: `scripts/backup.sh init` (ฝั่ง off-site ที่มีอยู่แล้วรันซ้ำได้), `scripts/backup.sh && scripts/verify.sh` ต้องจบด้วย `passed` แล้วใส่ cron

- อย่าให้แอปบนเครื่องใหม่ใช้เครื่อง off-site เป็นที่เก็บหลัก copy ออกมาเสมอ off-site ต้องเป็นสำเนาแยกต่อไป
- `--uploads-from-off` ได้ไฟล์ทุกไฟล์ที่เคยอยู่ใน bucket รวมถึงไฟล์ที่ถูกลบไปแล้ว (backup ไม่ส่งการลบไป off-site) ไฟล์เกินพวกนี้ไม่มีอะไรอ้างถึง ไม่กระทบการใช้งาน

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

# การแจ้งเตือนแบบ real-time (server-sent events): ส่งทีละ event ทันที ห้ามพักหรือบีบอัด
location /testpulse/api/v1/notifications/stream {
  proxy_pass http://testpulse-host:8080;
  proxy_http_version 1.1;
  proxy_set_header Connection "";
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_buffering off;
  proxy_cache off;
  gzip off;
  proxy_read_timeout 1h;                       # ต้องนานกว่า heartbeat ของ API (ทุก 25 วินาที)
}
```

และตั้ง `COOKIE_SECURE=true` (ถ้าเป็น https) กับ `TRUST_PROXY` ให้รวม address ของ proxy

- image ส่ง header `X-Accel-Buffering: no` มากับ stream แล้ว nginx ด้านหน้าจึงไม่พักข้อมูลเองแม้ไม่มี `location` ที่สอง แต่ให้ใส่ไว้เสมอ เพราะ `gzip` ที่เปิดกับ `text/event-stream`, proxy ที่ไม่ใช่ nginx หรือ CDN อาจยังพัก stream จนการแจ้งเตือนไม่มาถึง
- proxy ตัวอื่น (Apache, Traefik, Caddy, CDN) ให้ปิด buffering, ปิดการบีบอัด และตั้ง read timeout ให้นานกว่า 25 วินาที สำหรับ path `…/api/v1/notifications/stream`
- ถ้า event ไม่มาหรือมาเป็นก้อน ลอง `curl -N -H "Authorization: Bearer <token>" https://mydomain/testpulse/api/v1/notifications/stream` ต้องเห็น `: connected` ทันที และ `: ping` ทุก 25 วินาที

### คำสั่งใน container

```bash
docker exec testpulse supervisorctl -c /etc/supervisord.conf status
docker exec -u testpulse -w /app/backend testpulse node dist/cli/rotate-keys.js   # หมุน encryption key (ดูขั้นตอนเต็มด้านบน)
```

# TestPulse บน prod (Ubuntu 24.04)

ชุดไฟล์สำหรับติดตั้ง TestPulse บน server จริง: Ubuntu 24.04, Docker รุ่นล่าสุด, 4 vCPU / 8 GB / 100 GB เปิดออกนอกเครื่องแค่ 80/443 ทุก service คุยกันใน Docker network `testpulse` ใช้ certificate แบบ wildcard ที่มีอยู่แล้ว

ต่างจาก `docker-compose.server.yml` ที่ root ของ repo (แอปตัวเดียว ต่อ MongoDB / MinIO ผ่าน `host.docker.internal`): ชุดนี้รวม MongoDB และ MinIO ไว้บนเครื่องเดียวกันใน network ภายใน, proxy ทำ https และมีเครื่อง off-site สำหรับ backup การสำรองและกู้คืนใช้ `scripts/` และขั้นตอนใน [README หลัก หัวข้อสำรองและกู้คืนข้อมูล](../README.md#สำรองและกู้คืนข้อมูล) โดยรันใน `/opt/testpulse`

## สารบัญ

- [ไฟล์ในชุดนี้](#ไฟล์ในชุดนี้)
- [1. เตรียม Ubuntu 24.04](#1-เตรียม-ubuntu-2404)
- [2. วางไฟล์และตั้งค่า](#2-วางไฟล์และตั้งค่า)
- [3. MongoDB และ MinIO](#3-mongodb-และ-minio)
- [4. เครื่อง off-site (mirror)](#4-เครื่อง-off-site-mirror)
- [5. backup.env และสร้าง bucket](#5-backupenv-และสร้าง-bucket)
- [6. TestPulse และ proxy (https)](#6-testpulse-และ-proxy-https)
- [7. ใช้งานครั้งแรก](#7-ใช้งานครั้งแรก)
- [8. backup อัตโนมัติ](#8-backup-อัตโนมัติ)
- [9. งานประจำ](#9-งานประจำ)

## ไฟล์ในชุดนี้

```text
deploy/ (+ scripts/, backend/.env)   รวมเป็นชุดเดียวแล้ว copy ไปที่ /opt/testpulse บน server (ข้อ 2)
|--- README.md                       ไฟล์นี้
|--- docker-compose.yml              mongodb-prod + minio-prod (สร้าง network testpulse)
|--- docker-compose.server.yml       testpulse + proxy (80 -> https, 443)
|--- env.example                     แม่แบบของ .env (รหัส MongoDB / MinIO, cache)
|--- backup.env.example              แม่แบบของ backup.env (ค่า prod)
|--- backend/.env                    ค่ากลาง (จาก backend/.env ของ repo ไม่มี secret)
|--- proxy/nginx.conf                https + sub path /testpulse
|--- proxy/certs/                    ใส่ fullchain.pem + privkey.pem
|--- scripts/                        backup.sh / restore.sh / verify.sh (จาก scripts/ ของ repo)
|--- mirror/                         ชุดของเครื่อง off-site (copy ไปอีกเครื่อง)
     |--- docker-compose.yml         minio-mirror + nginx (443)
     |--- nginx.conf                 https + รับเฉพาะ IP ของ prod
     |--- certs/                     ใส่ fullchain.pem + privkey.pem
```

ไฟล์ที่สร้างบน server ภายหลัง (ห้าม commit / ห้ามส่งทางแชต): `.env`, `mongodb-keyfile`, `backend/.env.prod`, `backup.env`, `proxy/certs/*.pem` ข้อมูลอยู่ใน `mongo-prod/`, `minio-prod/`, `docker-data/`

| service | ใน network `testpulse` | เปิดบน host |
| --- | --- | --- |
| `mongodb-prod` | `mongodb-prod:27017` | ไม่เปิด |
| `minio-prod` | API `minio-prod:9001` | console `127.0.0.1:9000` (SSH tunnel) |
| `testpulse` | `testpulse:8080` | ไม่เปิด |
| `testpulse-proxy` | | `80` (redirect), `443` |

---

## 1. เตรียม Ubuntu 24.04

1. อัปเดต, ตั้ง timezone (ชื่อไฟล์ backup และ cron ใช้เวลาเครื่อง)

   ```bash
   sudo apt-get update && sudo apt-get -y upgrade
   sudo timedatectl set-timezone Asia/Bangkok
   timedatectl          # Time zone: Asia/Bangkok, System clock synchronized: yes
   ```

2. swap 4 GB (กัน RAM เต็มชั่วคราวตอน backup แล้ว OOM killer ฆ่า MongoDB)

   ```bash
   sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   free -h              # Swap: 4.0Gi
   ```

3. Docker จาก repo ของ Docker เอง (ไม่ใช้ `docker.io` ของ Ubuntu หรือ snap ซึ่งมักเก่ากว่า)

   ```bash
   sudo apt-get install -y ca-certificates curl
   sudo install -m 0755 -d /etc/apt/keyrings
   sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
   sudo chmod a+r /etc/apt/keyrings/docker.asc
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" \
     | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
   sudo apt-get update
   sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   sudo usermod -aG docker $USER          # ออกจากระบบแล้วเข้าใหม่ 1 ครั้ง
   docker version && docker compose version
   ```

4. firewall: เปิด SSH, 80, 443

   ```bash
   sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
   sudo ufw enable && sudo ufw status
   ```

   **Docker ข้าม ufw:** พอร์ตที่ Docker publish จะเปิดออกนอกเครื่องเสมอ ไม่ว่า ufw จะตั้งไว้อย่างไร ชุดนี้จึงไม่ publish อะไรเลยนอกจาก proxy (80/443) และ console ของ MinIO ที่ผูกไว้กับ `127.0.0.1` อย่าเพิ่ม `ports:` ให้ MongoDB / MinIO API / testpulse

---

## 2. วางไฟล์และตั้งค่า

1. รวมชุดจาก repo (ใช้ tag ของเวอร์ชันที่จะ deploy เช่น `v0.3.0` หรือ `dev`) แล้ว copy ไปที่ server ให้ user ที่ใช้ Docker เป็นเจ้าของ

   ```bash
   # บนเครื่องที่มี repo
   rm -rf /tmp/testpulse-deploy && mkdir -p /tmp/testpulse-deploy
   git archive <tag หรือ branch> deploy scripts backend/.env | tar -x -C /tmp/testpulse-deploy
   cd /tmp/testpulse-deploy && cp -R deploy/. . && rm -rf deploy && cd -
   scp -r /tmp/testpulse-deploy <user>@<server>:/tmp/
   # บน server
   sudo mv /tmp/testpulse-deploy /opt/testpulse && sudo chown -R $USER: /opt/testpulse
   cd /opt/testpulse
   ```

2. โหลด image ของแอป (ไฟล์ที่ build ไว้ หรือ pull จาก registry)

   ```bash
   gunzip -c testpulse-0.3.0.tar.gz | docker load      # ได้ testpulse:0.3.0
   ```

3. certificate (wildcard): `fullchain.pem` = certificate ต่อด้วย intermediate ของ CA, `privkey.pem` = key

   ```bash
   cp <cert> proxy/certs/fullchain.pem && cp <key> proxy/certs/privkey.pem
   chmod 600 proxy/certs/privkey.pem
   openssl x509 -in proxy/certs/fullchain.pem -noout -subject -enddate    # CN=*.<โดเมน>, วันหมดอายุ
   ```

   แก้ `server_name qa.example.com` ใน `proxy/nginx.conf` เป็นชื่อจริง (อยู่ใต้ wildcard)

4. `.env` (รหัส MongoDB / MinIO) และ keyfile

   ```bash
   cp env.example .env && chmod 600 .env
   sed -i "s/^MONGO_ROOT_PASSWORD=.*/MONGO_ROOT_PASSWORD=$(openssl rand -hex 24)/; s/^TESTPULSE_DB_PASSWORD=.*/TESTPULSE_DB_PASSWORD=$(openssl rand -hex 24)/; s/^MINIO_ROOT_PASSWORD=.*/MINIO_ROOT_PASSWORD=$(openssl rand -hex 24)/" .env
   ( umask 077 && openssl rand -base64 756 > mongodb-keyfile ) && chmod 400 mongodb-keyfile
   ```

5. `backend/.env.prod`: สร้างบนเครื่องที่มี repo (ได้ secret ใหม่) แล้วส่งขึ้นมา

   ```bash
   # เครื่องที่มี repo
   npm --prefix backend run env:init -- prod
   scp backend/.env.prod <user>@<server>:/opt/testpulse/backend/.env.prod && rm backend/.env.prod
   # server
   chmod 600 /opt/testpulse/backend/.env.prod
   ```

   แก้ค่าเหล่านี้ (รหัสผ่านเอาจาก `.env`)

   | ตัวแปร | ค่า |
   | --- | --- |
   | `BASE_URL` | `https://qa.example.com/testpulse` (ตรงกับ `server_name`) |
   | `COOKIE_SECURE` | `true` |
   | `TRUST_PROXY` | `2` (proxy นี้ + nginx ในแอป ถ้ามี load balancer อยู่หน้าอีกชั้นให้เป็น `3`) |
   | `MONGODB_URI` | `mongodb://testpulse:<TESTPULSE_DB_PASSWORD>@mongodb-prod:27017/testpulse?authSource=admin&replicaSet=rs0&directConnection=true` |
   | `STORAGE_DRIVER` | `minio` |
   | `MINIO_ENDPOINT` / `MINIO_PORT` | `minio-prod` / `9001` |
   | `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` จาก `.env` |
   | `MAIL_DRIVER` / `SMTP_*` | `smtp` และ SMTP จริงขององค์กร |
   | `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` | Admin คนแรก (รหัส 12 ตัวขึ้นไป) ใช้ครั้งแรกเท่านั้น |
   | `BACKUP_AGENT` | `embedded` (backup agent ทำงานใน container ของแอป: ตั้งเวลา สำรอง ซ้อมกู้ แจ้งเตือน จากหน้า "สำรองข้อมูล") |
   | `BACKUP_AGENT_TOKEN` | ค่าที่ `env:init` สร้างให้ **ใส่ค่าเดียวกันใน `backup.env`** (ข้อ 5) ไม่ตรงกันแอปจะไม่ start |

   `JWT_*`, `ENCRYPTION_KEY_*`, `BLIND_INDEX_SALT` จาก `env:init` **ห้ามเปลี่ยนหลังมีข้อมูล**

6. **เก็บเข้าที่เก็บ secret ของทีมทันที:** `backend/.env.prod`, `.env`, (หลังข้อ 5) `backup.env` และรหัสของ Admin ถ้า server หาย การกู้ต้องใช้ไฟล์ชุดนี้เท่านั้น ส่วน image (`testpulse-0.3.0.tar.gz`) เก็บไว้ที่ registry หรือที่เก็บไฟล์ของทีม

---

## 3. MongoDB และ MinIO

```bash
cd /opt/testpulse
docker compose -f docker-compose.yml up -d            # สร้าง network testpulse ด้วย
until [ "$(docker inspect -f '{{.State.Health.Status}}' mongodb-prod)" = healthy ]; do sleep 3; done; echo mongo healthy
docker inspect -f '{{.State.Health.Status}}' minio-prod  # healthy
```

healthcheck ของ MongoDB สั่ง `rs.initiate()` ให้เองบนฐานใหม่ (ครั้งแรกประมาณ 30-60 วินาที)

สร้าง user ของแอป (readWrite บน `testpulse`; readWrite + dbAdmin บน `testpulse-restore` ซึ่ง backup agent ใช้ซ้อมกู้และลบทิ้งหลังซ้อม) รันซ้ำได้

```bash
P=$(grep '^TESTPULSE_DB_PASSWORD=' .env | cut -d= -f2)
docker exec -i -e P="$P" mongodb-prod bash -c 'mongosh --quiet -u admin -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' <<'EOF'
const a = db.getSiblingDB('admin');
const roles = [{ role: 'readWrite', db: 'testpulse' }, { role: 'readWrite', db: 'testpulse-restore' }, { role: 'dbAdmin', db: 'testpulse-restore' }];
if (a.getUser('testpulse')) { a.updateUser('testpulse', { pwd: process.env.P, roles }) } else { a.createUser({ user: 'testpulse', pwd: process.env.P, roles }) }
print(a.getUser('testpulse') ? 'user testpulse ok: ' + a.getUser('testpulse').roles.map(r => r.db).join(', ') : 'user testpulse MISSING');
EOF
docker run --rm --network testpulse -e P="$P" mongo:8 bash -c \
  'mongosh --quiet "mongodb://testpulse:$P@mongodb-prod:27017/testpulse?authSource=admin&replicaSet=rs0&directConnection=true" --eval "db.runCommand({ping:1}).ok"'
# ต้องได้ user testpulse ok: ... และ 1
```

mongosh อ่าน stdin ทีละบรรทัด แต่ละคำสั่งต้องจบในบรรทัดเดียว

---

## 4. เครื่อง off-site (mirror)

เครื่องอื่น (หรือที่เก็บของผู้ให้บริการอื่น) disk อย่างน้อยเท่ากับ MinIO ของ prod แนะนำ 1.5-2 เท่า (mirror ไม่ลบตาม prod) 1-2 vCPU / 1-2 GB เตรียม Ubuntu + Docker ตามข้อ 1 (firewall เปิดแค่ SSH และ 443)

```bash
# บนเครื่อง mirror: copy โฟลเดอร์ mirror/ ไปที่ /opt/testpulse-mirror
cd /opt/testpulse-mirror
printf 'MINIO_ROOT_USER=testpulse-mirror\nMINIO_ROOT_PASSWORD=%s\n' "$(openssl rand -hex 24)" > .env && chmod 600 .env
cp <cert> certs/fullchain.pem && cp <key> certs/privkey.pem && chmod 600 certs/privkey.pem
# แก้ nginx.conf: server_name ของ MinIO (backup.example.com) และของ Uptime Kuma (kuma.example.com),
# allow <IP สาธารณะของ prod> ทั้งสองที่
docker compose up -d
docker compose ps                                   # minio-mirror healthy, uptime-kuma healthy, mirror-proxy Up
```

**Uptime Kuma** (ตัวเฝ้าจากนอกเครื่อง prod: เตือนเมื่อ backup เงียบไปหรือเว็บล่ม) อยู่บนเครื่องนี้ หน้าจัดการเปิดผ่าน SSH tunnel เท่านั้น (`ssh -L 3001:127.0.0.1:3001 <mirror>` แล้วเปิด http://localhost:3001 สร้างบัญชี admin ครั้งแรก) ส่วนที่เปิดผ่าน nginx มีแค่ `https://kuma.example.com/api/push/…` ให้ prod ส่งสัญญาณมา

1. Settings > Notifications: เพิ่ม **SMTP** (อีเมล ถึงทีมที่ดูแล) และ **Microsoft Teams** (webhook ของ channel เดียวกับที่ตั้งในหน้าสำรองข้อมูล) ตั้งเป็นค่าเริ่มต้นของ monitor ใหม่
2. Monitor แบบ **Push** 2 ตัว: `TestPulse backup` (Heartbeat Interval 93600 วินาที = 26 ชม.) และ `TestPulse restore drill` (691200 วินาที = 8 วัน) จด Push URL ของแต่ละตัวไว้ใส่ในหน้าสำรองข้อมูล (ข้อ 8)
3. Monitor แบบ **HTTP(s)**: `https://qa.example.com/testpulse/health/ready` ทุก 60 วินาที (เปิด Certificate Expiry Notification) และ `https://backup.example.com/minio/health/live`

ตรวจจาก **เครื่อง prod**:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://backup.example.com/minio/health/live     # 200
```

จากเครื่องอื่นที่ไม่อยู่ใน `allow` ต้องได้ 403 เก็บรหัสใน `.env` ของเครื่อง mirror เข้าที่เก็บ secret ด้วย

---

## 5. backup.env และสร้าง bucket

```bash
cd /opt/testpulse
cp backup.env.example backup.env && chmod 600 backup.env
# เติม <...>: รหัสจาก .env (prod) และ .env ของเครื่อง mirror, OFFSITE_S3_URL=https://backup.example.com,
# BACKUP_AGENT_TOKEN = ค่าเดียวกับใน backend/.env.prod, BACKUP_AGENT_SECRET=$(openssl rand -hex 32)
scripts/backup.sh init
```

ต้องได้ 4 บรรทัด (`src/` และ `off/` ของ `testpulse-backups` กับ `testpulse`) แล้วตามด้วย `ready` ถ้าได้ `exists without object lock` แปลว่ามี bucket ชื่อนั้นที่ไม่ได้ล็อกอยู่แล้ว ต้องย้ายของออกแล้วลบ bucket ก่อน

`BACKUP_DOCKER_NETWORK=testpulse` ทำให้ container ของ `mongodump` / `mc` เข้า network เดียวกับ service (ต้องใช้สคริปต์เวอร์ชันที่มีตัวแปรนี้ ชุดนี้มีแล้ว)

---

## 6. TestPulse และ proxy (https)

```bash
cd /opt/testpulse
docker compose -f docker-compose.server.yml up -d
until [ "$(docker inspect -f '{{.State.Health.Status}}' testpulse)" = healthy ]; do sleep 3; done; echo healthy
docker logs testpulse 2>&1 | grep -E 'entrypoint|preflight|migrate'
```

ใน log ต้องเห็น `serving https://.../testpulse`, preflight `ok` ครบ 4 บรรทัด (database, storage `minio-prod:9001/testpulse`, mail, log) และ migration `applied 6` พร้อม `first Admin created`

ตรวจจากนอกเครื่อง

```bash
curl -sI http://qa.example.com/ | grep -i location             # https://qa.example.com/
curl -fsS https://qa.example.com/testpulse/health/ready; echo  # {"status":"ok","database":"connected"}
```

เปิด `https://qa.example.com/testpulse` ต้องเห็นหน้าเข้าสู่ระบบ และเบราว์เซอร์ไม่เตือนเรื่อง certificate

---

## 7. ใช้งานครั้งแรก

1. เข้าสู่ระบบด้วย `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` แล้วเปลี่ยนรหัสผ่านในแอป
2. ลบรหัสเริ่มต้นออกจากไฟล์ แล้วสร้าง container ใหม่

   ```bash
   sed -i 's/^INITIAL_ADMIN_PASSWORD=.*/INITIAL_ADMIN_PASSWORD=/' backend/.env.prod
   docker compose -f docker-compose.server.yml up -d --force-recreate testpulse
   ```

   แล้วเก็บ `.env.prod` เข้าที่เก็บ secret อีกรอบ
3. ทดสอบ: สร้าง project พร้อมโลโก้, test case ที่แนบรูป, เชิญ user (ต้องได้อีเมล), ดู notification ขึ้นแบบ real-time
4. ดูว่ารูปอยู่ใน MinIO

   ```bash
   docker run --rm --network testpulse --env-file <(printf 'MC_HOST_prod=http://%s:%s@minio-prod:9001\n' \
     "$(grep ^MINIO_ROOT_USER= .env | cut -d= -f2)" "$(grep ^MINIO_ROOT_PASSWORD= .env | cut -d= -f2)") \
     minio/mc:RELEASE.2025-08-13T08-35-41Z --no-color ls --recursive prod/testpulse
   ```

---

## 8. backup อัตโนมัติ (backup agent)

`BACKUP_AGENT=embedded` ทำให้ backup agent ทำงานใน container ของแอป (user แยก อ่านได้แค่ `backup.env` ของตัวเอง) ตั้งเวลาเอง ไม่ต้องใช้ cron ทุกอย่างทำจากหน้า **ผู้ดูแลระบบ > สำรองข้อมูล** (Admin เท่านั้น) สถานะและประวัติของ agent อยู่ใน `docker-data/backup-agent/` (ไม่อยู่ในฐานข้อมูล)

1. เปิดหน้าสำรองข้อมูล: ปลายทางทั้งสอง (MinIO บนเครื่องนี้, off-site) ต้องเป็นสีเขียว ถ้าขึ้น "ติดต่อ backup agent ไม่ได้" ดู `docker logs testpulse 2>&1 | grep agent`
2. **ตั้งค่า**: เวลาสำรอง (ค่าเริ่มต้น ทุกวัน 02:00) และซ้อมกู้ (ทุกวันอาทิตย์ 03:00), อีเมลถึงทีมที่ดูแล (สมาชิกของทีมใน TestPulse + อีเมลเพิ่มเติม), webhook ของ Teams channel, Push URL ของ Uptime Kuma ทั้ง 2 ตัว แล้วกด **ส่งข้อความทดสอบ** ต้องได้ทั้งอีเมลและข้อความใน Teams
3. กด **สำรองเดี๋ยวนี้** แล้ว **ซ้อมกู้** อย่างละครั้ง ทั้งสองต้องได้ "สำเร็จ" และ Uptime Kuma ต้องขึ้น Up
4. หลังจากนั้นดูที่หน้าสำรองข้อมูลหรือรอแจ้งเตือน: งานล้ม, ไม่มี backup เกิน 26 ชม., disk เกิน 80% (`AGENT_DISK_LIMIT_PERCENT`) แจ้งครั้งเดียวและแจ้งอีกครั้งเมื่อกลับมาปกติ ถ้าเครื่อง prod ดับ Uptime Kuma เป็นผู้เตือน

ไม่ใช้ agent (ไม่ตั้ง `BACKUP_AGENT`): ใช้ cron กับสคริปต์แทน `0 2 * * * cd /opt/testpulse && { scripts/backup.sh && scripts/verify.sh; } >> docker-data/backup.log 2>&1` (`crontab -e` ของ user ในกลุ่ม docker) อย่าใช้ทั้งสองแบบพร้อมกัน

5. ชั้นที่ 3 (แนะนำสัปดาห์ละครั้ง): บนเครื่อง mirror export bucket ออกเป็นไฟล์ไปเก็บบน disk / ที่เก็บอื่นที่ไม่ใช่สองเครื่องนี้ เช่น

   ```bash
   # บนเครื่อง mirror: /backup-disk คือ disk ภายนอกหรือที่เก็บอื่น
   cd /opt/testpulse-mirror && U=$(grep ^MINIO_ROOT_USER= .env | cut -d= -f2) && S=$(grep ^MINIO_ROOT_PASSWORD= .env | cut -d= -f2)
   for B in testpulse-backups testpulse; do
     docker run --rm --network testpulse-mirror_default -e MC_HOST_m="http://$U:$S@minio-mirror:9001" -v /backup-disk:/export \
       minio/mc:RELEASE.2025-08-13T08-35-41Z --no-color mirror --overwrite m/$B /export/current/$B
   done
   tar -czf /backup-disk/mirror-$(date +%Y%m%d).tar.gz -C /backup-disk current
   ```

---

## 9. งานประจำ

| งาน | คำสั่ง / ที่ดู |
| --- | --- |
| ซ้อมกู้ | agent ซ้อมให้ทุกสัปดาห์ หรือกด **ซ้อมกู้** ในหน้าสำรองข้อมูล (เลือก snapshot ได้) บน command line: README หลัก "ซ้อมกู้คืน" |
| ย้อนข้อมูลไปจุด backup | README หลัก "กู้คืน": หยุด `testpulse`, `scripts/restore.sh --to-db testpulse --from off --overwrite-live --file <dump>` แล้วเปิดแอป ไม่ต้องย้อน MinIO (แอปไม่ลบไฟล์) |
| server หาย | README หลัก "กู้คืนบนเครื่องใหม่": เครื่องใหม่ทำข้อ 1-3 และ 5 ของคู่มือนี้ (ใช้ไฟล์จากที่เก็บ secret) แล้ว `scripts/restore.sh --to-db testpulse --from off --overwrite-live --uploads-from-off` ก่อนเปิดแอป |
| อัปเดตเวอร์ชัน | `docker load` image ใหม่ แก้ `image:` ใน `docker-compose.server.yml` แล้ว `docker compose -f docker-compose.server.yml up -d` (migration รันเอง) ทำ backup ก่อนทุกครั้ง |
| แก้ค่าใน `.env.prod` | `docker compose -f docker-compose.server.yml up -d --force-recreate testpulse` |
| ต่ออายุ certificate | วางไฟล์ใหม่ใน `proxy/certs/` แล้ว `docker exec testpulse-proxy nginx -s reload` (เครื่อง mirror ทำเหมือนกัน) |
| MinIO console | `ssh -L 9000:127.0.0.1:9000 <server>` แล้วเปิด http://localhost:9000 |
| disk | `df -h /opt/testpulse` ควรว่างอย่างน้อย 20% และ `du -sh /opt/testpulse/*/data` |
| log ของ container | หมุนเองแล้ว (ไฟล์ละ 10 MB, 5 ไฟล์) ดูด้วย `docker logs --tail 100 <ชื่อ>` |

ค่าเครื่อง 8 GB: `MONGO_CACHE_GB=2` ใน `.env` ถ้าย้ายไปเครื่อง 4 GB ให้เป็น `1` แล้ว `docker compose -f docker-compose.yml up -d`

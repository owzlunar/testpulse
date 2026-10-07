# Product Requirements Document (PRD) — TestPulse
## ระบบบริหารจัดการการทดสอบและรับรองคุณภาพซอฟต์แวร์ (Modern Test Case Management & QA Engineering Platform)

---

## 1. บทนำและวิสัยทัศน์ของระบบ (Product Overview & Vision)

**TestPulse** คือแพลตฟอร์มบริหารจัดการการทดสอบซอฟต์แวร์ (Test Case Management System) ระดับ Enterprise ที่ออกแบบมาเพื่อยกระดับความร่วมมือระหว่าง **QA / Tester**, **Developer**, และ **Project Manager / Admin** 

ระบบไม่ได้ทำหน้าที่เพียงแค่บันทึก Test Case เท่านั้น แต่เน้นการติดตาม **Quality Cadence**, **Defect Churn (การแก้ซ้ำไปมา)**, **SLA งานค้างส่งมอบ (Overdue SLA)**, **การควบคุมความเสี่ยงในการปล่อย Release (Release at Risk Gatekeeper)**, และการสร้างเอกสารสรุปตรวจรับระบบ (**UAT Sign-off Document**) ได้อย่างรวดเร็วและเป็นมืออาชีพ

---

## 2. สถาปัตยกรรมและเทคโนโลยีที่ใช้ (Tech Stack & Architecture)

- **Frontend Core**: Vue 3 (Composition API with `<script setup lang="ts">`) + TypeScript
- **Build Tool**: Vite 5 + `vue-tsc` (Type Checking)
- **UI Framework & Design System**: Vuetify 3.5.9 (Material Design 3)
- **Theme Support**: Dynamic Light & Dark Mode รองรับการสลับ Theme แบบเรียลไทม์
- **Iconography**: Tabler Icons (`@tabler/icons-webfont`, ใช้ `icon="tabler:name"`) เป็นหลัก, MDI (`@mdi/font`) สำรอง — Vector Font Icons 100% (ไม่ใช้ System Emoji)
- **Typography**: `@fontsource/noto-sans-thai` (โหลดในเครื่อง ไม่พึ่ง Google Fonts)
- **Design System**: Fox Admin theme (ดู `CLAUDE.md`)
- **State Management**: Pinia Store + Composables Architecture
- **Routing**: Vue Router 4 (รองรับ Nested Layouts และ Route Matching)
- **Calendar & Cadence Engine**: FullCalendar 6.1.21 (`@fullcalendar/vue3`, `@fullcalendar/core`, `@fullcalendar/daygrid`, `@fullcalendar/interaction`)
- **Micro-Animations**: Canvas-Confetti (ฉลองเมื่อเคสทดสอบผ่านครบ 100%)
- **Data Persistence**: LocalStorage-backed Mock Service Layer (`storage.service.ts` + `*.service.ts` ที่มี `fetchX()` / `saveX()`) พร้อม Seed และ Migration

---

## 3. โครงสร้างโฟลเดอร์ของโปรเจกต์ (Project Directory Structure)

โครงสร้างและ Naming Convention ตาม Fox Admin template (ดู `CLAUDE.md`)

```text
testpulse/
├── PRD.md · CLAUDE.md · package.json · vite.config.ts · tsconfig*.json
└── src/
    ├── App.vue / main.ts              เลือก DefaultLayout / BlankLayout จาก route.meta.layout
    ├── layouts/                       DefaultLayout (sidebar + app bar + aside), BlankLayout (login)
    ├── plugins/vuetify.ts             Theme colors (Fox Blue + caution), component defaults, icon sets
    ├── styles/                        settings.scss · main.scss (fox-* helpers) · fullcalendar.scss
    ├── router/                        index.ts (routes + RouteMeta) · navigation.ts (เมนู sidebar + permission)
    ├── types/index.ts                 Tone, Option, NavItem + Domain types
    ├── utils/                         date.ts · format.ts · validators.ts
    ├── services/  *.service.ts        API contract (mock): http · storage · project · test-case · requirement · run · defect ·
    │                                  document · template · ai · user · audit · notification · settings · export
    ├── stores/    *.store.ts          app (bootstrap, error toast) · auth · project · test-case · requirement · run · defect ·
    │                                  document · audit · notification · settings · calendar · layout
    ├── composables/                   useSnackbar · useAsyncAction (loading/error) · useTestCasePermissions (RBAC)
    ├── components/
    │   ├── ui/                        FoxPageHeader, FoxCardHeader, FoxStatCard, FoxTimeline, FoxEmptyState,
    │   │                              FoxConfirmDialog, FoxTablePagination, FoxImageUpload
    │   ├── charts/                    FoxDonutChart, FoxChartLegend, FoxBarChart
    │   ├── FoxCalendar.vue            FullCalendar wrapper (tone, event slot, drag → revert)
    │   ├── layout/                    AppHeader, AppSidebar, AppFooter, AppLogo, ProjectSwitcher, GlobalSearch,
    │   │                              UserMenu, NotificationDrawer, HelpDialog
    │   ├── projects/                  ProjectCard, ProjectDialog (รวม Milestones), ProjectAvatar
    │   ├── test-cases/                TestCaseList, TestCaseDialog, TestCaseHistoryDialog, ExtendDueDateDialog,
    │   │                              TemplatePickerDialog, SaveTemplateDialog, TestCaseImportDialog, TestCaseAiDraftDialog,
    │   │                              TestCaseStatusChip, TestCasePriorityChip, TestCaseStatusMenu, TestCaseBadges,
    │   │                              TestCaseProgress, TestCaseVersionTimeline, TestCaseAuditList
    │   ├── calendar/                  CalendarAside (right sidebar ของหน้า Calendar)
    │   ├── requirements/              RequirementDialog
    │   ├── test-runs/                 TestRunDialog, RunProgress
    │   ├── defects/                   DefectDialog
    │   ├── documents/                 DocumentWizardDialog, DocumentPaper (A4), DocumentTemplateForm
    │   └── users/                     UserAvatar, UserDialog
    └── views/   <module>/Index.vue    dashboard · requirements · test-cases · test-runs (+ Execute) · defects · calendar ·
                                       documents (+ Preview) · reports · audit-trail · users · permissions · settings · auth
```

**Naming**
- Services `xxx.service.ts`, Stores `xxx.store.ts` (ชื่อหลายคำใช้ kebab-case เช่น `test-case.store.ts`)
- Views ไม่มี suffix `View` อยู่ในโฟลเดอร์โมดูล หน้าแรกของโมดูลคือ `Index.vue`
- Component ทั่วไปของ Theme ขึ้นต้นด้วย `Fox*` (`components/ui`), Component ของโดเมนอยู่ในโฟลเดอร์โมดูล (พหูพจน์) และขึ้นต้นด้วยชื่อโดเมน
- ค่าคงที่ของสถานะ/Priority/Role อยู่ใน service เป็น `Option` (`value`, `label`, `hint`, `tone`, `icon`) พร้อม helper `statusOf()`, `priorityOf()`, `roleOf()`

## 4. ผู้ใช้งานและระบบสิทธิ์ตามบทบาท (User Roles & RBAC Matrix)

ระบบรองรับระบบจำลองผู้ใช้ (Mock User Switching) โดยมี Role หลัก 3 บทบาท:

| ความสามารถ (Permissions) | QA Tester (Tester) | Developer (Dev) | Administrator (Admin) |
|---|:---:|:---:|:---:|
| ดูข้อมูลโปรเจกต์และ Test Cases | ✅ | ✅ | ✅ |
| สร้าง / แก้ไข Requirement & Steps | ✅ | ❌ (View Only) | ✅ |
| รันการทดสอบ (Pass / Fail / Block) | ✅ | ❌ | ✅ |
| กดส่งมอบงานพร้อมเทส (Ready for Test) | ❌ | ✅ | ✅ |
| ระบุสาเหตุ Defect (Root Cause Tagging) | ✅ | ✅ | ✅ |
| ขอขยายเวลาส่งมอบ (Extend Due Date) | ✅ | ✅ | ✅ |
| สร้างเอกสารตรวจรับ UAT Sign-off | ✅ | ❌ | ✅ |
| จัดการสมาชิกและกำหนด Role (Users View) | ❌ | ❌ | ✅ |
| ปรับแต่งสิทธิ์เมนูและฟังก์ชัน (Permissions View) | ❌ | ❌ | ✅ |
| เข้าถึง Audit Logs ฉบับเต็ม | ❌ | ❌ | ✅ |

### Mock Accounts พร้อมใช้งาน
- **ศุภชัย QA (Lead QA)** — Role: `QA`
- **กิตติศักดิ์ Dev (Senior Fullstack)** — Role: `DEV`
- **ธนากร Dev (Backend Developer)** — Role: `DEV`
- **อภิสิทธิ์ Admin (System Administrator)** — Role: `ADMIN`

---

## 5. ฟังก์ชันการทำงานหลัก (Core Features & Functional Specifications)

### 5.1 ระบบ Layout, App Bar และการสลับโปรเจกต์
- **App Bar**:
  - **Project Switcher (สไตล์ Google Cloud Console)**: Dropdown ค้นหาและเลือกโปรเจกต์ พร้อมแสดง Logo/Avatar, Project Key, และสถานะโปรเจกต์
  - **Theme Toggle**: สลับระหว่างโหมดสว่าง (Light) และโหมดมืด (Dark) ได้ทันที
  - **Notification Center Drawer**: เปิดแถบขวา (`v-navigation-drawer`) แสดงการแจ้งเตือนงานใกล้หมดอายุ, งานเปลี่ยนสถานะ, และงานที่สร้างใหม่ พร้อมปุ่ม Mark all as read และลบการแจ้งเตือน
  - **User Profile Menu**: แสดง Avatar, ชื่อ, Role ปัจจุบัน และปุ่มสลับบัญชีเพื่อทดสอบ Role ต่างๆ ได้ทันที
- **Sidebar**:
  - รองรับการย่อเป็น Mini-rail Sidebar เพื่อเพิ่มพื้นที่ทำงาน
  - **หมวดหมู่หลัก**: Project Dashboard, Test Cases, Calendar, Report
  - **หมวดหมู่ Administration**: Audit Logs, Users (จัดการ Role), Permissions (RBAC)
  - **หมวดหมู่ System**: Setting, วิธีใช้งานระบบ (System Info), Logout

---

### 5.2 การจัดการโปรเจกต์ (Project Management)
- **CRUD Operations**: สร้าง, แก้ไข, ลบโปรเจกต์
- **Project Metadata**:
  - Key ย่อ (เช่น `PAY`, `AUTH`, `SHOP`)
  - Project Logo / Avatar
  - Target Deadline (วันครบกำหนดเป้าหมาย)
  - Status (`active`, `in_review`, `completed`, `archived`)
  - Project Tags & Member Count
  - **Project Milestones**: กำหนดการส่งมอบสำคัญของโปรเจกต์ เช่น:
    - `Code Freeze`
    - `UAT Sign-off Target`
    - `Production Go-Live`

---

### 5.3 การจัดการและออกแบบ Test Case (Test Case Engineering)
- **Hierarchical Test Cases (เคสหลักและเคสย่อย)**:
  - รองรับการสร้าง Sub-case ย่อยภายใต้ Parent Case พร้อมปุ่ม Collapse / Expand
- **รายละเอียด Test Case**:
  - `ID`: รหัสเคสรูปแบบโมเดิร์น (เช่น `TC-101`, `TC-102.1`)
  - `Requirement`: ข้อกำหนดฟังก์ชันงาน
  - `Test Scenario`: สถานการณ์ทดสอบ
  - `Prerequisite`: เงื่อนไขหรือสิ่งที่ต้องเตรียมก่อนทดสอบ
  - `Test Steps Table`: ตารางขั้นตอน (Step Number, Action, Test Data, Expected Result) พร้อมปุ่ม Add Row, Delete Row, Re-order
  - `Expected Images & Actual Images`: รองรับการแนบภาพ Screenshot หรือหลักฐานผลการทดสอบ
  - `Due Date (Expiry Date)`: วันครบกำหนดส่งมอบ
  - `Priority`: `P1-Critical`, `P2-High`, `P3-Medium`, `P4-Low`
  - `Assigned QA` & `Assigned Dev`: ผู้รับผิดชอบทั้งสองฝั่ง

---

### 5.4 วงจรการทำงาน Dev <-> QA (Collaborative Hand-off Lifecycle)

```
[Tester สร้างเคส] ──> [Pending Dev] ──(Dev แก้ไขเสร็จ)──> [Ready for Test] ──(QA ทดสอบ)──> [Passed] ✅
                             ▲                                    │
                             │                                    ▼
                             └──────── (QA พบ Bug) ───────── [Failed] ❌
                               (Defect Churn +1 รอบ 🔥)
```

1. **Pending Dev**: เคสรอการพัฒนา/แก้ไขโค้ดจากทีม Dev
2. **Ready for Test**: Dev กดปุ่ม *"ส่งมอบพร้อมเทส"* ระบบจะแจ้งเตือนไปยัง QA โดยอัตโนมัติ
3. **In Progress / Execution**: QA ดำเนินการทดสอบตามขั้นตอน
4. **Passed**: ผ่านการทดสอบ (หากผ่านครบทั้งโปรเจกต์ จะมี Confetti Animation เฉลิมฉลอง)
5. **Failed**: ไม่ผ่านการทดสอบ เคสจะถูกตีกลับไปหา Dev พร้อมเพิ่มค่า **Defect Churn Count (+1 รอบ)**
6. **Blocked**: ติดปัญหาภายนอก (เช่น สภาพแวดล้อมระบบล่ม หรือ 3rd-party API ไม่พร้อม)

---

### 5.5 การวิเคราะห์ Defect Ping-Pong Churn และจุดติดขัด (Bottleneck Analysis)
- **Churn Count Tracking (`แก้ซ้ำ X รอบ`)**:
  - ระบบตรวจจับจำนวนครั้งที่เคสสลับไปมาระหว่าง `Failed` และ `Ready for Test`
  - แสดงป้ายไฟเตือน **High Churn** เพื่อระบุเคสที่มีความเสี่ยงสูง
- **Current Dwell (อยู่ที่มือใคร)**:
  - ระบุชัดเจนว่าเคสกำลังค้างอยู่ที่ขั้นตอนใด:
    - ทีม Dev กำลังพัฒนา
    - รอ QA ตรวจสอบ
    - ติด Bug (รอ Dev แก้)
    - เสร็จสิ้น (Passed)
- **Root Cause Tagging**:
  - กำหนดและจำแนกสาเหตุของปัญหาได้อย่างรวดเร็ว เช่น:
    - `Race Condition`
    - `Spec Gap`
    - `External API Timeout`
    - `Environment Downtime`
    - `Data Validation Bug`
    - `Concurrency Lock`
    - `UI Rendering Glitch`

---

### 5.6 กลไกการจัดการงานเลยกำหนด (Overdue SLA Mechanisms — ครบทั้ง 4 ข้อ)

1. **Visual Overdue Alert Badge**:
   - แสดงป้ายเตือน `เลยกำหนด X วัน` ทั้งในหน้ารายการเคส, บน Event Pill ใน Calendar, และในแผงรายละเอียด
2. **Notification Escalation by Role**:
   - ระบบตรวจจับวันหมดอายุอัตโนมัติ:
     - หากค้างที่ `Pending` หรือ `Failed` ➔ ส่ง Notification แจ้งเตือนไปยัง **Developer**
     - หากค้างที่ `Ready for Test` ➔ ส่ง Notification แจ้งเตือนไปยัง **QA Tester**
3. **UAT Gatekeeper Check (Release at Risk)**:
   - ในขั้นตอนการสร้างเอกสาร UAT หากพบเคสที่ยัง `Failed`, `Blocked`, หรือ `Overdue` ระบบจะขึ้นแบนเนอร์ **Release at Risk** พร้อมบังคับให้กดยืนยันรับทราบความเสี่ยง และระบุในเอกสารเป็น *"CONDITIONAL ACCEPTANCE (รับมอบแบบมีเงื่อนไข)"*
4. **Reschedule / Extend Due Date with Audit Reason**:
   - หากจำเป็นต้องเลื่อน Due Date ผู้ใช้ต้องเปิดหน้าต่าง **"ขอขยายเวลา (Extend Due Date)"**
   - บังคับเลือกหมวดหมู่เหตุผล (Spec Change, External API Delay, Complex Bug, Env Issue) พร้อมระบุข้อความบันทึก
   - เพิ่ม Version ของเคส และบันทึกลงใน **Audit Trail** ถาวร

---

### 5.7 ปฏิทินงานทดสอบและรอบการส่งมอบ (Quality & Cadence Calendar)
- **FullCalendar Engine**:
  - รองรับมุมมองรายเดือน (`dayGridMonth`) และรายสัปดาห์ (`dayGridWeek`)
  - Drag-and-Drop เพื่อเลื่อนกำหนดส่ง Due Date โดยจะเรียกหน้าต่างขอขยายเวลาให้อัตโนมัติ
- **Calendar Toolbar (วางตำแหน่งด้านบนตารางปฏิทินโดยตรง)**:
  - ปุ่มเลื่อนเดือน/สัปดาห์ (`Prev`, `Next`, `Today`)
  - ปุ่มสลับมุมมอง Month / Week
  - ปุ่มเปิด/ปิดแถบข้อมูลรายละเอียด
- **Event Pill ในปฏิทิน**:
  - แสดง Milestone แถบสีสดใส (Code Freeze, UAT Sign-off, Go-Live)
  - แสดง Test Case Pill พร้อม Status Icon, Churn Badge, Overdue Badge, และชื่อ Dev ผู้รับผิดชอบ
- **Right Drawer สไตล์ Notification**:
  - ใช้ `v-navigation-drawer` ฝั่งขวาแบบ Smooth Overlay
  - แสดงรายละเอียดเคส, Bottleneck Dwell, Root Cause Tagger, Spec Summary, ไทม์ไลน์ Version ย้อนหลัง, และปุ่ม Action ส่งมอบงาน

---

### 5.8 การส่งออกเอกสารและการรายงาน (Export & Reporting)
- **Export to Markdown (.md)**:
  - รองรับการเปิดใน Obsidian พร้อม YAML Frontmatter, Status Badges, และ Checklists
- **Export to Excel (.xlsx / HTML Table)**:
  - รองรับการเปิดใน Microsoft Excel และ Google Sheets พร้อมจัดรูปแบบหัวตารางและสถานะสี
- **Export to Word (.doc / Rich Document)**:
  - จัดรูปแบบเป็นเอกสารราชการ/องค์กร พร้อมตารางขั้นตอนทดสอบและช่องลงนาม
- **UAT Sign-off Document Generator Modal**:
  - สร้างเอกสารตรวจรับ UAT ครบวงจร
  - สรุปผล Pass Rate และ Progress Bar
  - ระบุ Document No., ช่วงเวลาตรวจรับ, Test Environment
  - สรุปรายชื่อคณะกรรมการตรวจรับมอบงาน (ผู้ส่งมอบและผู้รับมอบ)
  - รองรับการ Export ออกมาเป็นเอกสาร Word/HTML ได้ทันที

---

### 5.9 ระบบ Audit Trail และประวัติการเปลี่ยนแปลง
- บันทึกการกระทำทุกอย่างลงใน Audit Trail อย่างละเอียด:
  - `CREATE`: สร้างโปรเจกต์ หรือ Test Case
  - `UPDATE`: แก้ไขรายละเอียด
  - `STATUS_CHANGE`: การเปลี่ยนสถานะผลการทดสอบ
  - `EXTEND_DUE_DATE`: การขอขยายวันส่งมอบ พร้อมเหตุผลประกอบ
  - `SLA_BREACHED`: การแจ้งเตือนงานเกินกำหนด SLA
  - `EXPORT`: การดาวน์โหลดเอกสาร
- ค้นหาและกรองประวัติการทำงานได้ตามช่วงเวลา, ประเภท Action, Role, และ Keyword

---

### 5.10 ลดภาระงานเอกสารของ Tester (Authoring Accelerators)
- **สร้าง Test Case ได้ 4 แบบ** จากปุ่ม "สร้าง Test Case": ฟอร์มว่าง · จาก Template (คลังรูปแบบการทดสอบที่ใช้บ่อย + Template ของทีม) · **ร่างด้วย AI** จาก Requirement (แยก Positive / Negative / Boundary ให้ตรวจแก้ก่อนบันทึก) · **นำเข้าจาก Excel / CSV** (วางจาก Excel หรืออัปโหลด, จับคู่คอลัมน์อัตโนมัติ, ตรวจสอบก่อนนำเข้า)
- **Clone** เคสเดิม และ **บันทึกเป็น Template**
- ตารางขั้นตอน: **วางหลายแถวจาก Excel** ในครั้งเดียว, เลื่อนลำดับขึ้น/ลง
- แนบหลักฐาน: **วางภาพหน้าจอด้วย Ctrl/⌘ + V**, ลากไฟล์มาวาง, บีบอัดภาพอัตโนมัติ

### 5.11 Requirements & Traceability
- จัดการ Requirement (รหัส, Acceptance Criteria, ประเภท, สถานะ Draft/Approved/Changed/Deprecated, แหล่งที่มา)
- **ข้อกำหนดจาก TOR หรือเพิ่มเติม**: Requirement ตาม TOR ต้องระบุข้อใน TOR (เช่น `4.2.1`) เรียงตามข้อ แล้วตามด้วย Requirement เพิ่มเติม (จากการประชุม, Change Request …); กรองตามที่มาและค้นหาด้วยข้อใน TOR ได้ (รวมถึงค้นหาทั้งระบบ). Requirement ที่มีอยู่ก่อนถือเป็นเพิ่มเติม
- เชื่อม Test Case ↔ Requirement จากฟอร์ม Test Case
- **นำเข้า Requirement จาก Excel / CSV** (วางจาก Excel หรืออัปโหลด CSV, จับคู่คอลัมน์อัตโนมัติ, ตรวจสอบก่อนนำเข้า) หนึ่งแถวต่อหนึ่ง Requirement: แถวที่มีข้อใน TOR เป็น Requirement ตาม TOR, ไม่มีรหัส Server ออกรหัสถัดไปให้, รหัสที่มีอยู่แล้วข้าม หรือเลือกอัปเดต (เช่น TOR ฉบับแก้ไข: ถ้าความหมายเปลี่ยน เคสที่เชื่อมไว้ถูกแจ้งให้ทบทวน)
- **Traceability Matrix** พร้อมสถานะ Coverage (ยังไม่มีเคส / ยังไม่ทดสอบ / กำลังทดสอบ / มีเคสไม่ผ่าน / ผ่านทั้งหมด) และส่งออก CSV (มีคอลัมน์ข้อใน TOR)
- เอกสาร UAT Sign-off และ Traceability Matrix เลือก **"เฉพาะ Requirement ตาม TOR"** ได้: รวมเฉพาะ Requirement ตาม TOR และ Test Case ที่เชื่อมกับ Requirement เหล่านั้น (Sub-case ตามเคสแม่) ทั้งผลสรุป ความเสี่ยง และ Release gatekeeper
- ปุ่ม "ร่างเคสด้วย AI" ต่อ Requirement

### 5.12 รอบการทดสอบ (Test Runs) และ Defects
- สร้างรอบ (Smoke / Functional / Regression / UAT, รอบที่ N, Environment, Build) โดยเลือกเคสด่วน: ทั้งหมด / ยังไม่ผ่าน / Fail-Blocked รอบล่าสุด / Critical-High
- ระบบเก็บ **สำเนาเคส ณ เวลาสร้างรอบ** เป็นหลักฐาน แม้เคสถูกแก้ภายหลัง
- **บันทึกผลรายขั้นตอน** (Pass / Fail / Blocked / Skip) พร้อมผลจริงและภาพหลักฐานต่อขั้นตอน, ปุ่ม "ผ่านทุกขั้นตอน", "บันทึกและไปเคสถัดไป"; ผลของรอบอัปเดตสถานะ Test Case อัตโนมัติ
- ขั้นตอนที่ Fail → **รายงาน Defect ที่กรอกให้ครบ** (ขั้นตอนทำซ้ำ, ผลคาดหวัง/จริง, หลักฐาน, Environment, ผู้รับผิดชอบ, Severity ตาม Priority)
- Defect workflow: Open → In Progress → Fixed → Retest → Closed / Rejected, ความคิดเห็น, Jira key

#### Environment ที่ทดสอบ (TEST / STAGING)
- โปรเจกต์กำหนด Environment ได้ในฟอร์มโปรเจกต์ เช่น **TEST** (Server ทดสอบของบริษัท) และ **STAGING** (Server ของลูกค้า); โปรเจกต์ใหม่เริ่มที่ TEST และต้องมี **Environment หลัก 1 รายการ** เสมอ
- **สถานะของ Test Case = ผลบน Environment หลัก** (วงจร Dev ↔ QA, ส่งงาน, Churn และการแจ้ง Dev เหมือนเดิม); Environment อื่นเก็บผลแยกต่อเคส (ผลล่าสุดของรอบบน Environment นั้นชนะ) ไม่เปลี่ยนสถานะหลัก ไม่ส่งเคสกลับ Dev ไม่นับ Churn; ผลที่ทดสอบกับเวอร์ชันเก่าของเคสไม่นับ
- รอบการทดสอบเลือก Environment จากรายการ (ไม่พิมพ์เอง); รอบบน Environment อื่นเลือกเคสด่วน "ผ่านบน TEST แล้ว" ให้ก่อน; เปลี่ยน Environment ของรอบได้เฉพาะเมื่อยังไม่มีผล
- หน้า Test Cases แสดงสถานะหลัก + ชิปผลของแต่ละ Environment อื่น (เช่น `STAGING Pass`) และกรอง "ผ่านบน TEST แต่ยังไม่ผ่านบน STAGING" / "ไม่ผ่าน / Blocked บน STAGING"
- **Defect**: ระบุ Environment ที่พบ และสาเหตุ **โค้ด** หรือ **Server / Environment** (Port ถูกปิด, WAF, การตั้งค่า …) ช่อง Issue key ใช้เก็บเลขที่คำขอ / Ticket ของลูกค้าได้
- **ทีมดูแล Server**: Role discipline ใหม่ `ops` และ Role เริ่มต้น **Server/Infra** (ดูรอบทดสอบและ Defect อัปเดตความคืบหน้า Defect ได้ แต่ปิด Defect หรือแก้ Test Case ไม่ได้); ผูกทีมกับ Environment ได้ (ทีมนี้เข้าโปรเจกต์ได้ด้วย) → ปัญหาด้าน Server บน Environment นั้นแจ้งทีมนั้น (หรือผู้รับผิดชอบ) แทน Dev; ทีม Server กด Fixed → แจ้ง QA ผู้รายงานให้ทดสอบซ้ำบน Environment นั้น; QA ปิด Defect หรือเปลี่ยนสาเหตุเป็นโค้ด (ส่งต่อให้ Dev)
- **รายงาน**: ผลตาม Environment (Pass / Fail / Blocked / ยังไม่ทดสอบ, Pass rate) และ Defect แยกโค้ด / Server พร้อมเวลาเฉลี่ยจนแก้ไขเสร็จ
- **UAT Sign-off** เลือก Environment ที่ตรวจรับ (ค่าเริ่มต้น: Environment แรกที่ไม่ใช่หลัก เช่น STAGING): ผล Pass rate ความเสี่ยงและ Release gatekeeper ใช้ผลบน Environment นั้น (ไม่อ้างอิงรอบ = ผลล่าสุดของแต่ละเคสบน Environment นั้น; อ้างอิงรอบได้เฉพาะรอบบน Environment นั้น); ปัญหาด้าน Server ที่ยังเปิดบน Environment นั้นนับเป็นความเสี่ยง ส่วนของ Environment อื่นไม่นับ
- ข้อมูลเดิม: ทุกโปรเจกต์ได้ TEST เป็นหลัก, Environment ที่พิมพ์ไว้ในรอบเดิม ("Staging", "UAT" …) กลายเป็น Environment ของโปรเจกต์ (รอบที่ไม่ระบุ = TEST), Defect เดิมเป็นสาเหตุโค้ด; สถานะเคสเดิมไม่เปลี่ยน

### 5.13 ศูนย์เอกสาร (Document Center)
- เอกสาร 4 ประเภท สร้างจากข้อมูลจริงในระบบ: **UAT Sign-off**, **Test Summary Report** (ต่อรอบ), **Test Specification**, **Traceability Matrix**
- ข้อมูลถูก **ตรึงเป็น Snapshot** ตอนสร้าง; สร้างเวอร์ชันใหม่จากข้อมูลล่าสุดได้ (ลายเซ็นถูกรีเซ็ต) และแจ้งเมื่อมีเคสแก้ไขหลังสร้างเอกสาร
- พรีวิว A4, **พิมพ์ / บันทึก PDF**, **ดาวน์โหลด Word (.doc)**
- **Release Gatekeeper**: มี Failed / Blocked / Overdue / Defect เปิดอยู่ → เลือก Full Acceptance ไม่ได้ ต้องยืนยันรับทราบความเสี่ยง (ตรวจทั้งฝั่ง UI และ API)
- **การลงนาม**: Draft → ส่งขอลงนาม → ลงนาม/ปฏิเสธรายคน → ลงนามครบ (โหมดจำลองลงนามแทนได้)
- **แม่แบบเอกสารขององค์กร** (หน้าตั้งค่า): โลโก้, ชื่อ/ที่อยู่, รูปแบบเลขที่เอกสาร `{TYPE}-{KEY}-{YYYYMMDD}-{NN}`, ข้อความหัว/ท้าย, ผู้ลงนามเริ่มต้น

### 5.14 Mock Backend
- ยังไม่มี Backend: `services/*.service.ts` เป็นสัญญา API (ระบุ Endpoint ใน JSDoc) จำลองด้วย LocalStorage + latency
- UI รองรับสถานะ Loading (Skeleton), Saving (ปุ่ม loading), Error (Toast) และ "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ / ลองอีกครั้ง"

### 5.15 สำรองและกู้คืนข้อมูล (Backup & Recovery)

เป้าหมาย: ข้อมูล (MongoDB + ไฟล์อัปโหลด) สำรองตามเวลาไปยังปลายทางนอกเครื่อง prod, รู้ทันทีเมื่อการสำรองหรือการซ้อมกู้ล้ม (อีเมล + Microsoft Teams) และกู้คืนได้จริงจากหน้าเว็บ ทั้งบนเครื่องเดิมและเครื่องใหม่ ข้อมูลหายไม่เกินรอบสำรองล่าสุด (วันละรอบ = ไม่เกิน ~24 ชม.)

#### ระยะที่ 0: สคริปต์ (มีแล้ว)
- `scripts/backup.sh` / `restore.sh` / `verify.sh` รันด้วยมือหรือ cron บน server: `mongodump` → bucket ที่ล็อก (Object Lock GOVERNANCE 14 วัน) → mirror ไป MinIO เครื่อง off-site; ไฟล์อัปโหลดอยู่ใน bucket ที่เปิด versioning; ต่อผ่าน Docker network ได้ (`BACKUP_DOCKER_NETWORK`)
- ตรวจ storage และตรวจผลการกู้, กู้ลงฐานซ้อม, ย้อนฐานจริง, กู้บนเครื่องใหม่ (`--uploads-from-off`); ชุดติดตั้ง prod ใน `deploy/`
- ใช้ต่อได้เป็นทางสำรองเมื่อหน้าเว็บใช้ไม่ได้: ไฟล์ snapshot จากปลายทางใด ๆ copy เข้า bucket `testpulse-backups/db/` และ `testpulse` ของ MinIO แล้ว `restore.sh --from src`

#### ความสามารถ (หน้า "สำรองข้อมูล", Admin เท่านั้น)
1. **ตัวตั้งเวลาและการ monitor**: agent ตั้งเวลาเองแทน cron บน host; บันทึกทุกรอบ (ผ่าน / ผ่านแต่มีคำเตือน / ล้ม / ไม่ได้รัน); agent ที่เพิ่งกลับมาทำงานตรวจรอบที่ข้ามไป แจ้งเตือน แล้วรันชดเชย; หน้าสถานะสรุป: snapshot ล่าสุด (เวลา, ขนาด), ตรวจล่าสุด, ซ้อมกู้ล่าสุด, สถานะแต่ละปลายทาง, พื้นที่ disk (เตือนเกิน 80%), รอบถัดไป
2. **แจ้งเตือน** เมื่อ: งานล้ม, ตรวจพบปัญหา, ไม่มี backup สำเร็จเกิน 26 ชม., disk เกิน 80%, รอบที่ข้ามไป และเมื่อ **กลับมาปกติ** (ครั้งเดียวต่อเหตุการณ์ ไม่ส่งซ้ำทุกรอบที่ยังล้ม)
   - **ในระบบ**: notification ถึง Admin ทุกคน
   - **อีเมล**: ผ่าน SMTP ของ TestPulse ถึงสมาชิกทุกคนของ **ทีมใน TestPulse ที่เลือก** (หนึ่งทีมขึ้นไป) + อีเมลที่ใส่เพิ่มเอง; API เป็นผู้ส่ง (อีเมลผู้ใช้เข้ารหัสอยู่ในฐาน agent ไม่ต้องรู้)
   - **Microsoft Teams**: ข้อความลง channel ที่กำหนด ผ่าน webhook URL จาก Teams Workflows ("Post to a channel when a webhook request is received"; Incoming Webhook แบบ Office 365 Connector กำลังถูกยกเลิก) ข้อความมี: งาน, ผล, เวลา, สรุปปัญหา, ลิงก์ไปหน้าสำรองข้อมูล; webhook URL เป็นความลับ (เก็บเข้ารหัส แสดงบางส่วน)
   - เปิด/ปิดแต่ละช่องทาง และปุ่ม **ส่งข้อความทดสอบ**
3. **ตั้งเวลาและสั่งรันจาก UI**: สำรองทุกวันเวลา… (ค่าเริ่มต้น 02:00), ซ้อมกู้ทุกวัน… เวลา… (ค่าเริ่มต้น อาทิตย์ 03:00), ตรวจ backup หลังสำรองทุกครั้ง; ช่อง cron expression สำหรับผู้ที่ต้องการ; timezone ตาม `CRON_TIMEZONE`; ปุ่ม **รันเดี๋ยวนี้** ทุกงาน; รันได้ทีละงาน (ระหว่างมีงานรัน ปุ่มอื่นปิด) แสดงความคืบหน้าและ log แบบ real-time, ดาวน์โหลด log ได้
4. **snapshot และการกู้**
   - **รายการ snapshot** จากทุกปลายทาง: เวลา, ขนาด, เวอร์ชันแอป, ล็อกถึงวันไหน, มีครบทุกปลายทางไหม (มีแค่บางที่ = คำเตือน)
   - **สำรองเดี๋ยวนี้**, **ตรวจ backup** (อ่านอย่างเดียว)
   - **ซ้อมกู้**: snapshot ที่เลือก (ค่าเริ่มต้น ล่าสุด) ลงฐาน `testpulse-restore` → ตรวจผลการกู้ (เทียบกับฐานจริง + หาไฟล์ที่ข้อมูลอ้างถึง) → ลบฐานซ้อม ไม่แตะระบบจริง
   - **กู้ทับระบบจริง** (snapshot ที่เลือก):
     1. แสดงว่าข้อมูลช่วงไหนจะหาย (ตั้งแต่เวลา snapshot ถึงปัจจุบัน) และยืนยันโดยพิมพ์ `testpulse`
     2. **สำรองสถานะปัจจุบันอัตโนมัติก่อนกู้** (ย้อนการกู้ได้)
     3. **โหมดปิดปรับปรุง**: API ตอบ 503 ทุกคำขอ ยกเว้นสถานะการกู้ (กันการเขียนกลางทาง)
     4. กู้ฐาน (ไฟล์ใน MinIO ไม่ต้องย้อน: แอปไม่ลบไฟล์)
     5. **รัน migration แล้ว restart API** (snapshot ของเวอร์ชันเก่าต้องได้ schema ปัจจุบัน); snapshot จากแอปเวอร์ชัน **ใหม่กว่า** ที่รันอยู่ → ปฏิเสธการกู้
     6. ทุกคนต้องเข้าสู่ระบบใหม่ (UI พาไปหน้า login)
     7. บันทึก audit **หลัง** กู้เสร็จ (ก่อนกู้จะถูกลบไปกับการกู้) และในประวัติของ agent
   - **กู้บางส่วน** (ข้อมูลที่ถูกลบผิด โดยไม่ย้อนข้อมูลอื่น): เลือก snapshot ก่อนเวลาที่ลบ แล้วเลือกสิ่งที่จะกู้
     - **project ที่ถูกลบ**: ตัว project + requirements, test cases, รอบการทดสอบ, defects, เอกสาร (ไฟล์รูปอยู่ใน MinIO อยู่แล้ว: แอปไม่ลบไฟล์); รายการให้เลือกมาจาก audit log (`DELETE PROJECT`) และ project ที่มีใน snapshot แต่ไม่มีในระบบจริง
     - **test case ที่ลบถาวร** (และ sub-case): ของ project ที่ยังอยู่; รายการจาก audit log (`DELETE TEST_CASE`)
     - ขั้นตอน: agent กู้ snapshot ลง **ฐานพักของการกู้บางส่วน** (`testpulse-recover`: แยกจากฐานซ้อมกู้ จึงไม่ชนกับการซ้อมตามเวลา) แล้วส่งข้อมูลที่เลือกให้ API → API แสดง **ตัวอย่างก่อนกู้** (จำนวนต่อชนิด, สิ่งที่ชน เช่น key ของ project หรือ id ของ test case ที่ถูกใช้ไปแล้ว: มีสิ่งที่ชนกู้ไม่ได้ จนกว่าจะแก้ในระบบจริง) → Admin ยืนยัน → API เขียนลงฐานจริงใน transaction เดียว (ผ่าน module เจ้าของข้อมูล ไม่ใช่ copy ดิบ) → ลบฐานพัก
     - ที่ไม่กลับมา (แสดงในตัวอย่างก่อนกู้): สิ่งที่ทำหลังเวลาของ snapshot, notification เก่า, การอ้างถึงจาก module อื่นที่ถูกปลดไปตอนลบถาวร (ผลการรัน / defect ของ test case)
     - ระบบไม่ต้องหยุด ผู้ใช้อื่นทำงานต่อได้; บันทึก audit `RESTORE` ของสิ่งที่กู้ (ระบุ snapshot) และแจ้ง Admin + ผู้ที่เปิด project นั้นได้
   - **กู้บนเครื่องใหม่**: ติดตั้งเครื่องใหม่ (`.env.prod` ชุดเดิม) → เข้าสู่ระบบด้วย Admin เริ่มต้น → **"กู้จากปลายทางที่มีอยู่"**: ใส่ปลายทาง + key ถอดรหัส → เลือก snapshot → กู้ฐาน + copy ไฟล์อัปโหลดเข้า MinIO ใหม่ + คืนตั้งค่าของ agent → migration → restart → เข้าสู่ระบบด้วยรหัสเดิม
5. **ปลายทาง** (เลือกได้มากกว่าหนึ่ง; ต้องมีอย่างน้อยหนึ่งปลายทางนอกเครื่อง prod)

   | ปลายทาง | ตั้งค่า | กันการลบเมื่อ prod ถูกยึด | ลบตามอายุ | อ่านกลับ (ตรวจ / กู้) |
   | --- | --- | --- | --- | --- |
   | **MinIO mirror** (แนะนำเป็นหลัก) | URL + user ที่ **ไม่มีสิทธิ์ลบหรือข้ามการล็อก** | ได้ (Object Lock) | MinIO ทำเอง | ได้ |
   | **path** (NAS / NFS / USB ที่ mount ไว้) | path | ไม่ได้ | agent ทำ | ได้ |
   | **SSH** (rsync over SSH ไปเครื่อง backup) | host, user, path, key, host key | บางส่วน: บัญชีเขียนอย่างเดียว (เช่น `rrsync -wo`) + snapshot / ลบไฟล์เก่าโดยเครื่องปลายทาง | เครื่องปลายทาง | ใช้ key สำหรับอ่านแยก (เก็บในที่เก็บ secret ไม่วางบน prod) |

   - ไฟล์อัปโหลดส่งเพิ่มเฉพาะไฟล์ใหม่ (แอปไม่ลบไฟล์ จึงใช้ร่วมกันทุก snapshot)
   - **เข้ารหัส** snapshot ที่ส่งไป path / SSH ด้วย `age` (เลือกได้สำหรับ mirror)

#### รูปแบบ snapshot บนปลายทาง (อธิบายตัวเองได้ ไม่พึ่ง agent หรือฐานของเครื่องเดิม)

```text
<ปลายทาง>/testpulse/
|--- snapshots/<YYYYMMDD-HHMMSS>/
|     |--- manifest.json        เวอร์ชันแอป, migration ล่าสุด, จำนวนเอกสารต่อ collection, sha256 ของทุกไฟล์
|     |--- db.archive.gz[.age]  mongodump
|--- uploads/                   ไฟล์อัปโหลด (เพิ่มเฉพาะไฟล์ใหม่)
|--- agent/settings.json.age    ตั้งค่าของ agent (ตารางเวลา, ปลายทาง, Teams, ทีมที่แจ้ง)
```

ปลายทาง MinIO mirror ใช้ bucket ตามเดิม (`testpulse-backups` + `testpulse`) และเพิ่ม `manifest.json` / ตั้งค่าของ agent ไว้ใน bucket backup

#### สถาปัตยกรรม: Backup Agent
- **process แยกจาก API** อยู่ใน image เดียวกัน (`node dist/agent.js`) มีเครื่องมือ `mongodump` / `mongorestore` / `mc` / `rsync` / `age`; ตัวตั้งเวลาอยู่ใน agent; lock ทีละงาน
- **API ↔ agent คุยผ่าน HTTP + token เสมอ** (`BACKUP_AGENT_URL`, `BACKUP_AGENT_TOKEN`) แม้อยู่ container เดียวกัน; agent ส่งผลงานกลับ API (callback) → API สร้าง notification, audit และส่งอีเมล / Teams; การกู้ทับระบบจริง: API เข้าโหมดปิดปรับปรุงตามคำสั่งของ agent และ restart ตัวเองหลังกู้ (process ออก → supervisor เปิดใหม่)
- **ติดตั้งได้ 2 โหมด เปลี่ยนด้วย compose + env โดยไม่แก้โค้ด**
  - **embedded**: program ที่ 3 ใน supervisor ของ container `testpulse` (`BACKUP_AGENT=embedded`) รันเป็น user `backup` ฟังที่ `127.0.0.1`; `exit_on_fatal` ดูแค่ `api` / `nginx` (agent ล้มต้องไม่ทำให้แอปดับ)
  - **separate**: container ที่สองจาก image เดียวกัน (`command: agent`) ใน network ภายใน (`BACKUP_AGENT_URL=http://testpulse-backup:8090`); แยกขาดจากเว็บ และสำรองต่อได้ระหว่างแอปล่มหรืออัปเดต
  - เพื่อให้ย้ายโหมดได้: agent ไม่ import โมดูลของ API ตอนรัน, ไม่ใช้ env ของ API, ไม่สั่ง process อื่นใน container (เช่น `supervisorctl`), ไม่ใช้ไฟล์ร่วมกับ API นอกจาก volume ของตัวเอง
- **ที่เก็บข้อมูลของ agent: ไฟล์ใน volume ของตัวเอง** (`docker-data/backup-agent/`) **ไม่ใช้ MongoDB** (agent ต้องทำงานได้ตอน Mongo มีปัญหา, การกู้ฐานต้องไม่ย้อนตั้งค่าและประวัติ, เครื่องใหม่ต้องรู้ปลายทางก่อนมีฐาน)
  - `settings.json` (ส่วนที่เป็นความลับเข้ารหัสในไฟล์; export ไปกับทุก snapshot), `jobs.jsonl` (ประวัติ 90 วัน), `logs/<job id>.log`, `run.lock`
  - ข้อมูลน้อย (วันละไม่กี่รายการ) ไฟล์ธรรมดาพอ; ถ้าต้องค้นซับซ้อนขึ้นค่อยเปลี่ยนเป็น SQLite ใน volume เดียวกัน
- **รหัสผ่าน**: ของ agent อยู่ในไฟล์ที่อ่านได้เฉพาะ agent ไม่อยู่ใน env ของ API; API ไม่มีรหัสของปลายทางใด ๆ
- **เช็กพื้นที่** ทั้ง work dir และปลายทางก่อนสำรองทุกครั้ง
- **Monitor ภายนอก: Uptime Kuma** บนเครื่อง off-site (หรือเครื่องอื่นที่ไม่ใช่ prod): agent ส่งสัญญาณหลังทุกงาน (Push monitor: backup รายวันเตือนถ้าเงียบเกิน 26 ชม., ซ้อมกู้รายสัปดาห์เตือนถ้าเงียบเกิน 8 วัน) + ตรวจ `https://…/testpulse/health/ready` และ health ของ mirror; แจ้งเตือนทางอีเมลและ Teams ช่องทางเดียวกัน เพื่อให้เตือนได้แม้เครื่อง prod ดับ

#### ที่เก็บ secret ของทีม (ต้องมีครบ ส่วนอื่นหายไปพร้อม prod ได้)
| รายการ | ถ้าหาย |
| --- | --- |
| `backend/.env.prod` | ข้อมูลที่เข้ารหัสอ่านไม่ออก เข้าสู่ระบบไม่ได้ |
| `.env` (รหัส MongoDB / MinIO ของเครื่อง) | ตั้งใหม่ได้ ไม่เสียข้อมูล |
| key ของ `age` | **snapshot ที่เข้ารหัสเปิดไม่ได้ทั้งหมด** |
| ปลายทาง + รหัส / key สำหรับอ่าน (mirror, SSH) | ไปเอา backup มาไม่ได้ |
| รหัส Admin, Teams webhook URL, ที่อยู่ Uptime Kuma | ตั้งใหม่ได้ |

#### ระยะการพัฒนา
| ระยะ | ขอบเขต |
| --- | --- |
| 1 | agent + ตัวตั้งเวลา, หน้าสถานะและประวัติ, สั่งสำรอง / ตรวจ / ซ้อมกู้, รายการ snapshot (manifest), แจ้งเตือนในระบบ + อีเมล (ทีม) + Teams, ปลายทาง MinIO mirror, ส่งสัญญาณไป Uptime Kuma |
| 2 | กู้บางส่วนจาก UI (project ที่ถูกลบ, test case ที่ลบถาวร), กู้ทับระบบจริงจาก UI (ทั้ง 7 ขั้น) และกู้บนเครื่องใหม่จาก UI |
| 3 | ปลายทาง path / SSH, การเข้ารหัส `age`, export ตั้งค่าของ agent ไปกับ snapshot |

**ไม่อยู่ในขอบเขต**: ลบ snapshot จากหน้าเว็บ, แก้ระยะเวลาเก็บ / การล็อกจากหน้าเว็บ (ตั้งที่ปลายทาง), กู้บางส่วนนอกจาก project / test case (เช่น defect หรือเอกสารเดียว: ใช้วิธีด้วยมือ)

#### เกณฑ์รับงาน
- สั่งสำรอง / ตรวจ / ซ้อมกู้จากหน้าเว็บได้ ผลตรงกับสคริปต์ (`verify.sh` / `verify.sh restore`)
- งานตามเวลารันเองโดยไม่มี cron; รอบที่ข้ามไปถูกตรวจพบและแจ้ง; งานล้มมี notification ถึง Admin, อีเมลถึงทีมที่เลือก และข้อความใน Teams channel ที่กำหนด (ครั้งเดียวต่อเหตุการณ์ และแจ้งอีกครั้งเมื่อกลับมาปกติ); ปุ่มส่งข้อความทดสอบส่งถึงทั้งอีเมลและ Teams
- ปิดเครื่อง prod (หรือหยุด agent) แล้ว Uptime Kuma แจ้งทางอีเมลและ Teams ภายในเวลาที่ตั้ง
- (ระยะ 2) กู้ project ที่ถูกลบจาก UI แล้ว project กลับมาพร้อม requirement / test case / รอบการทดสอบ / defect / เอกสาร และรูปแสดงครบ โดยข้อมูลอื่นไม่เปลี่ยน; key หรือ id ที่ชนแสดงในตัวอย่างและไม่กู้; มี audit `RESTORE`; ระหว่างกู้ผู้ใช้อื่นทำงานได้; การซ้อมกู้ตามเวลาไม่กระทบฐานพัก
- (ระยะ 2) กู้ทับระบบจริงแล้วข้อมูลตรงกับ snapshot, มี backup ก่อนกู้ให้ย้อนได้, ระหว่างกู้ API ตอบ 503, snapshot ของเวอร์ชันเก่าได้ schema ปัจจุบัน, snapshot ของเวอร์ชันใหม่กว่าถูกปฏิเสธ; กู้บนเครื่องใหม่จาก UI แล้วเข้าสู่ระบบด้วยรหัสเดิมและรูปแสดงครบ
- (ระยะ 3) กู้จาก path / SSH บนเครื่องใหม่ได้โดยใช้แค่ของในที่เก็บ secret; ไฟล์ที่เข้ารหัสถอดไม่ได้ถ้าไม่มี key
- ผู้ที่ไม่ใช่ Admin เรียก API ได้ 403 และไม่เห็นเมนู; API ไม่มีรหัสของปลายทางใด ๆ; agent ล้มแล้วแอปยังใช้งานได้
- เปลี่ยนโหมด embedded ↔ separate ด้วย compose + env แล้วผ่านเกณฑ์ทุกข้อเหมือนเดิม (ทดสอบใน e2e-real ทั้งสองโหมด)

---

## 6. โครงสร้างข้อมูลหลัก (Data Models)

### Project (`src/types/index.ts`)
```typescript
export interface Project {
  id: string
  key: string
  name: string
  description: string
  logo?: string
  createdAt: string
  updatedAt: string
  targetDeadline?: string
  status: 'active' | 'in_review' | 'completed' | 'archived'
  tags: string[]
  memberCount: number
  milestones?: ProjectMilestone[]
}

export interface ProjectMilestone {
  id: string
  title: string
  date: string // YYYY-MM-DD
  type: 'code_freeze' | 'uat_signoff' | 'go_live'
  description?: string
}
```

### TestCase (`src/types/index.ts`)
```typescript
export interface TestCase {
  id: string
  projectId: string
  parentCaseId?: string | null
  requirement: string
  testScenario: string
  name: string
  description: string
  prerequisite: string
  steps: TestStep[]
  expectedResults: string
  expectedImages: string[]
  actualResults: string
  actualImages: string[]
  status: TestCaseStatus
  priority: TestCasePriority
  expiryDate: string // YYYY-MM-DD
  assignedTo?: string // QA Assigned
  assignedDev?: string // Dev Assigned
  rootCauseTag?: string // e.g. "Race Condition", "Spec Gap"
  churnCount?: number // Number of re-test ping-pong cycles
  executedBy?: string
  executedAt?: string
  version: string // e.g. "v1.0", "v1.1"
  versionHistory?: TestCaseVersionRecord[]
  createdAt: string
  updatedAt: string
}

export interface TestCaseVersionRecord {
  version: string
  updatedBy: string
  timestamp: string
  changeSummary: string
  status: TestCaseStatus
  reason?: string
}
```

### AuditTrailEntry (`src/types/index.ts`)
```typescript
export interface AuditTrailEntry {
  id: string
  timestamp: string
  userId: string
  userName: string
  userRole: string
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE' | 'EXPORT' | 'ADD_SUBCASE' | 'EXTEND_DUE_DATE' | 'SLA_BREACHED'
  targetType: 'PROJECT' | 'TEST_CASE'
  targetId: string
  targetTitle: string
  details: string
}
```

---

## 7. มาตรฐานด้านการออกแบบและ UX/UI (Design System Guidelines)

ใช้ **Fox Admin** เป็น Theme หลัก (Light + Dark, Primary สีน้ำเงิน `#1E4DB7`) กฎทั้งหมดอยู่ใน `CLAUDE.md`

1. **Theme tokens เท่านั้น**: ห้าม hardcode สี (hex/rgb/ชื่อสี Vuetify เช่น `purple`, `deep-orange`) ใน Component ใช้ `color="primary"`, `text-muted`, `bg-light-primary` หรือ `rgb(var(--v-theme-*))`
2. **Tone ของสถานะ** (กำหนดครั้งเดียวใน `test-case.service.ts`):
   | Status | Tone | | Priority | Tone |
   |---|---|---|---|---|
   | Pending Dev | primary | | Critical | error |
   | Ready for Test | info | | High | caution |
   | Untested | secondary | | Medium | info |
   | In Progress | warning | | Low | secondary |
   | Passed | success | | | |
   | Failed | error | | | |
   | Blocked | caution (สีส้ม เพิ่มใน theme) | | | |
3. **Typography**: Noto Sans Thai, ใช้คลาส `text-h1`…`text-caption` ตาม Fox (line-height สูงขึ้นสำหรับสระ/วรรณยุกต์ไทย) ห้ามตั้ง `font-size` เอง
4. **Layout**: `FoxPageHeader` (breadcrumb + actions) ทุกหน้า, `fox-stack` / `fox-grid` สำหรับระยะห่าง, Card ใช้ `<v-card>` + `fox-card-body` (radius/shadow มาจาก theme)
5. **Forms**: Label อยู่เหนือช่อง (`<label class="fox-label">`), ฟิลด์ outlined/comfortable ตาม defaults, Dialog: หัวเรื่อง `text-h5` + ปุ่มปิด, ปุ่ม `ยกเลิก` (outlined) + ปุ่มหลัก (primary)
6. **No System Emojis**: ใช้ Tabler Icons เท่านั้นใน UI (Emoji อนุญาตเฉพาะในไฟล์ Markdown ที่ Export ให้ Obsidian)
7. **RBAC ใน UI**: ซ่อน/ปิดปุ่มตามสิทธิ์ของ Role (`useTestCasePermissions`, `navigation.ts` → `permission`) Developer เปิด Test Case ได้แบบดูอย่างเดียว
8. **Fluid Responsiveness**: 360px → Ultrawide, Sidebar เป็น rail บน Desktop / overlay บน Tablet-Phone, Calendar ใช้ Container Query และเริ่มที่มุมมองรายการบนมือถือ
9. **Real-time Visual Feedback**: Snackbar ทุก Action, Tooltip บน Progress bar, Confetti เมื่อเคสผ่าน (ใหญ่ขึ้นเมื่อโปรเจกต์ผ่านครบ 100%)

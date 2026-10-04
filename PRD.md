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

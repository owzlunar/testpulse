<script setup lang="ts">
import { useLayoutStore } from '@/stores/layout.store'

const layout = useLayoutStore()

const topics: { icon: string; title: string; text: string }[] = [
  {
    icon: 'tabler:clipboard-list',
    title: '1. Requirements',
    text: 'บันทึก Requirement และ Acceptance Criteria แล้วกด "ร่างเคสด้วย AI" เพื่อให้ระบบร่าง Test Case ให้ Traceability Matrix จะอัปเดตเองตามผลทดสอบ',
  },
  {
    icon: 'tabler:flask',
    title: '2. สร้าง Test Case ให้เร็วขึ้น',
    text: 'ปุ่ม "สร้าง Test Case" เลือกได้ทั้งฟอร์มว่าง, Template, ร่างด้วย AI หรือนำเข้าจาก Excel/CSV และทำสำเนา (Clone) เคสเดิมได้ ตารางขั้นตอนวางหลายแถวจาก Excel ได้ในครั้งเดียว',
  },
  {
    icon: 'tabler:player-play',
    title: '3. รอบการทดสอบ',
    text: 'สร้างรอบ (เช่น Regression รอบที่ 2) เลือกเคส แล้วบันทึกผลทีละขั้นตอน วางภาพหน้าจอด้วย Ctrl/⌘ + V ได้ทันที ขั้นตอนที่ Fail กดรายงาน Defect ได้โดยระบบกรอกให้ครบ',
  },
  {
    icon: 'tabler:files',
    title: '4. ศูนย์เอกสาร',
    text: 'สร้าง UAT Sign-off, Test Summary, Test Specification และ RTM จากข้อมูลจริงในระบบ ดูตัวอย่างแบบ A4 พิมพ์/PDF หรือดาวน์โหลด Word แล้วส่งขอลงนามได้ในที่เดียว',
  },
  {
    icon: 'tabler:arrows-exchange',
    title: 'วงจร Dev ↔ QA',
    text: 'Pending Dev → Ready for Test → Passed หากไม่ผ่านจะเป็น Failed และตีกลับให้ Dev พร้อมนับรอบแก้ซ้ำ (Churn) เคสที่แก้ซ้ำเกิน 1 รอบจะแสดงป้าย High Churn',
  },
  {
    icon: 'tabler:clock-exclamation',
    title: 'SLA และการขยายเวลา',
    text: 'เคสที่เลยกำหนดจะแสดงป้ายเตือนและแจ้งผู้ที่ถือเคสอยู่ การเลื่อนวันส่งต้องระบุเหตุผล และถูกบันทึกลง Audit Trail พร้อมเพิ่มเวอร์ชัน',
  },
  {
    icon: 'tabler:certificate',
    title: 'เอกสาร UAT Sign-off',
    text: 'สรุป Pass Rate และรายชื่อผู้ลงนาม หากยังมีเคส Failed, Blocked หรือ Overdue ระบบจะขึ้น Release at Risk และบันทึกเป็น Conditional Acceptance',
  },
]
</script>

<template>
  <v-dialog v-model="layout.helpOpen" max-width="640">
    <v-card>
      <div class="d-flex align-center justify-space-between fox-card-body pb-0">
        <div>
          <h2 class="text-h5">คู่มือการใช้งาน TestPulse</h2>
          <p class="text-body-2 text-muted">ระบบบริหารจัดการการทดสอบสำหรับ QA, Developer และ Admin</p>
        </div>
        <v-btn icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="layout.helpOpen = false" />
      </div>

      <v-card-text class="fox-card-body">
        <div class="fox-stack">
          <div v-for="t in topics" :key="t.title" class="d-flex ga-4">
            <v-avatar color="primary" size="44" rounded="lg">
              <v-icon :icon="t.icon" size="22" />
            </v-avatar>
            <div>
              <div class="text-subtitle-2">{{ t.title }}</div>
              <div class="text-body-2 text-muted">{{ t.text }}</div>
            </div>
          </div>
        </div>
      </v-card-text>

      <div class="d-flex justify-end fox-card-body pt-0">
        <v-btn color="primary" @click="layout.helpOpen = false">เข้าใจแล้ว</v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>

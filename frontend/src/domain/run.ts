import type { Option, ResultStatus, RunStatus, RunType } from '@/types'
import { RESULT_LABELS, RESULT_TONES } from './rules/run'

// Rules the backend shares (snapshots, verdict -> case status, counts) live in ./rules/run.ts
export * from './rules/run'

export const RUN_TYPES: Option<RunType>[] = [
  { value: 'smoke', label: 'Smoke', hint: 'ตรวจฟังก์ชันหลักหลัง Deploy', tone: 'info', icon: 'tabler:flame' },
  { value: 'functional', label: 'Functional', hint: 'ทดสอบตาม Requirement', tone: 'primary', icon: 'tabler:puzzle' },
  { value: 'regression', label: 'Regression', hint: 'ทดสอบซ้ำหลังแก้ Bug', tone: 'caution', icon: 'tabler:refresh' },
  { value: 'uat', label: 'UAT', hint: 'ผู้ใช้ตรวจรับระบบ', tone: 'success', icon: 'tabler:certificate' },
]

export const RUN_STATUSES: Option<RunStatus>[] = [
  { value: 'planned', label: 'วางแผนแล้ว', tone: 'secondary', icon: 'tabler:calendar' },
  { value: 'in_progress', label: 'กำลังทดสอบ', tone: 'warning', icon: 'tabler:player-play' },
  { value: 'completed', label: 'เสร็จสิ้น', tone: 'success', icon: 'tabler:flag-check' },
]

export const RESULT_STATUSES: Option<ResultStatus>[] = [
  { value: 'passed', label: RESULT_LABELS.passed, hint: 'ผ่าน', tone: RESULT_TONES.passed, icon: 'tabler:circle-check' },
  { value: 'failed', label: RESULT_LABELS.failed, hint: 'ไม่ผ่าน', tone: RESULT_TONES.failed, icon: 'tabler:circle-x' },
  { value: 'blocked', label: RESULT_LABELS.blocked, hint: 'ทดสอบไม่ได้', tone: RESULT_TONES.blocked, icon: 'tabler:ban' },
  { value: 'skipped', label: RESULT_LABELS.skipped, hint: 'ข้าม', tone: RESULT_TONES.skipped, icon: 'tabler:player-skip-forward' },
  { value: 'untested', label: RESULT_LABELS.untested, tone: RESULT_TONES.untested, icon: 'tabler:circle-dashed' },
]

export const runTypeOf = (v: RunType) => RUN_TYPES.find((t) => t.value === v) ?? RUN_TYPES[1]

export const runStatusOf = (v: RunStatus) => RUN_STATUSES.find((s) => s.value === v) ?? RUN_STATUSES[0]

export const resultOf = (v: ResultStatus) => RESULT_STATUSES.find((r) => r.value === v) ?? RESULT_STATUSES[4]

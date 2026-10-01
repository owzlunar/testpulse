import type { Rule } from '@/types'

// Vuetify field rules shared by every form (messages in Thai)
export const required: Rule = (v) => (v !== null && v !== undefined && v !== '') || 'กรุณากรอกข้อมูล'
export const email: Rule = (v) => !v || /.+@.+\..+/.test(v) || 'รูปแบบอีเมลไม่ถูกต้อง'
export const phone: Rule = (v) => !v || /^0\d{8,9}$/.test(v) || 'เบอร์โทร 9–10 หลัก ขึ้นต้นด้วย 0'
export const postcode: Rule = (v) => !v || /^\d{5}$/.test(v) || 'รหัสไปรษณีย์ 5 หลัก'
export const minLength = (n: number): Rule => (v) => (!!v && v.length >= n) || `อย่างน้อย ${n} ตัวอักษร`

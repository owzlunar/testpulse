import type { User } from '#contract/types.js'
import type { Mail } from '#core/mail/mailer.js'

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export function inviteMail(user: User, link: string, ttlHours: number): Mail {
  const days = ttlHours % 24 === 0 ? `${ttlHours / 24} วัน` : `${ttlHours} ชั่วโมง`
  return {
    to: user.email,
    subject: 'คำเชิญเข้าใช้งาน TestPulse',
    text: [
      `สวัสดีคุณ ${user.name}`,
      '',
      'ผู้ดูแลระบบได้เพิ่มบัญชีของคุณใน TestPulse กรุณาตั้งรหัสผ่านเพื่อเริ่มใช้งานที่ลิงก์นี้:',
      link,
      '',
      `ลิงก์ใช้ได้ครั้งเดียวและหมดอายุใน ${days}`,
    ].join('\n'),
    html: `<p>สวัสดีคุณ ${escapeHtml(user.name)}</p>
<p>ผู้ดูแลระบบได้เพิ่มบัญชีของคุณใน TestPulse กรุณาตั้งรหัสผ่านเพื่อเริ่มใช้งาน</p>
<p><a href="${escapeHtml(link)}">ตั้งรหัสผ่าน</a></p>
<p>ลิงก์ใช้ได้ครั้งเดียวและหมดอายุใน ${days}</p>`,
  }
}

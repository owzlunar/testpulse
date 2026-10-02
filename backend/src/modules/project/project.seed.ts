import type { Seed } from '#core/module.js'
import { ProjectModel } from './project.model.js'

const DEMO_PROJECTS = [
  {
    _id: 'proj-1',
    key: 'PAY',
    name: 'PromptPay & QR Payment Gateway v3',
    description: 'ระบบชำระเงินผ่าน PromptPay QR และ Credit Card Gateway รองรับธุรกรรม 5,000 TPS และ webhook reconciliation',
    // a file of the web app (public/images), relative to its public path
    logo: 'images/projects/promptpay-logo.jpg',
    targetDeadline: '2026-10-15',
    status: 'active',
    tags: ['FinTech', 'High-Risk', 'Backend-API', 'PCI-DSS'],
    teamIds: ['team-payment'],
    milestones: [
      {
        id: 'm-1',
        title: 'Sprint 42 Code Freeze',
        date: '2026-10-02',
        type: 'code_freeze',
        description: 'หยุดรับฟีเจอร์ใหม่ มุ่งเน้นแก้ Bug และ Re-test',
      },
      {
        id: 'm-2',
        title: 'UAT Sign-off Deadline',
        date: '2026-10-15',
        type: 'uat_signoff',
        description: 'กำหนดการตรวจรับระบบร่วมกับธนาคารและ Merchant',
      },
      { id: 'm-3', title: 'Production Go-Live', date: '2026-10-25', type: 'go_live', description: 'Deploy ระบบขึ้น Production Cluster' },
    ],
  },
  {
    _id: 'proj-2',
    key: 'SHOP',
    name: 'Omnichannel SuperApp E-Commerce',
    description: 'แอปพลิเคชันซื้อสินค้าออนไลน์ ครอบคลุมระบบ Shopping Cart, Flash Sale, Point Redemption และ Delivery Tracking',
    targetDeadline: '2026-10-05',
    status: 'active',
    tags: ['Mobile-App', 'iOS/Android', 'E-Commerce', 'FlashSale'],
    teamIds: ['team-ecommerce'],
  },
  {
    _id: 'proj-3',
    key: 'AUTH',
    name: 'Enterprise SSO & IAM Platform',
    description: 'ระบบ Identity and Access Management สำหรับพนักงานองค์กร รองรับ OAuth2/OIDC, Multi-factor Authentication (FIDO2) และ RBAC',
    targetDeadline: '2026-11-01',
    status: 'in_review',
    tags: ['Security', 'OAuth2', '2FA', 'Audit'],
    teamIds: [],
  },
]

export const projectSeed: Seed = {
  name: 'projects',
  async run() {
    for (const { _id, ...project } of DEMO_PROJECTS) await ProjectModel.findOneAndUpdate({ _id }, { $set: project }, { upsert: true })
  },
}

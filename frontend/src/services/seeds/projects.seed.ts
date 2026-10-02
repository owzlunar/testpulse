// Demo data for project.service.ts (the mock database is seeded with it on first use)
import type { Project } from '@/types'

export const SEED_PROJECTS: Project[] = [
  {
    id: 'proj-1',
    key: 'PAY',
    name: 'PromptPay & QR Payment Gateway v3',
    description: 'ระบบชำระเงินผ่าน PromptPay QR และ Credit Card Gateway รองรับธุรกรรม 5,000 TPS และ webhook reconciliation',
    // relative to the app's public path (<base href>)
    logo: 'images/projects/promptpay-logo.jpg',
    createdAt: '2026-09-01T08:00:00Z',
    updatedAt: '2026-09-29T10:30:00Z',
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
    id: 'proj-2',
    key: 'SHOP',
    name: 'Omnichannel SuperApp E-Commerce',
    description: 'แอปพลิเคชันซื้อสินค้าออนไลน์ ครอบคลุมระบบ Shopping Cart, Flash Sale, Point Redemption และ Delivery Tracking',
    createdAt: '2026-09-10T09:00:00Z',
    updatedAt: '2026-09-30T04:15:00Z',
    targetDeadline: '2026-10-05',
    status: 'active',
    tags: ['Mobile-App', 'iOS/Android', 'E-Commerce', 'FlashSale'],
    teamIds: ['team-ecommerce'],
  },
  {
    id: 'proj-3',
    key: 'AUTH',
    name: 'Enterprise SSO & IAM Platform',
    description: 'ระบบ Identity and Access Management สำหรับพนักงานองค์กร รองรับ OAuth2/OIDC, Multi-factor Authentication (FIDO2) และ RBAC',
    createdAt: '2026-08-15T11:00:00Z',
    updatedAt: '2026-09-28T09:00:00Z',
    targetDeadline: '2026-11-01',
    status: 'in_review',
    tags: ['Security', 'OAuth2', '2FA', 'Audit'],
  },
]

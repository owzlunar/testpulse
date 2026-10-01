// Demo data for team.service.ts (the mock database is seeded with it on first use)
import type { Team } from '@/types'

const at = '2026-09-01T09:00:00Z'

export const SEED_TEAMS: Team[] = [
  {
    id: 'team-payment',
    name: 'ทีม Payment',
    description: 'ระบบชำระเงิน PromptPay และ Payment Gateway',
    tone: 'primary',
    memberIds: ['user-qa-1', 'user-dev-1', 'user-dev-2'],
    createdAt: at,
    updatedAt: at,
  },
  {
    id: 'team-ecommerce',
    name: 'ทีม E-Commerce',
    description: 'SuperApp ซื้อสินค้าออนไลน์ และ Flash Sale',
    tone: 'success',
    memberIds: ['user-qa-2', 'user-dev-2'],
    createdAt: at,
    updatedAt: at,
  },
]

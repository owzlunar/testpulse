// Demo data for user.service.ts (the mock database is seeded with it on first use)
import type { User } from '@/types'

export const MOCK_USERS: User[] = [
  {
    id: 'user-admin',
    name: 'ศุภชัย วัฒนา (Admin)',
    email: 'admin@testpulse.dev',
    roleId: 'role-admin', // ADMIN_ROLE_ID: a literal here, since services import each other (load order)
    title: 'System Administrator',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'user-qa-1',
    name: 'สมชาย ประเสริฐ (QA Lead)',
    email: 'somchai.qa@testpulse.dev',
    roleId: 'role-qa-lead',
    title: 'Lead QA Engineer',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'user-dev-1',
    name: 'กิตติศักดิ์ พัฒนา (Dev Lead)',
    email: 'kittisak.dev@testpulse.dev',
    roleId: 'role-dev',
    title: 'Fullstack Lead Developer',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'user-dev-2',
    name: 'ธนากร สุขใจ (Backend API)',
    email: 'thanakorn.dev@testpulse.dev',
    roleId: 'role-dev',
    title: 'Backend Engineer',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'user-qa-2',
    name: 'พิชญา ศรีสุข (Senior Tester)',
    email: 'pitchaya.qa@testpulse.dev',
    roleId: 'role-qa-tester',
    title: 'Senior QA Tester',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'user-ops-1',
    name: 'อนุชา มั่นคง (Server/Infra)',
    email: 'anucha.ops@testpulse.dev',
    roleId: 'role-ops',
    title: 'Infrastructure Engineer',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
  },
]

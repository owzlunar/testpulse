import { hashPassword } from '#core/auth/password.js'
import type { Seed } from '#core/module.js'
import { UserModel } from './user.model.js'
import { emailIndex } from './user.repository.js'

// Demo users (same ids and emails as the web app's mock data), all with the password DEMO_PASSWORD.
export const DEMO_PASSWORD = 'password123'

const DEMO_USERS = [
  {
    _id: 'user-admin',
    name: 'ศุภชัย วัฒนา (Admin)',
    email: 'admin@testpulse.dev',
    roleId: 'role-admin',
    title: 'System Administrator',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
  },
  {
    _id: 'user-qa-1',
    name: 'สมชาย ประเสริฐ (QA Lead)',
    email: 'somchai.qa@testpulse.dev',
    roleId: 'role-qa-lead',
    title: 'Lead QA Engineer',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  },
  {
    _id: 'user-dev-1',
    name: 'กิตติศักดิ์ พัฒนา (Dev Lead)',
    email: 'kittisak.dev@testpulse.dev',
    roleId: 'role-dev',
    title: 'Fullstack Lead Developer',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  },
  {
    _id: 'user-dev-2',
    name: 'ธนากร สุขใจ (Backend API)',
    email: 'thanakorn.dev@testpulse.dev',
    roleId: 'role-dev',
    title: 'Backend Engineer',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  },
  {
    _id: 'user-qa-2',
    name: 'พิชญา ศรีสุข (Senior Tester)',
    email: 'pitchaya.qa@testpulse.dev',
    roleId: 'role-qa-tester',
    title: 'Senior QA Tester',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
  },
  {
    _id: 'user-ops-1',
    name: 'อนุชา มั่นคง (Server/Infra)',
    email: 'anucha.ops@testpulse.dev',
    roleId: 'role-ops',
    title: 'Infrastructure Engineer',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
  },
]

export const userSeed: Seed = {
  name: 'users',
  async run() {
    const passwordHash = await hashPassword(DEMO_PASSWORD)
    for (const { _id, ...fields } of DEMO_USERS) {
      // upsert by id; a user with this email under another id would be a different person: leave it
      const taken = await UserModel.findOne({ email_bidx: emailIndex(fields.email), _id: { $ne: _id } })
      if (taken) continue
      const doc = (await UserModel.findById(_id)) ?? new UserModel({ _id })
      doc.set({ ...fields, status: 'active', passwordHash })
      await doc.save()
    }
  },
}

// Demo accounts of development (the mock's seed users and the backend's `npm run seed`, same emails
// and password): one-click sign-in on the login page. Not shown in a production build.

export const DEMO_PASSWORD = 'password123'

export const DEMO_ACCOUNTS = [
  { name: 'ศุภชัย วัฒนา (Admin)', email: 'admin@testpulse.dev', role: 'Admin', tone: 'primary' },
  { name: 'สมชาย ประเสริฐ (QA Lead)', email: 'somchai.qa@testpulse.dev', role: 'QA Lead', tone: 'success' },
  { name: 'พิชญา ศรีสุข (Senior Tester)', email: 'pitchaya.qa@testpulse.dev', role: 'QA Tester', tone: 'info' },
  { name: 'กิตติศักดิ์ พัฒนา (Dev Lead)', email: 'kittisak.dev@testpulse.dev', role: 'Developer', tone: 'warning' },
  { name: 'ธนากร สุขใจ (Backend API)', email: 'thanakorn.dev@testpulse.dev', role: 'Developer', tone: 'warning' },
  { name: 'อนุชา มั่นคง (Server/Infra)', email: 'anucha.ops@testpulse.dev', role: 'Server/Infra', tone: 'caution' },
] as const

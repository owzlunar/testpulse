import type { Seed } from '#core/module.js'
import { TeamModel } from './team.model.js'

const DEMO_TEAMS = [
  {
    _id: 'team-payment',
    name: 'ทีม Payment',
    description: 'ระบบชำระเงิน PromptPay และ Payment Gateway',
    tone: 'primary',
    memberIds: ['user-qa-1', 'user-dev-1', 'user-dev-2'],
  },
  {
    _id: 'team-ecommerce',
    name: 'ทีม E-Commerce',
    description: 'SuperApp ซื้อสินค้าออนไลน์ และ Flash Sale',
    tone: 'success',
    memberIds: ['user-qa-2', 'user-dev-2'],
  },
]

export const teamSeed: Seed = {
  name: 'teams',
  async run() {
    for (const { _id, ...team } of DEMO_TEAMS) {
      await TeamModel.findOneAndUpdate({ _id }, { $set: { ...team, nameKey: team.name.toLowerCase() } }, { upsert: true })
    }
  },
}

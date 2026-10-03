import type { Defect } from '@/types'

/** still affects a release */
export const isOpenDefect = (d: Pick<Defect, 'status'>) => !['closed', 'rejected'].includes(d.status)

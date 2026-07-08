export interface PointRule {
  unitAmount: number
  pointsPerUnit: number
  description?: string
}

export interface PointEarnRecord {
  id?: number
  orderId: number
  orderNo: string
  type?: string
  amount: number
  points: number
  balanceAfter?: number
  remark?: string
  earnedAt: string
  createdAt?: string
}

export interface UserPointsSummary {
  totalPoints: number
  availablePoints: number
  totalAmount: number
  rule: PointRule
  recentEarned: PointEarnRecord[]
  recentTotalAmount: number
  recentTotalPoints: number
}

export interface PointLedgerRecord {
  id: number
  orderId: number | null
  orderNo: string
  type: string
  points: number
  amount: number
  balanceAfter: number
  remark: string
  earnedAt: string
  createdAt: string
}

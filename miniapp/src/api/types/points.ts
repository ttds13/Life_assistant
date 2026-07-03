export interface PointRule {
  unitAmount: number
  pointsPerUnit: number
  description?: string
}

export interface PointEarnRecord {
  orderId: number
  orderNo: string
  amount: number
  points: number
  earnedAt: string
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

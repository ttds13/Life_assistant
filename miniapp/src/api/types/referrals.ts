export interface ReferralInvitation {
  shareCode: string
  inviteToken: string
  sharePath: string
  expiresAt: string | null
}

export interface ReferralSummary {
  invitedCount: number
  activeInvitedCount: number
  rewardCount: number
  rewardPoints: number
  rewardValue: number
}

export interface ReferralReward {
  id: number
  orderId: number
  orderNo: string
  sourceUser: { id: number; nickname: string; phone: string } | null
  points: number
  rewardValue: number
  status: string
  ruleVersion: number
  createdAt: string
}

export interface ReferralBindingResult {
  id: number
  inviter: { id: number; nickname: string; phone: string } | null
  source: string
  status: string
  shareCode: string
  boundAt: string
}

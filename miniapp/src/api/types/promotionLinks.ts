export interface PromotionLinkResolveResult {
  key: string
  title: string
  description: string
  targetType: 'service' | 'member_card' | 'category' | 'home'
  targetId: number | null
  targetCode: string
  targetName: string
  source: string
  campaignId: number | null
  miniappPath: string
  resolvedPath: string
  fallbackPath: string
  targetAvailable: boolean
}

export type HomeBannerLinkType = 'none' | 'service' | 'category' | 'url'

export interface HomeBanner {
  id: number
  title: string
  subtitle?: string
  imageUrl: string
  imageOssUrl?: string
  imageDisplayUrl?: string
  linkType: HomeBannerLinkType
  linkValue?: string
  sortOrder: number
  status: number
}

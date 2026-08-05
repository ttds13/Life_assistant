import type { UserMemberCard } from '@/api/types/memberCards'
import type { Service } from '@/api/types/services'
import { getMyMemberCards } from '@/api/memberCards'
import { getServices } from '@/api/services'

function normalizeServiceList(data: any): Service[] {
  if (Array.isArray(data))
    return data
  return data?.items || data?.list || data?.records || []
}

function serviceCodesForCard(card: UserMemberCard) {
  const structuredCodes = (card.serviceRuleList || [])
    .filter(rule => rule.status !== 0 && rule.serviceStatus !== 0 && Boolean(rule.serviceCode))
    .map(rule => rule.serviceCode)
  if (structuredCodes.length)
    return Array.from(new Set(structuredCodes))

  return Array.from(new Set((card.applicableServices || [])
    .filter(item => /^[a-z][\w-]{0,63}$/i.test(item))))
}

function bookingUrl(service: Service, card: UserMemberCard) {
  const params = [
    service.code ? `serviceCode=${encodeURIComponent(service.code)}` : '',
    `serviceId=${encodeURIComponent(String(service.id))}`,
    `memberCardId=${encodeURIComponent(String(card.id))}`,
    `source=member_card`,
  ].filter(Boolean).join('&')
  return `/pages/order/create?${params}`
}

function serviceListUrl(card: UserMemberCard, serviceCodes: string[]) {
  const params = [
    `memberCardId=${encodeURIComponent(String(card.id))}`,
    `cardType=${encodeURIComponent(card.cardType)}`,
    `cardName=${encodeURIComponent(card.name)}`,
    `source=member_card`,
    serviceCodes.length ? `serviceCodes=${encodeURIComponent(serviceCodes.join(','))}` : '',
  ].filter(Boolean).join('&')
  return `/pages/service/list?${params}`
}

async function resolveCard(cardOrId: UserMemberCard | number) {
  if (typeof cardOrId !== 'number')
    return cardOrId
  const cards = await getMyMemberCards()
  return cards.find(card => card.id === cardOrId)
}

export async function navigateToMemberCardReservation(cardOrId: UserMemberCard | number) {
  try {
    const card = await resolveCard(cardOrId)
    if (!card) {
      uni.showToast({ icon: 'none', title: '未找到对应会员卡' })
      return false
    }
    const now = Date.now()
    const isPastActivationDeadline = card.status === 'pending_activation'
      && Boolean(card.activationDeadlineAt)
      && new Date(card.activationDeadlineAt!).getTime() <= now
    const isExpired = card.status === 'active'
      && Boolean(card.expireAt)
      && new Date(card.expireAt!).getTime() <= now
    if (!['pending_activation', 'active'].includes(card.status)
      || card.availabilityState === 'suspended'
      || isPastActivationDeadline
      || isExpired
      || !card.available
      || card.usableUnits <= 0) {
      uni.showToast({ icon: 'none', title: '会员卡暂无可用权益' })
      return false
    }

    const serviceCodes = serviceCodesForCard(card)
    const result = await getServices({
      cardType: card.cardType,
      serviceCodes: serviceCodes.length ? serviceCodes.join(',') : undefined,
      page: 1,
      pageSize: 50,
    })
    const services = normalizeServiceList(result).filter(service => service.status !== 0)
    if (services.length === 1) {
      uni.navigateTo({ url: bookingUrl(services[0], card) })
      return true
    }
    if (services.length > 1) {
      uni.navigateTo({ url: serviceListUrl(card, serviceCodes) })
      return true
    }

    uni.showToast({ icon: 'none', title: '该会员卡暂无可预约服务' })
    return false
  }
  catch {
    uni.showToast({ icon: 'none', title: '预约服务加载失败' })
    return false
  }
}

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`)
}

function jsonStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map(item => String(item || '').trim()).filter(Boolean)
}

function ruleConsumeUnits(value: unknown, service: { id: bigint, code: string, name: string }) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0
  const record = value as Record<string, unknown>
  for (const key of [String(service.id), service.code, service.name]) {
    const rule = record[key]
    if (typeof rule === 'number' && Number.isInteger(rule) && rule > 0) return rule
    if (rule && typeof rule === 'object' && !Array.isArray(rule)) {
      const consumeUnits = Number((rule as Record<string, unknown>).consumeUnits)
      if (Number.isInteger(consumeUnits) && consumeUnits > 0) return consumeUnits
    }
  }
  return 0
}

function serviceCardType(service: {
  cardType: string
  durationMinutes: number | null
  consultationRequired: boolean
}) {
  if (service.consultationRequired || service.cardType === 'consultation') return 'consultation'
  if (['time', 'times', 'none'].includes(service.cardType)) return service.cardType
  if ((service.durationMinutes || 0) > 0) return 'time'
  return 'none'
}

function fallbackConsumeUnits(
  card: { cardType: string, unitMinutes: number | null, minConsumeUnits: number },
  service: { consumeUnit: number | null, durationMinutes: number | null },
) {
  if (card.cardType === 'time') {
    return service.consumeUnit || service.durationMinutes || card.unitMinutes || card.minConsumeUnits || 1
  }
  return service.consumeUnit || card.minConsumeUnits || 1
}

async function findService(key: string) {
  const trimmed = key.trim()
  if (!trimmed) return null
  const numericId = /^\d+$/.test(trimmed) ? BigInt(trimmed) : undefined
  return prisma.service.findFirst({
    where: {
      OR: [
        ...(numericId ? [{ id: numericId }] : []),
        { code: trimmed },
        { name: trimmed },
      ],
    },
    orderBy: { id: 'asc' },
  })
}

async function main() {
  const apply = hasFlag('apply')
  const cards = await prisma.memberCard.findMany({
    include: {
      serviceRuleItems: true,
    },
    orderBy: [{ id: 'asc' }],
  })

  const report: Array<Record<string, unknown>> = []
  let created = 0
  let skipped = 0
  for (const card of cards) {
    const keys = jsonStringArray(card.applicableServices)
    const seenServices = new Set(card.serviceRuleItems.map(rule => String(rule.serviceId)))
    if (!keys.length) {
      skipped += 1
      report.push({
        memberCardId: Number(card.id),
        memberCardName: card.name,
        status: 'universal-or-empty',
        message: 'no legacy applicableServices; no structured rows needed',
      })
      continue
    }
    for (const key of keys) {
      const service = await findService(key)
      if (!service) {
        report.push({
          memberCardId: Number(card.id),
          memberCardName: card.name,
          legacyKey: key,
          status: 'unmatched',
          message: 'legacy service key cannot match service id/code/name',
        })
        continue
      }
      const type = serviceCardType(service)
      if (type !== card.cardType) {
        report.push({
          memberCardId: Number(card.id),
          memberCardName: card.name,
          serviceId: Number(service.id),
          serviceName: service.name,
          status: 'type-mismatch',
          cardType: card.cardType,
          serviceCardType: type,
        })
        continue
      }
      const consumeUnits = ruleConsumeUnits(card.serviceRules, service) || fallbackConsumeUnits(card, service)
      const exists = seenServices.has(String(service.id))
      if (exists) {
        skipped += 1
        report.push({
          memberCardId: Number(card.id),
          memberCardName: card.name,
          serviceId: Number(service.id),
          serviceName: service.name,
          status: 'exists',
          consumeUnits,
        })
        continue
      }
      if (apply) {
        await prisma.memberCardServiceRule.create({
          data: {
            memberCardId: card.id,
            serviceId: service.id,
            consumeUnits,
            status: 1,
            remark: 'migrated from legacy member card JSON by day42 script',
          },
        })
      }
      seenServices.add(String(service.id))
      created += 1
      report.push({
        memberCardId: Number(card.id),
        memberCardName: card.name,
        serviceId: Number(service.id),
        serviceName: service.name,
        status: apply ? 'created' : 'would-create',
        consumeUnits,
      })
    }
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'check',
    totalCards: cards.length,
    created,
    skipped,
    report,
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

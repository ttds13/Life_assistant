import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const [products, purchaseOrders, userCards] = await Promise.all([
    prisma.memberCard.findMany({
      where: { deletedAt: null },
      include: {
        publishedVersion: true,
        serviceRuleItems: { include: { service: true } },
        _count: { select: { purchaseOrders: true, userCards: true } },
      },
      orderBy: { id: 'asc' },
    }),
    prisma.memberCardPurchaseOrder.findMany({
      select: { orderId: true, memberCardPlanId: true, memberCardPlanVersion: true, planSnapshot: true },
    }),
    prisma.userMemberCard.findMany({
      select: { id: true, cardId: true, planVersion: true, planSnapshot: true },
    }),
  ])

  const versionKeys = new Set((await prisma.memberCardPlanVersion.findMany({
    select: { memberCardId: true, version: true },
  })).map(item => `${item.memberCardId}:${item.version}`))

  const issues: Array<Record<string, unknown>> = []
  for (const product of products) {
    if (product.status === 1 && !product.publishedVersion) {
      issues.push({ code: 'on_sale_without_published_version', productId: Number(product.id), name: product.name })
    }
    if (product.publishedVersion && product.publishedVersion.version !== product.currentVersion) {
      issues.push({
        code: 'published_version_pointer_mismatch',
        productId: Number(product.id),
        currentVersion: product.currentVersion,
        pointedVersion: product.publishedVersion.version,
      })
    }
    if (product.publishedVersion) {
      const publishedRules = Array.isArray(product.publishedVersion.redemptionRules)
        ? product.publishedVersion.redemptionRules
        : []
      if (!product.publishedVersion.productCode || !product.publishedVersion.productName) {
        issues.push({
          code: 'published_product_identity_missing',
          productId: Number(product.id),
          version: product.publishedVersion.version,
        })
      }
      if (product.status === 1 && publishedRules.length === 0) {
        issues.push({
          code: 'on_sale_product_rules_missing',
          productId: Number(product.id),
          name: product.name,
          version: product.publishedVersion.version,
        })
      }
    }
    for (const rule of product.serviceRuleItems) {
      if (rule.status === 1 && (rule.service.deletedAt || rule.service.status !== 1)) {
        issues.push({
          code: 'active_rule_references_inactive_service',
          productId: Number(product.id),
          serviceId: Number(rule.serviceId),
          serviceName: rule.service.name,
        })
      }
    }
  }

  for (const purchase of purchaseOrders) {
    const key = `${purchase.memberCardPlanId}:${purchase.memberCardPlanVersion}`
    if (!versionKeys.has(key)) {
      issues.push({ code: 'purchase_version_missing', orderId: Number(purchase.orderId), versionKey: key })
    }
    if (!purchase.planSnapshot) {
      issues.push({ code: 'purchase_snapshot_missing', orderId: Number(purchase.orderId), versionKey: key })
    }
  }
  for (const card of userCards) {
    if (!card.planSnapshot) {
      issues.push({ code: 'user_card_snapshot_missing', userMemberCardId: Number(card.id), cardId: Number(card.cardId) })
    }
  }

  const summary = {
    products: products.length,
    onSaleProducts: products.filter(item => item.status === 1).length,
    publishedProducts: products.filter(item => item.publishedVersionId !== null).length,
    purchaseOrders: purchaseOrders.length,
    userCards: userCards.length,
    issues: issues.length,
  }
  console.log(JSON.stringify({ summary, issues }, null, 2))
  if (issues.length) process.exitCode = 1
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

import { PrismaClient } from '@prisma/client'

interface Check {
  name: string
  passed: boolean
  count: number
  message: string
}

async function main() {
  const prisma = new PrismaClient()
  try {
    const [
      serviceProductCount,
      memberCardProductCount,
      serviceBookingCount,
      serviceEntitlementCount,
      memberCardEntitlementCount,
      dualExtensionCount,
      invalidCardStatusCount,
      invalidPendingCardCount,
      invalidActiveCardCount,
      invalidCompletedCardCount,
    ] = await Promise.all([
      prisma.order.count({ where: { serviceBooking: { is: { redemption: { is: null } } } } }),
      prisma.order.count({ where: { memberCardPurchase: { isNot: null } } }),
      prisma.order.count({ where: { serviceBooking: { isNot: null } } }),
      prisma.order.count({ where: { serviceBooking: { is: { redemption: { is: null } } } } }),
      prisma.order.count({ where: { serviceBooking: { is: { redemption: { isNot: null } } } } }),
      prisma.order.count({
        where: {
          serviceBooking: { isNot: null },
          memberCardPurchase: { isNot: null },
        },
      }),
      prisma.userMemberCard.count({ where: { status: { notIn: ['pending_activation', 'active', 'completed'] } } }),
      prisma.userMemberCard.count({
        where: {
          status: 'pending_activation',
          OR: [
            { activationDeadlineAt: null },
            { activatedAt: { not: null } },
            { expireAt: { not: null } },
            { completedAt: { not: null } },
            { completedReason: { not: null } },
          ],
        },
      }),
      prisma.userMemberCard.count({
        where: {
          status: 'active',
          OR: [
            { activatedAt: null },
            { expireAt: null },
            { completedAt: { not: null } },
            { completedReason: { not: null } },
          ],
        },
      }),
      prisma.userMemberCard.count({
        where: {
          status: 'completed',
          OR: [
            { completedAt: null },
            { completedReason: null },
          ],
        },
      }),
    ])

    const checks: Check[] = [
      {
        name: 'product.extension.exclusive',
        passed: dualExtensionCount === 0,
        count: dualExtensionCount,
        message: 'one order cannot be both a service product and a member-card product',
      },
      {
        name: 'booking.entitlement.reconciled',
        passed: serviceBookingCount === serviceEntitlementCount + memberCardEntitlementCount,
        count: serviceBookingCount - serviceEntitlementCount - memberCardEntitlementCount,
        message: 'every service booking must have exactly one entitlement type',
      },
      {
        name: 'user-card.status.valid',
        passed: invalidCardStatusCount === 0,
        count: invalidCardStatusCount,
        message: 'user cards must use pending_activation, active, or completed',
      },
      {
        name: 'user-card.pending.lifecycle.valid',
        passed: invalidPendingCardCount === 0,
        count: invalidPendingCardCount,
        message: 'pending cards need an activation deadline and no activation/completion fields',
      },
      {
        name: 'user-card.active.lifecycle.valid',
        passed: invalidActiveCardCount === 0,
        count: invalidActiveCardCount,
        message: 'active cards need activation and expiry without completion fields',
      },
      {
        name: 'user-card.completed.lifecycle.valid',
        passed: invalidCompletedCardCount === 0,
        count: invalidCompletedCardCount,
        message: 'completed cards need a completion timestamp and reason',
      },
    ]
    const failed = checks.filter(check => !check.passed)
    console.log(JSON.stringify({
      audit: 'day50-user-commerce',
      status: failed.length ? 'failed' : 'passed',
      failedChecks: failed.length,
      counts: {
        productOrders: serviceProductCount + memberCardProductCount,
        serviceProducts: serviceProductCount,
        memberCardProducts: memberCardProductCount,
        serviceBookings: serviceBookingCount,
        serviceEntitlements: serviceEntitlementCount,
        memberCardEntitlements: memberCardEntitlementCount,
      },
      checks,
    }, null, 2))
    if (failed.length) process.exitCode = 1
  }
  finally {
    await prisma.$disconnect()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

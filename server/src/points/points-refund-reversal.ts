import { Prisma } from '@prisma/client'

export interface PointRefundReversalInput {
  totalPoints: number
  reversedPoints: number
  baseAmount: Prisma.Decimal
  reversedBaseAmount: Prisma.Decimal
  refundAmount: Prisma.Decimal
}

export interface PointRefundReversalResult {
  nextReversedBaseAmount: Prisma.Decimal
  targetReversedPoints: number
  deltaPoints: number
}

export function calculatePointRefundReversal(input: PointRefundReversalInput): PointRefundReversalResult {
  if (input.baseAmount.lessThanOrEqualTo(0)) {
    return {
      nextReversedBaseAmount: input.reversedBaseAmount,
      targetReversedPoints: input.reversedPoints,
      deltaPoints: 0,
    }
  }

  const normalizedRefund = input.refundAmount.lessThan(0) ? new Prisma.Decimal(0) : input.refundAmount
  const cumulativeRefund = input.reversedBaseAmount.add(normalizedRefund)
  const nextReversedBaseAmount = cumulativeRefund.greaterThan(input.baseAmount)
    ? input.baseAmount
    : cumulativeRefund
  const targetReversedPoints = nextReversedBaseAmount.greaterThanOrEqualTo(input.baseAmount)
    ? input.totalPoints
    : new Prisma.Decimal(input.totalPoints)
        .mul(nextReversedBaseAmount)
        .div(input.baseAmount)
        .floor()
        .toNumber()
  const remainingPoints = Math.max(0, input.totalPoints - input.reversedPoints)
  const deltaPoints = Math.min(
    remainingPoints,
    Math.max(0, targetReversedPoints - input.reversedPoints),
  )

  return { nextReversedBaseAmount, targetReversedPoints, deltaPoints }
}

import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import { calculatePointRefundReversal } from '../src/points/points-refund-reversal'

function runRefundSequence(totalPoints: number, baseAmount: string, refunds: string[]) {
  let reversedPoints = 0
  let reversedBaseAmount = new Prisma.Decimal(0)
  const deltas: number[] = []

  for (const amount of refunds) {
    const result = calculatePointRefundReversal({
      totalPoints,
      reversedPoints,
      baseAmount: new Prisma.Decimal(baseAmount),
      reversedBaseAmount,
      refundAmount: new Prisma.Decimal(amount),
    })
    deltas.push(result.deltaPoints)
    reversedPoints += result.deltaPoints
    reversedBaseAmount = result.nextReversedBaseAmount
  }

  return { deltas, reversedPoints, reversedBaseAmount: reversedBaseAmount.toFixed(2) }
}

assert.deepEqual(runRefundSequence(10, '1.00', ['0.01']), {
  deltas: [0],
  reversedPoints: 0,
  reversedBaseAmount: '0.01',
})
assert.deepEqual(runRefundSequence(10, '1.00', ['0.01', '0.09', '0.90']), {
  deltas: [0, 1, 9],
  reversedPoints: 10,
  reversedBaseAmount: '1.00',
})
assert.deepEqual(runRefundSequence(1000, '100.00', ['33.33', '33.33', '33.34']), {
  deltas: [333, 333, 334],
  reversedPoints: 1000,
  reversedBaseAmount: '100.00',
})
assert.deepEqual(runRefundSequence(200, '100.00', ['1.00']), {
  deltas: [2],
  reversedPoints: 2,
  reversedBaseAmount: '1.00',
})
assert.deepEqual(runRefundSequence(10, '1.00', ['2.00']), {
  deltas: [10],
  reversedPoints: 10,
  reversedBaseAmount: '1.00',
})

console.log('Day57 point refund calculation tests passed')

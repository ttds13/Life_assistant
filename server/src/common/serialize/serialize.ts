import { Prisma } from '@prisma/client'

function safeBigIntToNumber(value: bigint): number {
  const numberValue = Number(value)
  if (!Number.isSafeInteger(numberValue)) {
    throw new Error(`BigInt value exceeds Number safe integer range: ${value.toString()}`)
  }
  return numberValue
}

export function serialize(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'bigint') return safeBigIntToNumber(value)
  if (value instanceof Prisma.Decimal) return value.toNumber()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(item => serialize(item))
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      result[key] = serialize(item)
    }
    return result
  }
  return value
}

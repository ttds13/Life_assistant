/**
 * Normalize Prisma values before sending JSON responses.
 */
function serialize(obj) {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'bigint') return Number(obj)
  if (obj && typeof obj === 'object' && typeof obj.toNumber === 'function') {
    return obj.toNumber()
  }
  if (obj instanceof Date) return obj.toISOString()
  if (Array.isArray(obj)) return obj.map(serialize)
  if (typeof obj === 'object') {
    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serialize(value)
    }
    return result
  }
  return obj
}

module.exports = { serialize }

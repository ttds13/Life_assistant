const { BusinessError } = require('../errors/business-error')
const { ErrorCode } = require('../errors/error-code')

function readJsonBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0

    req.on('data', (chunk) => {
      total += chunk.length
      if (total > maxBytes) {
        reject(new BusinessError(ErrorCode.COMMON_BAD_REQUEST, '请求体过大', 413))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => {
      if (!chunks.length) {
        resolve({})
        return
      }

      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw.trim()) {
        resolve({})
        return
      }

      try {
        resolve(JSON.parse(raw))
      }
      catch {
        reject(new BusinessError(ErrorCode.COMMON_BAD_REQUEST, '请求体必须是合法 JSON', 400))
      }
    })

    req.on('error', reject)
  })
}

module.exports = { readJsonBody }

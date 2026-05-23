const { BusinessError } = require('../common/errors/business-error')
const { ErrorCode } = require('../common/errors/error-code')
const { readJsonBody } = require('../common/http/body')
const { config } = require('../config/env')
const { seedDb } = require('../data/local-db')

async function seed(req) {
  if (config.isProduction) {
    throw new BusinessError(ErrorCode.AUTH_FORBIDDEN, '生产环境禁用 seed 接口', 403)
  }

  await readJsonBody(req)
  return seedDb()
}

module.exports = { seed }

const { ErrorCode } = require('./error-code')

class BusinessError extends Error {
  constructor(code, message, httpStatus = 400, data = null) {
    super(message)
    this.name = 'BusinessError'
    this.code = code || ErrorCode.COMMON_BAD_REQUEST
    this.httpStatus = httpStatus
    this.data = data
  }
}

module.exports = { BusinessError }

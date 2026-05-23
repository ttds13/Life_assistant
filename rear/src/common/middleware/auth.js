const jwt = require('jsonwebtoken')
const { config } = require('../../config/env')
const { BusinessError } = require('../errors/business-error')
const { ErrorCode } = require('../errors/error-code')

function extractToken(req) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) return null
  return header.slice(7)
}

function verifyAuth(req) {
  const token = extractToken(req)
  if (!token) {
    throw new BusinessError(ErrorCode.AUTH_NOT_LOGIN, '未登录或 token 已过期', 401)
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret)
    req.context.user = { userId: payload.userId, phone: payload.phone, role: payload.role }
  }
  catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new BusinessError(ErrorCode.AUTH_NOT_LOGIN, '登录已过期，请重新登录', 401)
    }
    throw new BusinessError(ErrorCode.AUTH_INVALID_TOKEN, 'token 无效', 401)
  }
}

module.exports = { verifyAuth }

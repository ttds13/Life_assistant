const crypto = require('node:crypto')
const { BusinessError } = require('./common/errors/business-error')
const { ErrorCode } = require('./common/errors/error-code')
const { sendError, sendSuccess } = require('./common/http/response')
const { requestLog, log } = require('./common/logger/app-logger')
const { config } = require('./config/env')
const authController = require('./auth/auth.controller')
const devController = require('./dev/dev.controller')
const healthController = require('./health/health.controller')
const servicesController = require('./services/services.controller')

const routes = [
  { method: 'GET', pattern: /^\/health\/?$/, handler: healthController.health },
  { method: 'GET', pattern: /^\/service-categories\/?$/, handler: servicesController.listCategories },
  { method: 'GET', pattern: /^\/services\/?$/, handler: servicesController.listServices },
  { method: 'GET', pattern: /^\/services\/(?<id>[^/]+)\/?$/, handler: servicesController.getServiceDetail },
  { method: 'POST', pattern: /^\/auth\/wechat-login\/?$/, handler: authController.wechatLogin },
  { method: 'POST', pattern: /^\/auth\/mock-login\/?$/, handler: authController.mockLogin },
  { method: 'GET', pattern: /^\/auth\/me\/?$/, handler: authController.getMe },
  { method: 'PUT', pattern: /^\/auth\/profile\/?$/, handler: authController.updateProfile },
  { method: 'POST', pattern: /^\/dev\/seed\/?$/, handler: devController.seed },
]

function createRequestId(req) {
  const headerValue = req.headers['x-request-id']
  if (typeof headerValue === 'string' && headerValue.trim()) return headerValue.trim()
  return `req_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
}

function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', config.corsOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id, X-Request-Source, X-Client-Version')
  res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id')
  res.setHeader('Vary', 'Origin')
}

function stripApiPrefix(pathname) {
  if (pathname === config.apiPrefix) return '/'
  if (pathname.startsWith(`${config.apiPrefix}/`)) {
    return pathname.slice(config.apiPrefix.length)
  }
  return null
}

function findRoute(method, routePath) {
  const pathMatches = routes.filter(route => route.pattern.test(routePath))
  if (!pathMatches.length) return null

  const route = pathMatches.find(item => item.method === method)
  if (!route) {
    const allowed = pathMatches.map(item => item.method).join(', ')
    throw new BusinessError(
      ErrorCode.COMMON_METHOD_NOT_ALLOWED,
      '请求方法不允许',
      405,
      { allowed },
    )
  }

  const match = routePath.match(route.pattern)
  return {
    handler: route.handler,
    params: match.groups || {},
  }
}

function createApp() {
  return async function app(req, res) {
    const startedAt = process.hrtime.bigint()
    req.context = {
      requestId: createRequestId(req),
      source: req.headers['x-request-source'] || 'unknown',
      clientVersion: req.headers['x-client-version'] || '',
    }

    res.setHeader('X-Request-Id', req.context.requestId)
    applyCors(req, res)

    try {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.end()
        return
      }

      req.parsedUrl = new URL(req.url, config.publicBaseUrl)
      const routePath = stripApiPrefix(req.parsedUrl.pathname)

      if (!routePath) {
        throw new BusinessError(ErrorCode.COMMON_NOT_FOUND, '接口不存在', 404)
      }

      const route = findRoute(req.method, routePath)
      if (!route) {
        throw new BusinessError(ErrorCode.COMMON_NOT_FOUND, '接口不存在', 404)
      }

      const data = await route.handler(req, route.params)
      sendSuccess(req, res, data)
    }
    catch (error) {
      if (!(error instanceof BusinessError)) {
        log('error', 'unhandled_error', {
          requestId: req.context.requestId,
          method: req.method,
          url: req.url,
          errorName: error.name,
          errorMessage: error.message,
          stack: error.stack,
        })
      }

      sendError(req, res, error)
    }
    finally {
      const durationMs = Number((process.hrtime.bigint() - startedAt) / 1000000n)
      requestLog(req, res, durationMs)
    }
  }
}

module.exports = { createApp }

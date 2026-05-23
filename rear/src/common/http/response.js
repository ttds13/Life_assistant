const { ErrorCode } = require('../errors/error-code')

function getRequestId(req) {
  return req.context?.requestId || 'req_unknown'
}

function createPayload(req, code, message, data) {
  return {
    code,
    message,
    data,
    requestId: getRequestId(req),
    timestamp: new Date().toISOString(),
  }
}

function sendJson(req, res, httpStatus, payload) {
  if (res.writableEnded) return

  const body = JSON.stringify(payload)
  res.statusCode = httpStatus
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', Buffer.byteLength(body))
  res.end(body)
}

function sendSuccess(req, res, data, message = 'ok', httpStatus = 200) {
  sendJson(req, res, httpStatus, createPayload(req, ErrorCode.OK, message, data))
}

function sendError(req, res, error) {
  const code = error.code || ErrorCode.COMMON_INTERNAL_ERROR
  const message = error.message || '服务器内部错误'
  const data = Object.prototype.hasOwnProperty.call(error, 'data') ? error.data : null
  const httpStatus = error.httpStatus || 500
  sendJson(req, res, httpStatus, createPayload(req, code, message, data))
}

module.exports = {
  sendSuccess,
  sendError,
}

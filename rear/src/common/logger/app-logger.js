function log(level, message, meta = {}) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  }
  const line = JSON.stringify(entry)
  if (level === 'error') console.error(line)
  else console.info(line)
}

function requestLog(req, res, durationMs) {
  log('info', 'http_request', {
    requestId: req.context?.requestId,
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    durationMs,
    source: req.context?.source,
    clientVersion: req.context?.clientVersion,
    ip: req.socket?.remoteAddress,
    userAgent: req.headers['user-agent'] || '',
  })
}

module.exports = {
  log,
  requestLog,
}

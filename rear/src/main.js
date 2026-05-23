const http = require('node:http')
const { createApp } = require('./app')
const { config } = require('./config/env')
const { log } = require('./common/logger/app-logger')

const server = http.createServer(createApp())

server.listen(config.port, config.host, () => {
  log('info', 'rear_started', {
    host: config.host,
    port: config.port,
    apiPrefix: config.apiPrefix,
    baseUrl: `${config.publicBaseUrl}${config.apiPrefix}`,
  })
})

function shutdown(signal) {
  log('info', 'rear_shutdown', { signal })
  server.close(() => {
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

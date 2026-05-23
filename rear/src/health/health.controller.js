const { config } = require('../config/env')

async function health() {
  return {
    status: 'ok',
    service: 'life-assistant-rear',
    env: config.nodeEnv,
    apiPrefix: config.apiPrefix,
    publicBaseUrl: config.publicBaseUrl,
  }
}

module.exports = { health }

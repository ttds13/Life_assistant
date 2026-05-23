const http = require('node:http')
const assert = require('node:assert/strict')
const { createApp } = require('../src/app')
const { config } = require('../src/config/env')

async function main() {
  const server = http.createServer(createApp())

  await new Promise((resolve) => {
    server.listen(0, config.host, resolve)
  })

  const { port } = server.address()
  const baseUrl = `http://${config.host}:${port}${config.apiPrefix}`

  async function request(pathname, options = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Source': 'miniapp',
        'X-Client-Version': '1.0.0',
        ...(options.headers || {}),
      },
    })
    const body = await response.json()
    assert.equal(typeof body.code, 'number')
    assert.equal(typeof body.message, 'string')
    assert.ok(Object.prototype.hasOwnProperty.call(body, 'data'))
    assert.equal(typeof body.requestId, 'string')
    assert.equal(typeof body.timestamp, 'string')
    return { response, body }
  }

  try {
    await request('/dev/seed', { method: 'POST', body: '{}' })

    const health = await request('/health')
    assert.equal(health.response.status, 200)
    assert.equal(health.body.data.status, 'ok')

    const categories = await request('/service-categories')
    assert.equal(categories.response.status, 200)
    assert.ok(Array.isArray(categories.body.data))
    assert.ok(categories.body.data.length >= 4)

    const services = await request('/services?page=1&pageSize=10')
    assert.equal(services.response.status, 200)
    assert.ok(Array.isArray(services.body.data.items))
    assert.equal(typeof services.body.data.total, 'number')

    const detail = await request('/services/1')
    assert.equal(detail.response.status, 200)
    assert.equal(detail.body.data.id, 1)

    const missing = await request('/services/999999')
    assert.equal(missing.response.status, 404)
    assert.equal(missing.body.code, 40001)

    // === Auth: mock login ===
    const login = await request('/auth/mock-login', {
      method: 'POST',
      body: JSON.stringify({ phone: '13800001111' }),
    })
    assert.equal(login.response.status, 200)
    assert.equal(login.body.code, 0)
    assert.equal(typeof login.body.data.accessToken, 'string')
    assert.ok(login.body.data.accessToken.length > 10)
    assert.equal(typeof login.body.data.expiresIn, 'number')
    assert.equal(login.body.data.user.role, 'user')
    assert.ok(login.body.data.user.phone.includes('****'))

    const token = login.body.data.accessToken

    // === Auth: get me (with token) ===
    const me = await request('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(me.response.status, 200)
    assert.equal(me.body.code, 0)
    assert.equal(me.body.data.id, login.body.data.user.id)

    // === Auth: get me (no token) ===
    const noAuth = await request('/auth/me')
    assert.equal(noAuth.response.status, 401)
    assert.equal(noAuth.body.code, 20001)

    // === Auth: get me (invalid token) ===
    const badAuth = await request('/auth/me', {
      headers: { Authorization: 'Bearer invalid.token.here' },
    })
    assert.equal(badAuth.response.status, 401)
    assert.equal(badAuth.body.code, 20002)

    // === Auth: update profile ===
    const profile = await request('/auth/profile', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nickname: '测试用户' }),
    })
    assert.equal(profile.response.status, 200)
    assert.equal(profile.body.data.nickname, '测试用户')

    // === Auth: same phone returns same user ===
    const login2 = await request('/auth/mock-login', {
      method: 'POST',
      body: JSON.stringify({ phone: '13800001111' }),
    })
    assert.equal(login2.body.data.user.id, login.body.data.user.id)

    console.info('contract-test-ok')
  }
  finally {
    server.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

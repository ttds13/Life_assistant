import { strict as assert } from 'node:assert'
import { createConfiguredApp } from '../src/main'

const port = Number(process.env.CONTRACT_PORT || 3210)
const baseUrl = `http://127.0.0.1:${port}/api`

interface ApiResponse<T = any> {
  code: number
  message: string
  data: T
  requestId: string
  timestamp: string
}

async function request<T>(pathname: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Source': 'miniapp',
      'X-Client-Version': '1.0.0',
      ...(options.headers || {}),
    },
  })
  const body = await response.json() as ApiResponse<T>
  assert.equal(typeof body.code, 'number')
  assert.equal(typeof body.message, 'string')
  assert.ok(Object.prototype.hasOwnProperty.call(body, 'data'))
  assert.equal(typeof body.requestId, 'string')
  assert.equal(typeof body.timestamp, 'string')
  return { response, body }
}

async function main() {
  process.env.HOST = '127.0.0.1'
  process.env.PORT = String(port)
  const app = await createConfiguredApp()
  await app.listen(port, '127.0.0.1')

  try {
    const health = await request<{ status: string }>('/health')
    assert.equal(health.response.status, 200)
    assert.equal(health.body.code, 0)
    assert.equal(health.body.data.status, 'ok')

    const categories = await request<any[]>('/service-categories')
    assert.equal(categories.response.status, 200)
    assert.ok(Array.isArray(categories.body.data))
    assert.ok(categories.body.data.length >= 4)
    assert.equal(typeof categories.body.data[0].id, 'number')
    assert.equal(typeof categories.body.data[0].icon, 'string')

    const services = await request<{ items: any[], total: number, page: number, pageSize: number }>('/services?page=1&pageSize=10')
    assert.equal(services.response.status, 200)
    assert.ok(Array.isArray(services.body.data.items))
    assert.equal(typeof services.body.data.total, 'number')
    assert.equal(services.body.data.page, 1)
    assert.equal(services.body.data.pageSize, 10)
    assert.ok(services.body.data.items.length > 0)

    const oneService = await request<{ items: any[] }>('/services?page=1&pageSize=1')
    const firstService = oneService.body.data.items[0]
    assert.equal(typeof firstService.id, 'number')
    assert.equal(typeof firstService.categoryId, 'number')
    assert.equal(typeof firstService.description, 'string')
    assert.equal(typeof firstService.coverImage, 'string')
    assert.equal(typeof firstService.basePrice, 'number')

    const detail = await request<any>(`/services/${firstService.id}`)
    assert.equal(detail.response.status, 200)
    assert.equal(detail.body.data.id, firstService.id)
    assert.equal(typeof detail.body.data.basePrice, 'number')

    const missing = await request('/services/999999999')
    assert.equal(missing.response.status, 404)
    assert.equal(missing.body.code, 40001)

    const badId = await request('/services/abc')
    assert.equal(badId.response.status, 400)
    assert.equal(badId.body.code, 10002)

    const badPage = await request('/services?page=0')
    assert.equal(badPage.response.status, 400)
    assert.equal(badPage.body.code, 10002)

    const badPageSize = await request('/services?pageSize=101')
    assert.equal(badPageSize.response.status, 400)
    assert.equal(badPageSize.body.code, 10002)

    const login = await request<any>('/auth/mock-login', {
      method: 'POST',
      body: JSON.stringify({ phone: '13800001111' }),
    })
    assert.equal(login.response.status, 200)
    assert.equal(login.body.code, 0)
    assert.equal(typeof login.body.data.accessToken, 'string')
    assert.equal(typeof login.body.data.expiresIn, 'number')
    assert.equal(typeof login.body.data.user.id, 'number')
    assert.ok(login.body.data.user.phone.includes('****'))

    const token = login.body.data.accessToken

    const me = await request<any>('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(me.response.status, 200)
    assert.equal(me.body.data.id, login.body.data.user.id)

    const noAuth = await request('/auth/me')
    assert.equal(noAuth.response.status, 401)
    assert.equal(noAuth.body.code, 20001)

    const badAuth = await request('/auth/me', {
      headers: { Authorization: 'Bearer invalid.token.here' },
    })
    assert.equal(badAuth.response.status, 401)
    assert.equal(badAuth.body.code, 20002)

    const profile = await request<any>('/auth/profile', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nickname: '测试用户', avatar: '' }),
    })
    assert.equal(profile.response.status, 200)
    assert.equal(profile.body.data.nickname, '测试用户')

    const login2 = await request<any>('/auth/mock-login', {
      method: 'POST',
      body: JSON.stringify({ phone: '13800001111' }),
    })
    assert.equal(login2.body.data.user.id, login.body.data.user.id)

    console.info('contract-test-ok')
  }
  finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

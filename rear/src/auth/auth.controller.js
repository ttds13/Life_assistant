const { readJsonBody } = require('../common/http/body')
const { verifyAuth } = require('../common/middleware/auth')
const authService = require('./auth.service')

async function wechatLogin(req) {
  const body = await readJsonBody(req)
  return authService.wechatLogin(body.loginCode, body.phoneCode)
}

async function mockLogin(req) {
  const body = await readJsonBody(req)
  return authService.mockLogin(body.phone)
}

async function getMe(req) {
  verifyAuth(req)
  return authService.getMe(req.context.user.userId)
}

async function updateProfile(req) {
  verifyAuth(req)
  const body = await readJsonBody(req)
  return authService.updateProfile(req.context.user.userId, body)
}

module.exports = { wechatLogin, mockLogin, getMe, updateProfile }

const jwt = require('jsonwebtoken')
const { config } = require('../config/env')
const { BusinessError } = require('../common/errors/business-error')
const { ErrorCode } = require('../common/errors/error-code')
const usersRepo = require('../users/users.repository')

function signToken(user) {
  const payload = { userId: user.id, phone: user.phone, role: user.role }
  const token = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn })
  return { accessToken: token, expiresIn: config.jwtExpiresIn }
}

function maskPhone(phone) {
  if (!phone || phone.length < 7) return phone
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`
}

function formatUser(user) {
  return {
    id: user.id,
    phone: maskPhone(user.phone),
    nickname: user.nickname,
    avatar: user.avatar,
    role: user.role,
  }
}

async function callWechatCode2Session(loginCode) {
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${config.wechatAppid}&secret=${config.wechatSecret}&js_code=${loginCode}&grant_type=authorization_code`
  const res = await fetch(url)
  const data = await res.json()
  if (data.errcode) {
    throw new BusinessError(ErrorCode.AUTH_WECHAT_FAIL, `微信登录失败: ${data.errmsg}`, 400)
  }
  return { openid: data.openid, sessionKey: data.session_key, unionid: data.unionid || '' }
}

async function callWechatGetPhoneNumber(phoneCode) {
  // 获取 access_token
  const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${config.wechatAppid}&secret=${config.wechatSecret}`
  const tokenRes = await fetch(tokenUrl)
  const tokenData = await tokenRes.json()
  if (tokenData.errcode) {
    throw new BusinessError(ErrorCode.AUTH_WECHAT_FAIL, `获取 access_token 失败: ${tokenData.errmsg}`, 400)
  }

  const phoneUrl = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${tokenData.access_token}`
  const phoneRes = await fetch(phoneUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: phoneCode }),
  })
  const phoneData = await phoneRes.json()
  if (phoneData.errcode) {
    throw new BusinessError(ErrorCode.AUTH_PHONE_REQUIRED, `获取手机号失败: ${phoneData.errmsg}`, 400)
  }
  return phoneData.phone_info.purePhoneNumber || phoneData.phone_info.phoneNumber
}

async function wechatLogin(loginCode, phoneCode) {
  // 1. 获取 openid
  const { openid, sessionKey, unionid } = await callWechatCode2Session(loginCode)

  // 2. 获取手机号
  const phone = await callWechatGetPhoneNumber(phoneCode)

  // 3. 查找或创建用户
  let user = await usersRepo.findUserByPhone(phone)
  if (!user) {
    const nickname = `用户_${phone.slice(-6)}`
    user = await usersRepo.createUser({ phone, nickname, avatar: '', role: 'user' })
  }

  if (user.status !== 1) {
    throw new BusinessError(ErrorCode.AUTH_USER_DISABLED, '账号已被禁用', 403)
  }

  // 4. 绑定或更新 oauth
  const existingOauth = await usersRepo.findOauthByProviderAndOpenid('wechat', openid)
  if (existingOauth) {
    await usersRepo.updateOauth(existingOauth.id, { sessionKey, unionid })
  }
  else {
    await usersRepo.createOauth({ userId: user.id, provider: 'wechat', openid, unionid, sessionKey })
  }

  // 5. 签发 token
  const tokenInfo = signToken(user)
  return { ...tokenInfo, user: formatUser(user) }
}

async function mockLogin(phone) {
  if (config.isProduction) {
    throw new BusinessError(ErrorCode.AUTH_FORBIDDEN, '生产环境禁用模拟登录', 403)
  }
  if (!phone || !/^1\d{10}$/.test(phone)) {
    throw new BusinessError(ErrorCode.COMMON_BAD_REQUEST, '手机号格式不正确', 400)
  }

  let user = await usersRepo.findUserByPhone(phone)
  if (!user) {
    const nickname = `用户_${phone.slice(-6)}`
    user = await usersRepo.createUser({ phone, nickname, avatar: '', role: 'user' })
  }

  if (user.status !== 1) {
    throw new BusinessError(ErrorCode.AUTH_USER_DISABLED, '账号已被禁用', 403)
  }

  const tokenInfo = signToken(user)
  return { ...tokenInfo, user: formatUser(user) }
}

async function getMe(userId) {
  const user = await usersRepo.findUserById(userId)
  if (!user) {
    throw new BusinessError(ErrorCode.AUTH_NOT_LOGIN, '用户不存在', 401)
  }
  return formatUser(user)
}

async function updateProfile(userId, { nickname, avatar }) {
  const fields = {}
  if (nickname !== undefined) fields.nickname = nickname.trim()
  if (avatar !== undefined) fields.avatar = avatar.trim()
  const user = await usersRepo.updateUser(userId, fields)
  if (!user) {
    throw new BusinessError(ErrorCode.AUTH_NOT_LOGIN, '用户不存在', 401)
  }
  return formatUser(user)
}

module.exports = { wechatLogin, mockLogin, getMe, updateProfile }

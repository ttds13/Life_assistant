import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import * as crypto from 'node:crypto'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import type { RequestWithContext } from '../common/utils/request-context'
import { PrismaService } from '../prisma/prisma.service'
import { ObjectStorageService } from '../storage/storage.service'
import { UserProfileRecord, UsersRepository } from '../users/users.repository'
import type { UpdateProfileDto } from './dto/update-profile.dto'

type AuthUserProfile = Omit<UserProfileRecord, 'role'> & { role: 'user' | 'staff' }

interface RefreshTokenSessionRow {
  id: bigint | number | string
  userId: bigint | number | string
  expiresAt: Date | string
  revokedAt: Date | string | null
}

interface RequestMeta {
  source: string
  deviceId: string | null
  userAgent: string | null
  ip: string | null
}

@Injectable()
export class AuthService {
  private refreshTokenTableReady = false

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ObjectStorageService) private readonly storage: ObjectStorageService,
  ) {}

  async mockLogin(phone?: string, request?: RequestWithContext) {
    this.assertMockLoginEnabled()

    const allowedPhone = this.config.get<string>('MOCK_LOGIN_PHONE', '13800001111').trim()
    const loginPhone = (phone || allowedPhone).trim()
    if (!/^1\d{10}$/.test(loginPhone)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid mock login phone', 400)
    }
    if (loginPhone !== allowedPhone) {
      throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, 'mock login phone is not allowed', 403)
    }

    let user = await this.users.findUserByPhone(loginPhone)
    const mockNickname = this.config.get<string>('MOCK_LOGIN_NICKNAME', '').trim()
    if (!user) {
      user = await this.users.createUser({
        phone: loginPhone,
        nickname: mockNickname || `Mock_${loginPhone.slice(-6)}`,
        avatar: '',
        openid: `mock_${loginPhone}`,
        unionid: '',
      })
    }

    if (user.status !== 1) {
      throw new BusinessException(ErrorCode.AUTH_USER_DISABLED, 'account disabled', 403)
    }

    const mockOpenid = `mock_${loginPhone}`
    if (!user.openid) {
      user = await this.users.updateUser(user.id, { openid: mockOpenid, unionid: '' }) || user
    }
    if (mockNickname && user.nickname !== mockNickname) {
      user = await this.users.updateUser(user.id, { nickname: mockNickname }) || user
    }

    const profile = await this.resolveUserProfile(user)
    return {
      ...await this.issueTokenPair(profile, request),
      user: this.formatUser(profile),
    }
  }

  async wechatLogin(loginCode: string, phoneCode: string, request?: RequestWithContext) {
    const { openid, unionid } = await this.callWechatCode2Session(loginCode)
    const phone = await this.callWechatGetPhoneNumber(phoneCode)

    let user = await this.users.findUserByPhone(phone)
    if (!user) {
      user = await this.users.findUserByOpenid(openid)
    }
    if (!user) {
      user = await this.users.createUser({
        phone,
        nickname: `User_${phone.slice(-6)}`,
        avatar: '',
        openid,
        unionid,
      })
    }

    if (user.status !== 1) {
      throw new BusinessException(ErrorCode.AUTH_USER_DISABLED, 'account disabled', 403)
    }

    if (!user.openid || user.openid !== openid || unionid) {
      user = await this.users.updateUser(user.id, { openid, unionid }) || user
    }

    const profile = await this.resolveUserProfile(user)
    return {
      ...await this.issueTokenPair(profile, request),
      user: this.formatUser(profile),
    }
  }

  async refresh(refreshToken: unknown, request?: RequestWithContext) {
    const token = this.normalizeRefreshToken(refreshToken)
    await this.ensureRefreshTokenTable()

    const tokenHash = this.hashRefreshToken(token)
    const sessions = await this.prisma.$queryRawUnsafe<RefreshTokenSessionRow[]>(
      'SELECT id, user_id AS userId, expires_at AS expiresAt, revoked_at AS revokedAt FROM user_refresh_tokens WHERE token_hash = ? LIMIT 1',
      tokenHash,
    )
    const session = sessions[0]
    if (!session) {
      throw new BusinessException(ErrorCode.AUTH_INVALID_TOKEN, 'refresh token invalid', 401)
    }
    if (session.revokedAt) {
      throw new BusinessException(ErrorCode.AUTH_INVALID_TOKEN, 'session revoked', 401)
    }
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      throw new BusinessException(ErrorCode.AUTH_NOT_LOGIN, 'refresh token expired', 401)
    }

    const user = await this.users.findUserById(Number(session.userId))
    if (!user) {
      throw new BusinessException(ErrorCode.AUTH_NOT_LOGIN, 'user not found', 401)
    }
    if (user.status !== 1) {
      throw new BusinessException(ErrorCode.AUTH_USER_DISABLED, 'account disabled', 403)
    }

    const profile = await this.resolveUserProfile(user)
    const tokenPair = await this.rotateRefreshSession(profile, session.id, request)
    return {
      ...tokenPair,
      user: this.formatUser(profile),
    }
  }

  async logout(refreshToken: unknown) {
    if (!refreshToken)
      return { success: true }

    await this.ensureRefreshTokenTable()
    const tokenHash = this.hashRefreshToken(String(refreshToken).trim())
    await this.prisma.$executeRawUnsafe(
      'UPDATE user_refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()), updated_at = NOW() WHERE token_hash = ?',
      tokenHash,
    )
    return { success: true }
  }

  async getMe(userId: number) {
    const user = await this.users.findUserById(userId)
    if (!user) {
      throw new BusinessException(ErrorCode.AUTH_NOT_LOGIN, 'user not found', 401)
    }
    return this.formatUser(await this.resolveUserProfile(user))
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    const fields: UpdateProfileDto = {}
    if (dto.nickname !== undefined) {
      fields.nickname = dto.nickname.trim()
      if (!fields.nickname) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'nickname cannot be empty', 400)
      }
      if (fields.nickname.length > 20) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'nickname too long', 400)
      }
    }
    if (dto.avatar !== undefined) {
      fields.avatar = dto.avatar.trim()
      this.storage.assertPermanentOssUrl(fields.avatar, { force: true })
    }

    const user = await this.users.updateUser(userId, fields)
    if (!user) {
      throw new BusinessException(ErrorCode.AUTH_NOT_LOGIN, 'user not found', 401)
    }
    return this.formatUser(await this.resolveUserProfile(user))
  }

  findActiveStaffForUser(userId: number | string) {
    const id = BigInt(userId)
    return this.prisma.staff.findFirst({
      where: {
        status: 1,
        deletedAt: null,
        userId: id,
      },
      select: { id: true, name: true, phone: true },
    })
  }

  private async issueTokenPair(user: AuthUserProfile, request?: RequestWithContext) {
    const access = await this.signToken(user)
    const refresh = await this.createRefreshSession(user.id, request)
    return {
      ...access,
      ...refresh,
      tokenType: 'Bearer' as const,
    }
  }

  private async rotateRefreshSession(user: AuthUserProfile, oldSessionId: RefreshTokenSessionRow['id'], request?: RequestWithContext) {
    const access = await this.signToken(user)
    const refreshToken = this.generateRefreshToken()
    const refreshExpiresIn = this.getRefreshExpiresInSeconds()
    const expiresAt = new Date(Date.now() + refreshExpiresIn * 1000)
    const tokenHash = this.hashRefreshToken(refreshToken)
    const meta = this.getRequestMeta(request)

    await this.ensureRefreshTokenTable()
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'INSERT INTO user_refresh_tokens (user_id, token_hash, source, device_id, user_agent, ip, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        BigInt(user.id),
        tokenHash,
        meta.source,
        meta.deviceId,
        meta.userAgent,
        meta.ip,
        expiresAt,
      )
      const created = await tx.$queryRawUnsafe<Array<{ id: bigint | number | string }>>('SELECT LAST_INSERT_ID() AS id')
      const replacementId = created[0]?.id || null

      await tx.$executeRawUnsafe(
        'UPDATE user_refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()), replaced_by_id = ?, updated_at = NOW() WHERE id = ?',
        replacementId,
        oldSessionId,
      )
    })

    return {
      ...access,
      refreshToken,
      refreshExpiresIn,
      tokenType: 'Bearer' as const,
    }
  }

  private async createRefreshSession(userId: number, request?: RequestWithContext) {
    const refreshToken = this.generateRefreshToken()
    const refreshExpiresIn = this.getRefreshExpiresInSeconds()
    const expiresAt = new Date(Date.now() + refreshExpiresIn * 1000)
    const tokenHash = this.hashRefreshToken(refreshToken)
    const meta = this.getRequestMeta(request)

    await this.ensureRefreshTokenTable()
    await this.prisma.$executeRawUnsafe(
      'INSERT INTO user_refresh_tokens (user_id, token_hash, source, device_id, user_agent, ip, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      BigInt(userId),
      tokenHash,
      meta.source,
      meta.deviceId,
      meta.userAgent,
      meta.ip,
      expiresAt,
    )

    return { refreshToken, refreshExpiresIn }
  }

  private async signToken(user: AuthUserProfile) {
    const expiresIn = this.getAccessTokenExpiresIn()
    const accessToken = await this.jwt.signAsync(
      { userId: user.id, phone: user.phone, role: user.role },
      { expiresIn },
    )
    return { accessToken, expiresIn }
  }

  private getAccessTokenExpiresIn() {
    const raw = String(
      this.config.get<string | number>('JWT_ACCESS_EXPIRES_IN')
      ?? this.config.get<string | number>('JWT_EXPIRES_IN', 7200),
    ).trim()
    return this.parseDurationToSeconds(raw, 7200)
  }

  private getRefreshExpiresInSeconds() {
    const days = Number(this.config.get<string | number>('REFRESH_TOKEN_TTL_DAYS', 30))
    return Math.max(1, Number.isFinite(days) ? Math.floor(days * 86400) : 2592000)
  }

  private parseDurationToSeconds(value: string, fallback: number) {
    if (/^\d+$/.test(value))
      return Number(value)

    const match = value.match(/^(\d+)([smhd])$/i)
    if (!match)
      return fallback

    const amount = Number(match[1])
    const unit = match[2].toLowerCase() as 's' | 'm' | 'h' | 'd'
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 }
    return amount * multipliers[unit]
  }

  private normalizeRefreshToken(refreshToken: unknown) {
    const token = typeof refreshToken === 'string' ? refreshToken.trim() : ''
    if (!token) {
      throw new BusinessException(ErrorCode.AUTH_NOT_LOGIN, 'refresh token required', 401)
    }
    return token
  }

  private generateRefreshToken() {
    return `rt_${crypto.randomBytes(32).toString('base64url')}`
  }

  private hashRefreshToken(refreshToken: string) {
    const pepper = this.config.get<string>('REFRESH_TOKEN_PEPPER', '')
    return crypto.createHash('sha256').update(`${refreshToken}${pepper}`).digest('hex')
  }

  private getRequestMeta(request?: RequestWithContext): RequestMeta {
    const forwardedFor = request?.headers?.['x-forwarded-for']
    const rawIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor || request?.ip || request?.socket?.remoteAddress || ''
    const ip = String(rawIp).split(',')[0].trim()

    return {
      source: String(request?.headers?.['x-request-source'] || 'miniapp').slice(0, 32),
      deviceId: String(request?.headers?.['x-device-id'] || '').slice(0, 128) || null,
      userAgent: String(request?.headers?.['user-agent'] || '').slice(0, 255) || null,
      ip: ip.slice(0, 64) || null,
    }
  }

  private async ensureRefreshTokenTable() {
    if (this.refreshTokenTableReady)
      return

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS user_refresh_tokens (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        token_hash VARCHAR(128) NOT NULL UNIQUE,
        source VARCHAR(32) DEFAULT 'miniapp',
        device_id VARCHAR(128) NULL,
        user_agent VARCHAR(255) NULL,
        ip VARCHAR(64) NULL,
        expires_at DATETIME NOT NULL,
        revoked_at DATETIME NULL,
        replaced_by_id BIGINT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_expires_at (expires_at)
      )
    `)
    this.refreshTokenTableReady = true
  }

  private formatUser(user: AuthUserProfile) {
    const avatarOssUrl = user.avatar
    const avatar = this.storage.signNullableUrl(avatarOssUrl) || avatarOssUrl
    return {
      id: user.id,
      phone: user.phone,
      nickname: user.nickname,
      avatar,
      avatarOssUrl,
      avatarDisplayUrl: avatar,
      role: user.role,
    }
  }

  private async resolveUserProfile(user: UserProfileRecord): Promise<AuthUserProfile> {
    const staff = await this.findActiveStaffForUser(user.id)
    return {
      ...user,
      role: staff ? 'staff' : 'user',
    }
  }

  private assertMockLoginEnabled() {
    if (this.config.get<string>('MOCK_LOGIN_ENABLED', 'false') !== 'true') {
      throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, 'mock login disabled', 403)
    }
  }

  private async callWechatCode2Session(loginCode: string): Promise<{ openid: string, unionid: string }> {
    const appid = this.config.get<string>('WECHAT_APPID', '')
    const secret = this.config.get<string>('WECHAT_SECRET', '')
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${loginCode}&grant_type=authorization_code`
    const response = await fetch(url)
    const data = await response.json() as Record<string, string | number>
    if (data.errcode) {
      throw new BusinessException(ErrorCode.AUTH_WECHAT_FAIL, `wechat login failed: ${data.errmsg || data.errcode}`, 400)
    }
    return {
      openid: String(data.openid || ''),
      unionid: String(data.unionid || ''),
    }
  }

  private async callWechatGetPhoneNumber(phoneCode: string): Promise<string> {
    const appid = this.config.get<string>('WECHAT_APPID', '')
    const secret = this.config.get<string>('WECHAT_SECRET', '')
    const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`
    const tokenResponse = await fetch(tokenUrl)
    const tokenData = await tokenResponse.json() as Record<string, string | number>
    if (tokenData.errcode) {
      throw new BusinessException(ErrorCode.AUTH_WECHAT_FAIL, `get access_token failed: ${tokenData.errmsg || tokenData.errcode}`, 400)
    }

    const phoneUrl = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${tokenData.access_token}`
    const phoneResponse = await fetch(phoneUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: phoneCode }),
    })
    const phoneData = await phoneResponse.json() as {
      errcode?: number
      errmsg?: string
      phone_info?: {
        purePhoneNumber?: string
        phoneNumber?: string
      }
    }
    if (phoneData.errcode) {
      throw new BusinessException(ErrorCode.AUTH_PHONE_REQUIRED, `get phone number failed: ${phoneData.errmsg || phoneData.errcode}`, 400)
    }

    const phone = phoneData.phone_info?.purePhoneNumber || phoneData.phone_info?.phoneNumber
    if (!phone) {
      throw new BusinessException(ErrorCode.AUTH_PHONE_REQUIRED, 'phone number is required', 400)
    }
    return phone
  }
}

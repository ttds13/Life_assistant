import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { PrismaService } from '../prisma/prisma.service'
import { ObjectStorageService } from '../storage/storage.service'
import { UserProfileRecord, UsersRepository } from '../users/users.repository'
import type { UpdateProfileDto } from './dto/update-profile.dto'

type AuthUserProfile = Omit<UserProfileRecord, 'role'> & { role: 'user' | 'staff' }

@Injectable()
export class AuthService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ObjectStorageService) private readonly storage: ObjectStorageService,
  ) {}

  async mockLogin(phone?: string) {
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
    if (!user) {
      user = await this.users.createUser({
        phone: loginPhone,
        nickname: `Mock_${loginPhone.slice(-6)}`,
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

    const profile = await this.resolveUserProfile(user)
    return {
      ...await this.signToken(profile),
      user: this.formatUser(profile),
    }
  }

  async wechatLogin(loginCode: string, phoneCode: string) {
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
      ...await this.signToken(profile),
      user: this.formatUser(profile),
    }
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
    if (dto.nickname !== undefined) fields.nickname = dto.nickname.trim()
    if (dto.avatar !== undefined) {
      fields.avatar = dto.avatar.trim()
      this.storage.assertPermanentOssUrl(fields.avatar)
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

  private async signToken(user: AuthUserProfile) {
    const expiresIn = Number(this.config.get<string | number>('JWT_EXPIRES_IN', 604800))
    const accessToken = await this.jwt.signAsync(
      { userId: user.id, phone: user.phone, role: user.role },
      { expiresIn },
    )
    return { accessToken, expiresIn }
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

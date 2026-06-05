import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { UsersRepository, UserProfileRecord } from '../users/users.repository'
import type { UpdateProfileDto } from './dto/update-profile.dto'

type AuthUserProfile = Omit<UserProfileRecord, 'role'> & { role: 'user' | 'staff' }

@Injectable()
export class AuthService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async mockLogin(phone: string) {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, '生产环境禁用模拟登录', 403)
    }

    let user = await this.users.findUserByPhone(phone)
    if (!user) {
      user = await this.users.createUser({
        phone,
        nickname: `用户_${phone.slice(-6)}`,
        avatar: '',
      })
    }

    if (user.status !== 1) {
      throw new BusinessException(ErrorCode.AUTH_USER_DISABLED, '账号已被禁用', 403)
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
        nickname: `用户_${phone.slice(-6)}`,
        avatar: '',
        openid,
        unionid,
      })
    }

    if (user.status !== 1) {
      throw new BusinessException(ErrorCode.AUTH_USER_DISABLED, '账号已被禁用', 403)
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
      throw new BusinessException(ErrorCode.AUTH_NOT_LOGIN, '用户不存在', 401)
    }
    return this.formatUser(await this.resolveUserProfile(user))
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    const fields: UpdateProfileDto = {}
    if (dto.nickname !== undefined) fields.nickname = dto.nickname.trim()
    if (dto.avatar !== undefined) fields.avatar = dto.avatar.trim()

    const user = await this.users.updateUser(userId, fields)
    if (!user) {
      throw new BusinessException(ErrorCode.AUTH_NOT_LOGIN, '用户不存在', 401)
    }
    return this.formatUser(await this.resolveUserProfile(user))
  }

  async createDevStaffSession(userId: number) {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, 'dev staff session disabled', 403)
    }

    const user = await this.users.findUserById(userId)
    if (!user) {
      throw new BusinessException(ErrorCode.AUTH_NOT_LOGIN, 'user not found', 401)
    }

    const staff = await this.findActiveStaffForUser(user.id)
    if (!staff) {
      throw new BusinessException(ErrorCode.STAFF_FORBIDDEN, 'staff role is not enabled', 403)
    }

    return {
      staffId: Number(staff.id),
      userId: user.id,
      phone: user.phone,
      staffName: staff.name,
      staffPhone: staff.phone,
    }
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
    return {
      id: user.id,
      phone: user.phone,
      nickname: user.nickname,
      avatar: user.avatar,
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

  private findActiveStaffForUser(userId: number | string) {
    const id = BigInt(userId)
    return this.prisma.staff.findFirst({
      where: {
        status: 1,
        deletedAt: null,
        OR: [
          { userId: id },
          { uuid: this.devStaffUuid(userId) },
        ],
      },
      select: { id: true, name: true, phone: true },
    })
  }

  private devStaffUuid(userId: number | string) {
    return `dev-staff-user-${String(userId)}`
  }

  private async callWechatCode2Session(loginCode: string): Promise<{ openid: string, unionid: string }> {
    const appid = this.config.get<string>('WECHAT_APPID', '')
    const secret = this.config.get<string>('WECHAT_SECRET', '')
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${loginCode}&grant_type=authorization_code`
    const response = await fetch(url)
    const data = await response.json() as Record<string, string | number>
    if (data.errcode) {
      throw new BusinessException(ErrorCode.AUTH_WECHAT_FAIL, `微信登录失败: ${data.errmsg || data.errcode}`, 400)
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
      throw new BusinessException(ErrorCode.AUTH_WECHAT_FAIL, `获取 access_token 失败: ${tokenData.errmsg || tokenData.errcode}`, 400)
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
      throw new BusinessException(ErrorCode.AUTH_PHONE_REQUIRED, `获取手机号失败: ${phoneData.errmsg || phoneData.errcode}`, 400)
    }

    const phone = phoneData.phone_info?.purePhoneNumber || phoneData.phone_info?.phoneNumber
    if (!phone) {
      throw new BusinessException(ErrorCode.AUTH_PHONE_REQUIRED, '获取手机号失败', 400)
    }
    return phone
  }
}
